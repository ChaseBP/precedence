"use client";

/**
 * Direct reads and writes against the Sepolia PriorityVault from the browser.
 *
 * @remarks Race state is read from the **vault**, never from our own store. The store is a cache
 * of what we believe; the vault is what a proof will actually attest to. If those disagree — a
 * race closed since we last polled, a lock landed from elsewhere — the vault is right, and a
 * lender about to spend real money deserves the authoritative answer.
 *
 * Writes go through the user's own wallet. There is no server-side signer for locking, and there
 * must not be: the whole claim is that a financier's rank comes from where *their* transaction
 * landed, which is only true if they sent it.
 */
import { createPublicClient, custom, http, type Address, type Hex, type WalletClient } from "viem";
import { sepolia } from "viem/chains";
import { PriorityVault_ABI, PUSD_ABI } from "@/lib/precedence/adapters/generated/abis";

export interface VaultAddresses {
  PUSD: Address;
  PriorityVault: Address;
}

/** Race state as the vault itself reports it. */
export interface VaultRaceState {
  registered: boolean;
  raceOpen: boolean;
  raceNonce: number;
  lockCount: number;
  facilitySizeUsd: number;
  totalLockedUsd: number;
  raceDeadline: number;
  secondsLeft: number;
}

export interface LenderPosition {
  pusdUsd: number;
  allowanceUsd: number;
  ethWei: bigint;
}

const D = 1_000_000n;
const toUsd = (v: bigint) => Number(v) / 1e6;
const toUnits = (usd: number) => BigInt(Math.round(usd * 1e6));

/**
 * A read-only client for Sepolia.
 *
 * @remarks Uses the injected wallet's own transport when there is one, so reads go through the
 * provider the user already trusts and we ship no RPC key to the browser. Falls back to a public
 * endpoint purely so the race state is visible before anyone connects.
 */
function publicClient() {
  const eth = typeof window !== "undefined" ? window.ethereum : undefined;
  return createPublicClient({
    chain: sepolia,
    transport: eth ? custom(eth) : http("https://ethereum-sepolia-rpc.publicnode.com"),
  });
}

export async function readRaceState(vault: Address, collateralId: Hex): Promise<VaultRaceState> {
  const c = (await publicClient().readContract({
    address: vault,
    abi: PriorityVault_ABI,
    functionName: "getCollateral",
    args: [collateralId],
  })) as {
    registered: boolean;
    raceOpen: boolean;
    raceNonce: bigint;
    lockCount: bigint;
    facilitySize: bigint;
    raceDeadline: bigint;
    totalLocked: bigint;
  };

  const deadline = Number(c.raceDeadline);
  return {
    registered: c.registered,
    raceOpen: c.raceOpen,
    raceNonce: Number(c.raceNonce),
    lockCount: Number(c.lockCount),
    facilitySizeUsd: toUsd(c.facilitySize),
    totalLockedUsd: toUsd(c.totalLocked),
    raceDeadline: deadline,
    secondsLeft: Math.max(0, deadline - Math.floor(Date.now() / 1000)),
  };
}

export async function readLenderPosition(
  addrs: VaultAddresses,
  who: Address,
): Promise<LenderPosition> {
  const pc = publicClient();
  const [bal, allow, eth] = await Promise.all([
    pc.readContract({ address: addrs.PUSD, abi: PUSD_ABI, functionName: "balanceOf", args: [who] }) as Promise<bigint>,
    pc.readContract({
      address: addrs.PUSD,
      abi: PUSD_ABI,
      functionName: "allowance",
      args: [who, addrs.PriorityVault],
    }) as Promise<bigint>,
    pc.getBalance({ address: who }),
  ]);
  return { pusdUsd: toUsd(bal), allowanceUsd: toUsd(allow), ethWei: eth };
}

export type LockStage = "approving" | "approved" | "locking" | "locked";

/**
 * Approve if needed, then lock.
 *
 * @remarks Two transactions, and the approval is skipped when the existing allowance already
 * covers the amount — asking someone to sign a redundant approval is how a demo loses its
 * audience. The lock is sent second and deliberately not batched: its position in its block is
 * the thing being proven, so it must be its own transaction.
 */
export async function approveAndLock(
  wallet: WalletClient,
  addrs: VaultAddresses,
  collateralId: Hex,
  trancheOrdinal: 0 | 1 | 2,
  amountUsd: number,
  onStage: (s: LockStage, detail?: string) => void,
): Promise<{ lockTxHash: Hex; blockNumber: number; txIndex: number }> {
  const account = wallet.account;
  if (!account) throw new Error("wallet has no account");
  const pc = publicClient();
  const amount = toUnits(amountUsd);

  const allowance = (await pc.readContract({
    address: addrs.PUSD,
    abi: PUSD_ABI,
    functionName: "allowance",
    args: [account.address, addrs.PriorityVault],
  })) as bigint;

  if (allowance < amount) {
    onStage("approving", "approve pUSD to the vault");
    const approveHash = await wallet.writeContract({
      address: addrs.PUSD,
      abi: PUSD_ABI,
      functionName: "approve",
      args: [addrs.PriorityVault, amount],
      account,
      chain: sepolia,
    });
    const r = await pc.waitForTransactionReceipt({ hash: approveHash });
    if (r.status !== "success") throw new Error(`approval reverted: ${approveHash}`);
    onStage("approved", approveHash);
  } else {
    onStage("approved", "existing allowance already covers this amount");
  }

  onStage("locking", "lock capital into the tranche");
  const lockHash = await wallet.writeContract({
    address: addrs.PriorityVault,
    abi: PriorityVault_ABI,
    functionName: "lock",
    args: [collateralId, trancheOrdinal, amount],
    account,
    chain: sepolia,
  });
  const receipt = await pc.waitForTransactionReceipt({ hash: lockHash });
  if (receipt.status !== "success") throw new Error(`lock reverted: ${lockHash}`);

  onStage("locked", lockHash);
  // These two numbers ARE the priority claim. Returned so the UI can show the lender the exact
  // position they will be ranked by, rather than a vague "submitted".
  return {
    lockTxHash: lockHash,
    blockNumber: Number(receipt.blockNumber),
    txIndex: receipt.transactionIndex,
  };
}

export const usdUnits = { toUsd, toUnits, D };
