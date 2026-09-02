/**
 * Sepolia (chainKey 1) PriorityVault client interface.
 *
 * Settlement is in pUSD — an ERC-20 with 6 decimals, so `$5,000` is `5000000000` on-chain and the
 * number a judge reads on Etherscan is the number on screen. The `Lock` event carries the token
 * address so the Creditcoin side never has to infer denomination or decimals.
 *
 * Both the mock and the real (viem) implementation satisfy this interface — that is what makes the
 * `mock | chain` switch a swap rather than a rewrite.
 */
import type { Hex, SourceLockRecord, Tranche } from "../../types";

export interface LockParams {
  collateralId: string;
  financier: string;
  tranche: Tranche;
  amountUsd: number;
}

export interface RepayParams {
  collateralId: string;
  obligor: string;
  amountUsd: number;
}

export interface RefundParams {
  collateralId: string;
  financier: string;
  lockIndex: number;
}

export interface TxRef {
  tx: Hex;
  blockNumber: number;
  /** Position within the block — the other half of the priority root. */
  txIndex: number;
}

export interface SepoliaClient {
  /** True only when this adapter is talking to a real chain. Drives the UI's honesty chip. */
  isLive(): boolean;
  /** The deployed PriorityVault every proof for this chain must be bound to. */
  vaultAddress(): Hex;
  /** The pUSD settlement token. */
  settlementToken(): Hex;

  /**
   * Open a race on this collateral and RESET its per-collateral lock counter.
   *
   * This is what makes the `seq` completeness check meaningful. `AttestationGate` requires the
   * submitted locks to be contiguous from seq 1, which is only enforceable if the counter restarts
   * per race — otherwise a second financing round would legitimately start at seq 4 and a prover
   * omitting the FIRST lock would still submit a consecutive run. A collateral is either CLEAR or
   * ENCUMBERED, so it can only ever have one open race.
   */
  openRace(collateralId: string): Promise<TxRef>;

  lock(params: LockParams): Promise<TxRef & { lock: SourceLockRecord }>;
  draw(collateralId: string, obligor: string, amountUsd: number): Promise<TxRef>;
  repay(params: RepayParams): Promise<TxRef>;
  refund(params: RefundParams): Promise<TxRef>;
  getLocks(collateralId: string): Promise<SourceLockRecord[]>;
  /** Current head — used to reason about attestation lag honestly. */
  blockNumber(): Promise<number>;
}
