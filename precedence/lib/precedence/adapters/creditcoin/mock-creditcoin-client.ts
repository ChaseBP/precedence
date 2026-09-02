/**
 * Mock Creditcoin CC3 / Attestcoin client.
 *
 * SAMPLE-prefixed hashes throughout, and `isLive()` returns false so the UI cannot present any of
 * this as chain data.
 *
 * The explorer base is the REAL, verified one — `creditcoin-testnet.blockscout.com`. The previously
 * used `explorer.cc3-testnet.creditcoin.network` does not resolve, which meant every explorer link
 * the app rendered was dead. Even in mock mode the base must be correct, because these URLs are
 * what get pasted into the demo and the docs.
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
} from "../../types";
import type { Cc3TxRef, CreditcoinClient, SettleRaceResult } from "./creditcoin-client";
import { hashObject } from "../../crypto/hash";
import { CREDITCOIN_EXPLORER } from "../../config";

export class MockCreditcoinClient implements CreditcoinClient {
  private baseBlock = 5412200;

  isLive(): boolean {
    return false;
  }

  explorerBase(): string {
    return CREDITCOIN_EXPLORER;
  }

  txUrl(tx: string): string {
    return `${CREDITCOIN_EXPLORER}/tx/${tx}`;
  }

  private ref(tx: Hex, blockOffset = 1): Cc3TxRef {
    return { tx, explorerUrl: this.txUrl(tx), blockNumber: this.baseBlock + blockOffset };
  }

  async vaultOf(collateralId: string): Promise<Hex> {
    // In mock mode the registry mirrors the mock vault.
    return "0xSAMPLE_SEPOLIA_PRIORITY_VAULT_000000000000" as Hex;
  }

  async settleRace(
    collateralId: string,
    locks: SourceLockRecord[],
    proof: AttestcoinProofRecord,
  ): Promise<SettleRaceResult> {
    const tx = hashObject({
      prefix: "SAMPLE_CC3_SETTLE_RACE",
      collateralId,
      heights: proof.heights,
      txIndices: proof.txIndices,
    });
    const blockNumber = this.baseBlock + 3;

    return {
      ...this.ref(tx, 3),
      proofRecord: { ...proof, creditcoinTxHash: tx, verificationBlockNumber: blockNumber },
      // What the precompile's own TransactionVerified events would report.
      verifiedPositions: proof.heights.map((height, i) => ({ height, txIndex: proof.txIndices[i] })),
    };
  }

  async verifyRepayment(
    collateralId: string,
    sourceBlockHeight: number,
    sourceTxIndex: number,
    encodedTx: Hex,
  ): Promise<Cc3TxRef & { provenAmountUsd: number }> {
    const tx = hashObject({
      prefix: "SAMPLE_CC3_REPAY_VERIFIED",
      collateralId,
      sourceBlockHeight,
      sourceTxIndex,
    });
    return { ...this.ref(tx, 7), provenAmountUsd: 0 };
  }

  async executeAtomicRefinance(
    collateralId: string,
    oldFinancier: string,
    newFinancier: string,
    newRatePct: number,
    amountUsd: number,
  ): Promise<Cc3TxRef & { record: RefinanceRecord }> {
    const tx = hashObject({
      prefix: "SAMPLE_CC3_REFI_ATOMIC",
      collateralId,
      oldFinancier,
      newFinancier,
      newRatePct,
      amountUsd,
    });
    const oldRatePct = 8.0;
    const record: RefinanceRecord = {
      collateralId,
      oldFinancier,
      oldRatePct,
      newFinancier,
      newRatePct,
      amountUsd,
      annualSavingsUsd: Math.round(amountUsd * ((oldRatePct - newRatePct) / 100)),
      oldRepaymentProofHash: hashObject({ SAMPLE: "old-repayment-proof", collateralId, oldFinancier }),
      newLockProofHash: hashObject({ SAMPLE: "new-lock-proof", collateralId, newFinancier }),
      creditcoinTxHash: tx,
      atomic: true,
      settledAt: new Date().toISOString(),
    };
    return { ...this.ref(tx, 11), record };
  }

  async getEncumbranceState(collateralId: string): Promise<{ state: string; activeLiens: number }> {
    return { state: "ENCUMBERED", activeLiens: 2 };
  }

  // ── keeper pokes ──

  private poke(label: string, collateralId: string, offset: number): Cc3TxRef {
    return this.ref(hashObject({ prefix: `SAMPLE_CC3_${label}`, collateralId }), offset);
  }

  async pokeFreezeDraw(collateralId: string, _freeze: FreezeRecord): Promise<Cc3TxRef> {
    return this.poke("POKE_FREEZE_DRAW", collateralId, 21);
  }

  async pokePcrStabilization(collateralId: string, _pcr: PcrRecord): Promise<Cc3TxRef> {
    return this.poke("POKE_PCR_STABILIZATION", collateralId, 25);
  }

  async pokeGracePeriod(collateralId: string, _grace: GracePeriodRecord): Promise<Cc3TxRef> {
    return this.poke("POKE_GRACE_PERIOD", collateralId, 29);
  }

  async pokeDutchLiquidation(collateralId: string, _liq: LiquidationRecord): Promise<Cc3TxRef> {
    return this.poke("POKE_DUTCH_LIQUIDATION", collateralId, 33);
  }

  async pokeTerminateDefault(collateralId: string, _def: DefaultRecord): Promise<Cc3TxRef> {
    return this.poke("POKE_TERMINATE_DEFAULT", collateralId, 37);
  }
}
