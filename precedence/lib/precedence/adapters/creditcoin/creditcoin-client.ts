/**
 * Creditcoin CC3 client interface.
 *
 * CC3 testnet, verified live 2026-09-01: chainId 102031, block time exactly 15.0s,
 * block gas limit 75,000,000, gasPrice 0.5 gwei.
 *
 * Both the mock and the real (viem) implementation satisfy this interface, which is what keeps the
 * `mock | chain` switch a swap. `isLive()` is the single source of truth for the UI's honesty chip —
 * never an env var the UI could contradict.
 */
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
} from "@precedence/sdk/types";

export interface Cc3TxRef {
  tx: Hex;
  explorerUrl: string;
  blockNumber: number;
}

/** The result of one atomic priority settlement. */
export interface SettleRaceResult extends Cc3TxRef {
  proofRecord: AttestcoinProofRecord;
  /** Positions the precompile itself derived, from its TransactionVerified events. */
  verifiedPositions: { height: number; txIndex: number }[];
}

export interface CreditcoinClient {
  isLive(): boolean;
  explorerBase(): string;
  /** Explorer URL for a transaction — must resolve; a dead link ends the submission. */
  txUrl(tx: string): string;

  /** Registered vault for a collateral. Every proof MUST be bound to this. */
  vaultOf(collateralId: string): Promise<Hex>;

  /**
   * One Creditcoin transaction: batch verifyAndEmit at 0x0FD2, status + vault + ordering +
   * completeness checks, then PriorityEngine.settlePriority.
   */
  settleRace(
    collateralId: string,
    locks: SourceLockRecord[],
    proof: AttestcoinProofRecord,
  ): Promise<SettleRaceResult>;

  verifyRepayment(
    collateralId: string,
    sourceBlockHeight: number,
    sourceTxIndex: number,
    encodedTx: Hex,
  ): Promise<Cc3TxRef & { provenAmountUsd: number }>;

  executeAtomicRefinance(
    collateralId: string,
    oldFinancier: string,
    newFinancier: string,
    newRatePct: number,
    amountUsd: number,
  ): Promise<Cc3TxRef & { record: RefinanceRecord }>;

  getEncumbranceState(collateralId: string): Promise<{ state: string; activeLiens: number }>;

  // ── permissionless keeper pokes (DECISIONS.md Q5) ──
  // Timestamp-gated and callable by anyone, so the unwind is a property of the contract rather
  // than of our uptime.
  pokeFreezeDraw(collateralId: string, freeze: FreezeRecord): Promise<Cc3TxRef>;
  pokePcrStabilization(collateralId: string, pcr: PcrRecord): Promise<Cc3TxRef>;
  pokeGracePeriod(collateralId: string, grace: GracePeriodRecord): Promise<Cc3TxRef>;
  pokeDutchLiquidation(collateralId: string, liq: LiquidationRecord): Promise<Cc3TxRef>;
  pokeTerminateDefault(collateralId: string, def: DefaultRecord): Promise<Cc3TxRef>;
}
