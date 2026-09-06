/**
 * Read-only Sepolia access for verifying what a browser claims it did.
 *
 * @remarks Separate from {@link ChainSepoliaClient} on purpose. That client is a *writer*: it
 * demands per-role private keys and throws naming the missing env var, so it is unavailable in
 * exactly the deployment this file has to work in — one where the lender signs from their own
 * wallet and the server holds no keys at all.
 *
 * The reason this exists is trust. A browser that has just locked capital knows its transaction
 * hash, its block and its index, and the obvious shortcut is to let it POST those and store them.
 * That shortcut would make every figure in a settlement client-assertable, which is the one thing
 * this project cannot allow: a lender's rank IS `(height, txIndex)`, so accepting those numbers
 * from whoever benefits from them is the same as having no proof. Every number a live race carries
 * is therefore decoded here, out of a receipt fetched from an RPC, from a log the deployed vault
 * emitted. The client supplies a transaction hash and nothing else.
 *
 * Falls back to viem's public Sepolia transport when `SEPOLIA_RPC` is unset. Still a real chain
 * read — a slower one — which matters because the alternative is refusing to verify a genuine
 * lock on a fresh clone and leaving the live path unreachable.
 */
import {
  createPublicClient,
  decodeEventLog,
  http,
  type Address,
  type Hex as ViemHex,
  type PublicClient,
} from "viem";
import { sepolia } from "viem/chains";
import { getConfig, loadDeployedAddresses } from "../../config";
import type { Hex, Tranche } from "../../types";
import { PriorityVault_ABI } from "../generated/abis";

const TRANCHE_NAME: Tranche[] = ["SENIOR", "JUNIOR", "SUBORDINATE"];
const PUSD_DECIMALS = 6;
const fromUnits = (v: bigint): number => Number(v) / 10 ** PUSD_DECIMALS;

export const SEPOLIA_CHAIN_ID = 11155111;

/**
 * The chain does not support the claim being made.
 *
 * @remarks Distinguished from a transport failure on purpose, because the two deserve different
 * answers and different HTTP statuses. "That transaction emitted no lock for this facility" is a
 * complete, correct answer about the caller's request; "the RPC did not respond" is not an answer
 * at all. Collapsing them meant a caller submitting someone else's receipt was told the server had
 * a problem, and would sit there retrying.
 */
export class NotVerifiableError extends Error {}

/** The vault's view of a collateral, straight from storage. */
export interface OnChainRaceState {
  obligor: Address;
  registered: boolean;
  raceOpen: boolean;
  raceNonce: number;
  lockCount: number;
  facilitySizeUsd: number;
  totalLockedUsd: number;
  raceDeadline: number;
}

/** One `Lock_` event, decoded from the receipt that emitted it. */
export interface VerifiedLock {
  collateralId: Hex;
  financier: Address;
  tranche: Tranche;
  amountUsd: number;
  token: Address;
  raceNonce: number;
  seq: number;
  /** Written by the vault into the event. Cross-checked against the receipt below. */
  eventBlockNumber: number;
  allowDemotion: boolean;
  /** From the receipt, not the event — the canonical source-block position. */
  blockNumber: number;
  txIndex: number;
  txHash: Hex;
  emittedBy: Address;
}

/** One `RaceOpened` event, decoded from the receipt that emitted it. */
export interface VerifiedRaceOpen {
  collateralId: Hex;
  raceNonce: number;
  facilitySizeUsd: number;
  deadline: number;
  blockNumber: number;
  txIndex: number;
  txHash: Hex;
  emittedBy: Address;
}

export class SepoliaReader {
  readonly vaultAddress: Address;
  private readonly client: PublicClient;

  constructor(vaultAddress: Address, rpcUrl: string) {
    this.vaultAddress = vaultAddress;
    this.client = createPublicClient({
      chain: sepolia,
      // Empty string means "use viem's default for this chain", which is the intended fallback.
      transport: http(rpcUrl || undefined),
    });
  }

  /** The source chain's head, for reporting how far attestation trails it. */
  async blockNumber(): Promise<number> {
    return Number(await this.client.getBlockNumber());
  }

  async raceState(collateralId: Hex): Promise<OnChainRaceState> {
    const c = (await this.client.readContract({
      address: this.vaultAddress,
      abi: PriorityVault_ABI,
      functionName: "getCollateral",
      args: [collateralId as ViemHex],
    })) as {
      obligor: Address;
      registered: boolean;
      raceOpen: boolean;
      raceNonce: bigint;
      lockCount: bigint;
      facilitySize: bigint;
      raceDeadline: bigint;
      totalLocked: bigint;
    };
    return {
      obligor: c.obligor,
      registered: c.registered,
      raceOpen: c.raceOpen,
      raceNonce: Number(c.raceNonce),
      lockCount: Number(c.lockCount),
      facilitySizeUsd: fromUnits(c.facilitySize),
      totalLockedUsd: fromUnits(c.totalLocked),
      raceDeadline: Number(c.raceDeadline),
    };
  }

  /**
   * Decode one of the vault's events out of a transaction receipt.
   *
   * @remarks Three separate checks, and each one closes a different hole:
   *
   *  - `status === "success"` because the precompile does not check it and a reverted transaction
   *    still has a hash, a block and an index. A reverted lock that ranked would be a free rank.
   *  - the log's `address` must be the deployed vault, so a look-alike contract emitting an
   *    identically-shaped event cannot mint a position in a real race.
   *  - the event's own `collateralId` must be the one asked about, so a receipt from a *different*
   *    facility cannot be replayed into this one.
   */
  private async decode<T>(
    txHash: Hex,
    eventName: "Lock_" | "RaceOpened",
    collateralId: Hex,
    build: (args: Record<string, unknown>, r: { blockNumber: number; txIndex: number }) => T,
  ): Promise<T> {
    if (!/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
      throw new NotVerifiableError(`"${txHash}" is not a transaction hash.`);
    }

    let receipt;
    try {
      receipt = await this.client.getTransactionReceipt({ hash: txHash as ViemHex });
    } catch (e) {
      // viem raises the same shape whether the hash is wrong or the transaction is simply not
      // mined on the node being asked. Both are answers about the request rather than faults, and
      // the caller's move in either case is to wait a moment and resubmit the same hash.
      if ((e as Error).name === "TransactionReceiptNotFoundError") {
        throw new NotVerifiableError(
          `Sepolia has no receipt for ${txHash}. Either it is not mined yet — the node being ` +
            `asked may be a block or two behind — or that is not the hash of a transaction.`,
        );
      }
      throw e;
    }

    if (receipt.status !== "success") {
      throw new NotVerifiableError(
        `Sepolia transaction ${txHash} reverted, so it cannot be recorded. A reverted transaction ` +
          `still has a block and an index, which is exactly why status is checked here — the ` +
          `precompile does not check it.`,
      );
    }

    const want = collateralId.toLowerCase();
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() !== this.vaultAddress.toLowerCase()) continue;
      let decoded;
      try {
        decoded = decodeEventLog({ abi: PriorityVault_ABI, data: log.data, topics: log.topics });
      } catch {
        continue; // some other event of the vault's, or one this ABI predates
      }
      if (decoded.eventName !== eventName) continue;
      const args = decoded.args as unknown as Record<string, unknown>;
      if (String(args.collateralId).toLowerCase() !== want) continue;
      return build(args, {
        blockNumber: Number(receipt.blockNumber),
        txIndex: receipt.transactionIndex,
      });
    }
    throw new NotVerifiableError(
      `Transaction ${txHash} emitted no ${eventName} for this collateral from the vault at ` +
        `${this.vaultAddress}. It is a real transaction but not the one it was submitted as.`,
    );
  }

  async verifyLock(txHash: Hex, collateralId: Hex): Promise<VerifiedLock> {
    return this.decode(txHash, "Lock_", collateralId, (a, r) => ({
      collateralId,
      financier: a.financier as Address,
      tranche: TRANCHE_NAME[Number(a.tranche)] ?? "SUBORDINATE",
      amountUsd: fromUnits(a.amount as bigint),
      token: a.token as Address,
      raceNonce: Number(a.raceNonce),
      seq: Number(a.seq),
      eventBlockNumber: Number(a.blockNumber),
      allowDemotion: Boolean(a.allowDemotion),
      blockNumber: r.blockNumber,
      txIndex: r.txIndex,
      txHash,
      emittedBy: this.vaultAddress,
    }));
  }

  async verifyRaceOpen(txHash: Hex, collateralId: Hex): Promise<VerifiedRaceOpen> {
    return this.decode(txHash, "RaceOpened", collateralId, (a, r) => ({
      collateralId,
      raceNonce: Number(a.raceNonce),
      facilitySizeUsd: fromUnits(a.facilitySize as bigint),
      deadline: Number(a.deadline),
      blockNumber: r.blockNumber,
      txIndex: r.txIndex,
      txHash,
      emittedBy: this.vaultAddress,
    }));
  }
}

/**
 * A reader, or the reason there is not one.
 *
 * @remarks Returns the reason rather than throwing so a route can answer "the vault is not
 * deployed" with the deploy command instead of a stack trace. A missing deployment is an ordinary
 * state of this app, not a fault.
 */
/**
 * Cached on `globalThis`, exactly as `getDeps()` is.
 *
 * @remarks `loadDeployedAddresses()` is two `existsSync` plus two `readFileSync` plus two
 * `JSON.parse`, synchronously, and this ran on every request. The status endpoint is polled every
 * twenty seconds per open settlement, so several tabs meant a steady drip of blocking disk reads
 * on the request path to re-derive an address that is fixed for the life of the process — and a
 * fresh viem client each time, discarding any connection reuse.
 */
const g = globalThis as unknown as { __precedenceSepoliaReader?: SepoliaReader };

export function getSepoliaReader(): { reader: SepoliaReader } | { reader: null; why: string } {
  if (g.__precedenceSepoliaReader) return { reader: g.__precedenceSepoliaReader };
  const vault = loadDeployedAddresses().sepolia?.PriorityVault;
  if (!vault) {
    return {
      reader: null,
      why:
        "No Sepolia vault is deployed (contracts/deployments/sepolia.json is missing), so there " +
        "is nothing to verify a lock against. Run `cd contracts && make deploy-sepolia`.",
    };
  }
  g.__precedenceSepoliaReader = new SepoliaReader(vault, getConfig().sepoliaRpc);
  return { reader: g.__precedenceSepoliaReader };
}
