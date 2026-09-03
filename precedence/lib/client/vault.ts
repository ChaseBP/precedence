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
import type { Address, Hex } from "viem";
import { getAccount, readContract, waitForTransactionReceipt, writeContract } from "wagmi/actions";
import { PriorityVault_ABI, PUSD_ABI } from "@/lib/precedence/adapters/generated/abis";
import { sepolia } from "./chains";
import { wagmiConfig } from "./wagmi";

export interface VaultAddresses {
  PUSD: Address;
  PriorityVault: Address;
}

/** Race and servicing state as the vault itself reports it. */
export interface VaultRaceState {
  registered: boolean;
  raceOpen: boolean;
  raceNonce: number;
  lockCount: number;
  facilitySizeUsd: number;
  totalLockedUsd: number;
  raceDeadline: number;
  secondsLeft: number;
  /** The obligor of record on the VAULT. Role is derived from this, never from a stored profile. */
  obligor: Address;
  totalDrawnUsd: number;
  totalRepaidUsd: number;
  /** Draw deadline. Zero until the race closes. */
  drawDeadline: number;
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
 * Reads and writes both go through the wagmi config.
 *
 * @remarks The important consequence is that every write carries `chainId`, so wagmi prompts the
 * network switch AS PART OF SIGNING. Previously these used a raw viem wallet client, which simply
 * throws on the wrong chain — which is why the UI had to grow "switch network" buttons and make
 * the user satisfy a precondition before it would let them act.
 */
const SEPOLIA = sepolia.id;

/** The connected address, or a readable failure instead of a confusing ABI error. */
function requireAccount(): Address {
  const { address } = getAccount(wagmiConfig);
  if (!address) throw new Error("No wallet is connected.");
  return address;
}

export async function readRaceState(vault: Address, collateralId: Hex): Promise<VaultRaceState> {
  const c = (await readContract(wagmiConfig, {
    chainId: SEPOLIA,
    address: vault,
    abi: PriorityVault_ABI,
    functionName: "getCollateral",
    args: [collateralId],
  })) as {
    obligor: Address;
    registered: boolean;
    raceOpen: boolean;
    raceNonce: bigint;
    lockCount: bigint;
    facilitySize: bigint;
    raceDeadline: bigint;
    drawDeadline: bigint;
    totalLocked: bigint;
    totalDrawn: bigint;
    totalRepaid: bigint;
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
    obligor: c.obligor,
    totalDrawnUsd: toUsd(c.totalDrawn),
    totalRepaidUsd: toUsd(c.totalRepaid),
    drawDeadline: Number(c.drawDeadline),
  };
}

/** One of the connected wallet's own locks, and what it can still reclaim. */
export interface MyLock {
  index: number;
  tranche: 0 | 1 | 2;
  amountUsd: number;
  allocatedUsd: number;
  refundedUsd: number;
  /** What `refund(collateralId, index)` would return right now. */
  refundableUsd: number;
  seq: number;
}

/**
 * Servicing totals plus the connected wallet's own locks.
 *
 * @remarks `allocatedAmount` is the VAULT's view: it fills locks first-come by index up to
 * `facilitySize`, with no notion of tranches. The tranche-aware waterfall runs on Creditcoin from
 * the proven ordering. Both matter — the vault decides what is drawable and refundable in pUSD,
 * Creditcoin decides who holds which rank — and conflating them would misreport one or the other.
 */
export async function readMyLocks(
  vault: Address,
  collateralId: Hex,
  raceNonce: number,
  lockCount: number,
  who: Address,
  abandoned: boolean,
): Promise<MyLock[]> {
  const out: MyLock[] = [];

  for (let i = 0; i < lockCount; i++) {
    const l = (await readContract(wagmiConfig, {
      chainId: SEPOLIA,
      address: vault,
      abi: PriorityVault_ABI,
      functionName: "lockAtRace",
      args: [collateralId, BigInt(raceNonce), BigInt(i)],
    })) as { financier: Address; tranche: number; amount: bigint; refunded: bigint; seq: bigint };

    if (l.financier.toLowerCase() !== who.toLowerCase()) continue;

    const allocated = abandoned
      ? 0n
      : ((await readContract(wagmiConfig, {
          chainId: SEPOLIA,
          address: vault,
          abi: PriorityVault_ABI,
          functionName: "allocatedAmount",
          args: [collateralId, BigInt(i)],
        })) as bigint);

    out.push({
      index: i,
      tranche: l.tranche as 0 | 1 | 2,
      amountUsd: toUsd(l.amount),
      allocatedUsd: toUsd(allocated),
      refundedUsd: toUsd(l.refunded),
      refundableUsd: toUsd(l.amount - allocated - l.refunded),
      seq: Number(l.seq),
    });
  }
  return out;
}

/**
 * What the vault has actually allocated, which is what caps a draw.
 *
 * @remarks NOT the facility size. If lenders locked less than the borrower asked for, allocation
 * stops at what arrived — so showing `facilitySize - drawn` as "drawable" would offer a number the
 * contract rejects, and the borrower would meet a revert instead of a limit.
 */
export async function readTotalAllocated(vault: Address, collateralId: Hex): Promise<number> {
  return toUsd(
    (await readContract(wagmiConfig, {
      chainId: SEPOLIA,
      address: vault,
      abi: PriorityVault_ABI,
      functionName: "totalAllocated",
      args: [collateralId],
    })) as bigint,
  );
}

export async function readIsAbandoned(vault: Address, collateralId: Hex): Promise<boolean> {
  return (await readContract(wagmiConfig, {
    chainId: SEPOLIA,
    address: vault,
    abi: PriorityVault_ABI,
    functionName: "isAbandoned",
    args: [collateralId],
  })) as boolean;
}

/** Draw allocated capital. Obligor only, and only once the race has closed. */
export async function drawCapital(
  vault: Address,
  collateralId: Hex,
  amountUsd: number,
): Promise<Hex> {
  const hash = await writeContract(wagmiConfig, {
    chainId: SEPOLIA,
    address: vault,
    abi: PriorityVault_ABI,
    functionName: "draw",
    args: [collateralId, toUnits(amountUsd)],
  });
  const r = await waitForTransactionReceipt(wagmiConfig, { chainId: SEPOLIA, hash });
  if (r.status !== "success") throw new Error(`draw reverted: ${hash}`);
  return hash;
}

/**
 * Repay into the vault.
 *
 * @remarks The figure the WATERFALL uses is decoded from this transaction on Creditcoin, not from
 * anything asserted off-chain — which is why the obligor cannot overstate a repayment and there is
 * no adjuster to trust. This call only moves the tokens and emits the event a proof will read.
 */
export async function repayFacility(
  addrs: VaultAddresses,
  collateralId: Hex,
  amountUsd: number,
  onStage: (s: "approving" | "repaying") => void,
): Promise<Hex> {
  const amount = toUnits(amountUsd);
  const owner = requireAccount();

  const allowance = (await readContract(wagmiConfig, {
    chainId: SEPOLIA,
    address: addrs.PUSD,
    abi: PUSD_ABI,
    functionName: "allowance",
    args: [owner, addrs.PriorityVault],
  })) as bigint;

  if (allowance < amount) {
    onStage("approving");
    const a = await writeContract(wagmiConfig, {
      chainId: SEPOLIA,
      address: addrs.PUSD,
      abi: PUSD_ABI,
      functionName: "approve",
      args: [addrs.PriorityVault, amount],
    });
    const ar = await waitForTransactionReceipt(wagmiConfig, { chainId: SEPOLIA, hash: a });
    if (ar.status !== "success") throw new Error(`approval reverted: ${a}`);
  }

  onStage("repaying");
  const hash = await writeContract(wagmiConfig, {
    chainId: SEPOLIA,
    address: addrs.PriorityVault,
    abi: PriorityVault_ABI,
    functionName: "repay",
    args: [collateralId, amount],
  });
  const r = await waitForTransactionReceipt(wagmiConfig, { chainId: SEPOLIA, hash });
  if (r.status !== "success") throw new Error(`repay reverted: ${hash}`);
  return hash;
}

/** Reclaim capital that was never allocated — or all of it, if the facility was abandoned. */
export async function refundLock(
  vault: Address,
  collateralId: Hex,
  index: number,
): Promise<Hex> {
  const hash = await writeContract(wagmiConfig, {
    chainId: SEPOLIA,
    address: vault,
    abi: PriorityVault_ABI,
    functionName: "refund",
    args: [collateralId, BigInt(index)],
  });
  const r = await waitForTransactionReceipt(wagmiConfig, { chainId: SEPOLIA, hash });
  if (r.status !== "success") throw new Error(`refund reverted: ${hash}`);
  return hash;
}

export async function readLenderPosition(
  addrs: VaultAddresses,
  who: Address,
): Promise<LenderPosition> {
  const [bal, allow] = await Promise.all([
    readContract(wagmiConfig, {
      chainId: SEPOLIA, address: addrs.PUSD, abi: PUSD_ABI, functionName: "balanceOf", args: [who],
    }) as Promise<bigint>,
    readContract(wagmiConfig, {
      chainId: SEPOLIA, address: addrs.PUSD, abi: PUSD_ABI, functionName: "allowance",
      args: [who, addrs.PriorityVault],
    }) as Promise<bigint>,
  ]);
  return { pusdUsd: toUsd(bal), allowanceUsd: toUsd(allow), ethWei: 0n };
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
  addrs: VaultAddresses,
  collateralId: Hex,
  trancheOrdinal: 0 | 1 | 2,
  amountUsd: number,
  /**
   * Consent to being seated in a LOWER tranche if the declared one is already full.
   *
   * @remarks Sent in the lock transaction because it is the financier's to give, and the wallet
   * signing this transaction is theirs. It used to be supplied by whoever proved the race.
   */
  allowDemotion: boolean,
  onStage: (s: LockStage, detail?: string) => void,
): Promise<{ lockTxHash: Hex; blockNumber: number; txIndex: number }> {
  const amount = toUnits(amountUsd);
  const owner = requireAccount();

  const allowance = (await readContract(wagmiConfig, {
    chainId: SEPOLIA,
    address: addrs.PUSD,
    abi: PUSD_ABI,
    functionName: "allowance",
    args: [owner, addrs.PriorityVault],
  })) as bigint;

  if (allowance < amount) {
    onStage("approving", "approve pUSD to the vault");
    const approveHash = await writeContract(wagmiConfig, {
      chainId: SEPOLIA,
      address: addrs.PUSD,
      abi: PUSD_ABI,
      functionName: "approve",
      args: [addrs.PriorityVault, amount],
    });
    const r = await waitForTransactionReceipt(wagmiConfig, { chainId: SEPOLIA, hash: approveHash });
    if (r.status !== "success") throw new Error(`approval reverted: ${approveHash}`);
    onStage("approved", approveHash);
  } else {
    onStage("approved", "existing allowance already covers this amount");
  }

  onStage("locking", "lock capital into the tranche");
  const lockHash = await writeContract(wagmiConfig, {
    chainId: SEPOLIA,
    address: addrs.PriorityVault,
    abi: PriorityVault_ABI,
    functionName: "lock",
    args: [collateralId, trancheOrdinal, amount, allowDemotion],
  });
  const receipt = await waitForTransactionReceipt(wagmiConfig, { chainId: SEPOLIA, hash: lockHash });
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
