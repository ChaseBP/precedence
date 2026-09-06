/**
 * Real Creditcoin CC3 client.
 *
 * Satisfies the same `CreditcoinClient` interface as the mock, so the orchestrator and every
 * component are unchanged by the swap.
 *
 * @remarks
 * **This adapter is deliberately read-mostly, and that is a design decision rather than a gap.**
 *
 * Settling a race requires an Attestcoin proof, and building one requires `@gluwa/usc-sdk`, which
 * requires ethers, and waiting 6.5-9.3 minutes for attestation. None of that belongs in a Next.js
 * request: a serverless function cannot wait eight minutes, and a proof half-built when a lambda
 * freezes is worse than no proof. So proof submission lives in `worker/`, and this adapter reads
 * back what the worker settled.
 *
 * `settleRace` therefore does not fabricate a settlement. It looks for one the worker has already
 * produced and returns it, or fails with an instruction. Inventing a plausible-looking settlement
 * here is exactly the class of thing that puts a dead explorer link in front of a judge.
 */
import { createPublicClient, http, type Address, type Hex as ViemHex, type PublicClient } from "viem";
import { defineChain } from "viem";
import type {
  AttestcoinProofRecord,
  DefaultRecord,
  FreezeRecord,
  GracePeriodRecord,
  Hex,
  LiquidationRecord,
  PcrRecord,
  RefinanceRecord,
  SourceLockRecord,
} from "../../types";
import type { Cc3TxRef, CreditcoinClient, SettleRaceResult } from "./creditcoin-client";
import { AttestationGate_ABI, CollateralRegistry_ABI, PriorityEngine_ABI } from "../generated/abis";
import { CREDITCOIN_EXPLORER } from "../../config";

/** Creditcoin CC3 testnet: chainId 102031, 15.0s blocks, 75,000,000 block gas limit, 0.5 gwei. */
export const creditcoinTestnet = defineChain({
  id: 102031,
  name: "Creditcoin CC3 Testnet",
  nativeCurrency: { name: "Creditcoin", symbol: "CTC", decimals: 18 },
  rpcUrls: { default: { http: ["https://rpc.cc3-testnet.creditcoin.network"] } },
  blockExplorers: {
    default: { name: "Blockscout", url: "https://creditcoin-testnet.blockscout.com" },
  },
  testnet: true,
});

const STATES = [
  "CLEAR",
  "RACE_OPEN",
  "PRIORITY_SETTLED",
  "ENCUMBERED",
  "FROZEN",
  "GRACE",
  "DUTCH_LIQUIDATION",
  "REPAID",
  "DEFAULTED",
  "BREACHED",
] as const;

const PUSD_DECIMALS = 6;
const fromUnits = (v: bigint): number => Number(v) / 10 ** PUSD_DECIMALS;

export interface ChainCreditcoinConfig {
  rpcUrl: string;
  gateAddress: Address;
  engineAddress: Address;
  registryAddress: Address;
  claimTokenAddress: Address;
  refinanceEngineAddress: Address;
}

/** Raised when an operation needs the worker rather than a web request. */
export class RequiresWorkerError extends Error {
  constructor(operation: string, command: string) {
    super(
      `${operation} requires an Attestcoin proof, which takes 6.5-9.3 min of attestation and the ` +
        `ethers-based SDK — neither belongs in a web request. Run the worker instead:\n\n  ${command}\n\n` +
        `The app will pick up the settlement once it lands on-chain.`,
    );
    this.name = "RequiresWorkerError";
  }
}

/**
 * Reject anything that is not a real 32-byte collateral id, with a reason.
 *
 * @remarks Fixture collateral is keyed by a slug (`col-8802`) and carries a placeholder document
 * hash, so it has no on-chain identity at all. Passing either into a `bytes32` argument used to
 * die inside viem with "Size of bytes col-8802 (bytes8) does not match expected size (bytes32)" —
 * a type error where the real problem is that the caller asked the chain about something that was
 * never registered on it.
 */
function requireOnChainId(collateralId: string, operation: string): ViemHex {
  if (!/^0x[0-9a-fA-F]{64}$/.test(collateralId)) {
    throw new Error(
      `${operation} needs a collateral id registered on Creditcoin, but got "${collateralId}". ` +
        `That is a sample facility — it has no on-chain registration, so there is nothing to read. ` +
        `Register collateral from /registry/new to get an id the chain knows.`,
    );
  }
  return collateralId as ViemHex;
}

export class ChainCreditcoinClient implements CreditcoinClient {
  private readonly publicClient: PublicClient;
  private readonly cfg: ChainCreditcoinConfig;

  constructor(cfg: ChainCreditcoinConfig) {
    this.cfg = cfg;
    this.publicClient = createPublicClient({
      chain: creditcoinTestnet,
      transport: http(cfg.rpcUrl),
    });
  }

  isLive(): boolean {
    return true;
  }

  explorerBase(): string {
    return CREDITCOIN_EXPLORER;
  }

  txUrl(tx: string): string {
    return `${CREDITCOIN_EXPLORER}/tx/${tx}`;
  }

  private ref(tx: Hex, blockNumber: number): Cc3TxRef {
    return { tx, explorerUrl: this.txUrl(tx), blockNumber };
  }

  /** The trust anchor: the vault every proof for this collateral must have been emitted by. */
  async vaultOf(collateralId: string): Promise<Hex> {
    const id = requireOnChainId(collateralId, "vaultOf");
    return (await this.publicClient.readContract({
      address: this.cfg.registryAddress,
      abi: CollateralRegistry_ABI,
      functionName: "vaultOf",
      args: [id],
    })) as Hex;
  }

  /**
   * Read back a settlement the worker produced.
   *
   * @throws {RequiresWorkerError} when no settlement exists yet — rather than inventing one.
   */
  async settleRace(
    collateralId: string,
    locks: SourceLockRecord[],
    proof: AttestcoinProofRecord,
  ): Promise<SettleRaceResult> {
    // Has the gate already consumed the first lock's proven position?
    const first = locks[0];
    if (first && first.lockTxIndex >= 0) {
      const processed = (await this.publicClient.readContract({
        address: this.cfg.gateAddress,
        abi: AttestationGate_ABI,
        functionName: "isProcessed",
        args: [BigInt(first.lockBlockNumber), BigInt(first.lockTxIndex)],
      })) as boolean;

      if (processed) {
        // Recover the settlement from the engine's own state.
        const stack = (await this.publicClient.readContract({
          address: this.cfg.engineAddress,
          abi: PriorityEngine_ABI,
          functionName: "priorityStack",
          args: [collateralId as ViemHex],
        })) as readonly { height: bigint; txIndex: bigint }[];

        return {
          tx: (proof.creditcoinTxHash ?? "0x") as Hex,
          explorerUrl: this.txUrl(proof.creditcoinTxHash ?? ""),
          blockNumber: proof.verificationBlockNumber ?? 0,
          proofRecord: proof,
          verifiedPositions: stack.map((a) => ({
            height: Number(a.height),
            txIndex: Number(a.txIndex),
          })),
        };
      }
    }

    throw new RequiresWorkerError(
      "Settling priority",
      `cd worker && bun run src/cli.ts prove ${collateralId} --from-vault`,
    );
  }

  async verifyRepayment(
    collateralId: string,
    _sourceBlockHeight: number,
    _sourceTxIndex: number,
    _encodedTx: Hex,
  ): Promise<Cc3TxRef & { provenAmountUsd: number }> {
    throw new RequiresWorkerError(
      "Verifying a repayment",
      `cd worker && bun run src/cli.ts repay ${collateralId} <sepoliaRepayTxHash>`,
    );
  }

  async executeAtomicRefinance(
    collateralId: string,
    _oldFinancier: string,
    _newFinancier: string,
    _newRatePct: number,
    _amountUsd: number,
  ): Promise<Cc3TxRef & { record: RefinanceRecord }> {
    throw new RequiresWorkerError(
      "Executing an atomic refinance",
      `cd worker && bun run src/cli.ts prove ${collateralId} --from-vault   # then the refi beat`,
    );
  }

  async getEncumbranceState(collateralId: string): Promise<{ state: string; activeLiens: number }> {
    const id = requireOnChainId(collateralId, "getEncumbranceState");
    const [state, liens] = (await this.publicClient.readContract({
      address: this.cfg.registryAddress,
      abi: CollateralRegistry_ABI,
      functionName: "getEncumbrance",
      args: [collateralId as ViemHex],
    })) as [number, number];

    return { state: STATES[Number(state)] ?? "UNKNOWN", activeLiens: Number(liens) };
  }

  // ─────────────────────── keeper pokes ───────────────────────
  //
  // These are permissionless and need no proof, so in principle the app could call them. It does
  // not, for one reason: the keeper must visibly hold no privileges, and a server-side key inside
  // the web app blurs exactly the property the failure branch exists to demonstrate. The worker's
  // separate keeper key makes "anyone can do this" checkable.

  private keeperNote(fn: string, collateralId: string): never {
    throw new RequiresWorkerError(
      `Keeper poke ${fn}`,
      `cd worker && bun run src/cli.ts poke ${collateralId}   # or: unwind ${collateralId}`,
    );
  }

  async pokeFreezeDraw(collateralId: string, _f: FreezeRecord): Promise<Cc3TxRef> {
    return this.keeperNote("pokeFreezeDraw", collateralId);
  }

  async pokePcrStabilization(collateralId: string, _p: PcrRecord): Promise<Cc3TxRef> {
    return this.keeperNote("pokePcrStabilization", collateralId);
  }

  async pokeGracePeriod(collateralId: string, _g: GracePeriodRecord): Promise<Cc3TxRef> {
    return this.keeperNote("pokeGracePeriod", collateralId);
  }

  async pokeDutchLiquidation(collateralId: string, _l: LiquidationRecord): Promise<Cc3TxRef> {
    return this.keeperNote("pokeDutchLiquidation", collateralId);
  }

  async pokeTerminateDefault(collateralId: string, _d: DefaultRecord): Promise<Cc3TxRef> {
    return this.keeperNote("pokeTerminateDefault", collateralId);
  }

  // ─────────────────────── extra reads for the UI ───────────────────────

  /** The live priority stack, straight from the engine. */
  async priorityStack(collateralId: string): Promise<
    { financier: Hex; tranche: number; rank: number; amountUsd: number; height: number; txIndex: number }[]
  > {
    const stack = (await this.publicClient.readContract({
      address: this.cfg.engineAddress,
      abi: PriorityEngine_ABI,
      functionName: "priorityStack",
      args: [collateralId as ViemHex],
    })) as readonly { financier: Address; tranche: number; rank: number; amount: bigint; height: bigint; txIndex: bigint }[];

    return stack.map((a) => ({
      financier: a.financier,
      tranche: Number(a.tranche),
      rank: Number(a.rank),
      amountUsd: fromUnits(a.amount),
      height: Number(a.height),
      txIndex: Number(a.txIndex),
    }));
  }

  /** Coverage ratio in basis points. 11000 = 110%, the freeze threshold. */
  async pcrBps(collateralId: string): Promise<number> {
    const v = (await this.publicClient.readContract({
      address: this.cfg.engineAddress,
      abi: PriorityEngine_ABI,
      functionName: "pcrBps",
      args: [collateralId as ViemHex],
    })) as bigint;
    return v > 10n ** 12n ? Number.POSITIVE_INFINITY : Number(v);
  }

  async blockNumber(): Promise<number> {
    return Number(await this.publicClient.getBlockNumber());
  }
}
