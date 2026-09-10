/**
 * Mock Sepolia client.
 *
 * Simulates PriorityVault locks with SAMPLE-prefixed hashes. `isLive()` returns false, so the UI
 * can never render this as chain data.
 *
 * It deliberately puts two locks in the SAME block with different transaction indices, because
 * that is the case the whole priority mechanism turns on: Sepolia's ~12s blocks make same-block
 * locks likely, `blockHeight` alone cannot order them, and `calculateTxIndex` is what resolves it.
 * A mock that never produces a tie would hide the interesting path.
 */
import type { Hex, SourceLockRecord } from "@precedence/sdk/types";
import type { LockParams, RefundParams, RepayParams, SepoliaClient, TxRef } from "./sepolia-client";
import { hashObject } from "@precedence/sdk/hash";
import { financierAddress } from "@precedence/sdk/domain/lock";

/** SAMPLE addresses — visibly not real, per the no-fabricated-evidence rule. */
const SAMPLE_VAULT = "0xSAMPLE_SEPOLIA_PRIORITY_VAULT_000000000000" as Hex;
const SAMPLE_PUSD = "0xSAMPLE_SEPOLIA_PUSD_TOKEN_00000000000000000" as Hex;

export class MockSepoliaClient implements SepoliaClient {
  private locksByCollateral = new Map<string, SourceLockRecord[]>();
  private seqByCollateral = new Map<string, number>();
  private baseBlock = 6182100;

  /**
   * A stable per-collateral block offset, so two facilities do not settle at the same height.
   *
   * @remarks Deterministic on purpose. Randomising would make a facility's proven position change
   * between reloads, which is precisely the property this protocol claims is fixed.
   */
  private collateralOffset(collateralId: string): number {
    let h = 0;
    for (const ch of collateralId) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return (h % 400) * 3;
  }

  isLive(): boolean {
    return false;
  }

  vaultAddress(): Hex {
    return SAMPLE_VAULT;
  }

  settlementToken(): Hex {
    return SAMPLE_PUSD;
  }

  async blockNumber(): Promise<number> {
    return this.baseBlock + 64;
  }

  async openRace(collateralId: string, _facilityUsd?: number, _caps?: [number, number, number]): Promise<TxRef> {
    // Reset the per-collateral lock counter so this race's locks run seq 1..N.
    this.seqByCollateral.set(collateralId, 0);
    this.locksByCollateral.set(collateralId, []);
    return {
      tx: hashObject({ prefix: "SAMPLE_SEPOLIA_OPEN_RACE", collateralId, at: Date.now() }),
      blockNumber: this.baseBlock,
      txIndex: 0,
    };
  }

  async lock(params: LockParams): Promise<TxRef & { lock: SourceLockRecord }> {
    const list = this.locksByCollateral.get(params.collateralId) ?? [];
    const seq = (this.seqByCollateral.get(params.collateralId) ?? 0) + 1;
    this.seqByCollateral.set(params.collateralId, seq);

    // Locks 1 and 2 land in the SAME block at different indices — the same-block tie-break case.
    // Lock 3 lands one block later, so the demo exercises both orderings.
    //
    // The base is per-collateral. It used to be one constant, so every scripted race settled at
    // the same two heights and the telemetry list showed four separate proofs all citing
    // Block #6182101 — a settlement history that looks like a rendering bug. Derived from the id
    // rather than randomised, so a facility keeps its heights across reloads.
    const blockOffset = seq <= 2 ? 1 : seq - 1;
    const blockNumber = this.baseBlock + this.collateralOffset(params.collateralId) + blockOffset;
    const txIndex = seq <= 2 ? 17 + (seq - 1) * 5 : 3;

    const tx = hashObject({
      prefix: "SAMPLE_SEPOLIA_LOCK",
      collateralId: params.collateralId,
      financier: params.financier,
      blockNumber,
      txIndex,
      amount: params.amountUsd,
    });

    const lock: SourceLockRecord = {
      collateralId: params.collateralId,
      financier: params.financier,
      financierAddress: financierAddress(params.financier),
      tranche: params.tranche,
      amountUsd: params.amountUsd,
      lockBlockNumber: blockNumber,
      lockTxIndex: txIndex,
      seq,
      token: SAMPLE_PUSD,
      sepoliaTxHash: tx,
      receiptStatus: 1,
      emittedBy: SAMPLE_VAULT,
      timestamp: new Date().toISOString(),
      refunded: false,
    };

    list.push(lock);
    this.locksByCollateral.set(params.collateralId, list);

    return { tx, blockNumber, txIndex, lock };
  }

  async draw(collateralId: string, obligor: string, amountUsd: number): Promise<TxRef> {
    return {
      tx: hashObject({ prefix: "SAMPLE_SEPOLIA_DRAW", collateralId, obligor, amountUsd }),
      blockNumber: this.baseBlock + 15,
      txIndex: 9,
    };
  }

  async repay(params: RepayParams): Promise<TxRef> {
    return {
      tx: hashObject({ prefix: "SAMPLE_SEPOLIA_REPAY", ...params }),
      blockNumber: this.baseBlock + 50,
      txIndex: 4,
    };
  }

  async refund(params: RefundParams): Promise<TxRef> {
    return {
      tx: hashObject({ prefix: "SAMPLE_SEPOLIA_REFUND", ...params }),
      blockNumber: this.baseBlock + 60,
      txIndex: 12,
    };
  }

  async getLocks(collateralId: string): Promise<SourceLockRecord[]> {
    return this.locksByCollateral.get(collateralId) ?? [];
  }
}
