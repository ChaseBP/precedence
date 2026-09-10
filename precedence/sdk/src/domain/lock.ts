/**
 * Source-chain capital locks and proof-ordered priority allocation.
 *
 * Competing financiers lock capital on Sepolia (chainKey 1) into PriorityVault.sol. The Attestcoin
 * precompile at 0x0FD2 proves each lock's canonical source position; `calculateTxIndex` derives the
 * intra-block index from the Merkle proof itself.
 *
 * THE RULE (`DECISIONS.md` Q4):
 *   A declared tranche is a *preference*, not an entitlement.
 *   Within each tranche, proven `(blockHeight, txIndex)` ordering decides who gets it.
 *   Bids beyond the facility's sizing for that tranche are AUTO-REFUNDED, never silently demoted —
 *   a financier who bid SENIOR did not consent to subordinate risk. Demotion requires opting in
 *   via `allowDemotion`.
 */
import { privateKeyToAccount } from "viem/accounts";
import type {
  AgentId,
  Hex,
  PriorityClaim,
  PrioritySettlement,
  RefundRecord,
  SourceLockRecord,
  Tranche,
} from "../types";
import { hashString } from "../hash";

const TRANCHE_ORDER: Tranche[] = ["SENIOR", "JUNIOR", "SUBORDINATE"];
const RANK_OF: Record<Tranche, 1 | 2 | 3> = { SENIOR: 1, JUNIOR: 2, SUBORDINATE: 3 };

/**
 * Fallback coupons, used only when a facility has no posted terms.
 *
 * @remarks The real rates come from `CollateralAsset.terms`, published by the borrower. These exist
 * so a fixture without terms still renders something coherent — never to override a posted rate.
 */
export const FALLBACK_RATE_PCT: Record<Tranche, number> = {
  SENIOR: 5,
  JUNIOR: 10,
  SUBORDINATE: 18,
};

/** Derive a deterministic EVM account for demo financier signing. */
export function deriveFinancierAccount(agentId: string) {
  const pk = hashString(`precedence-financier-key:${agentId}`);
  return privateKeyToAccount(pk);
}

export function financierAddress(agentId: string): Hex {
  return deriveFinancierAccount(agentId).address;
}

/**
 * Canonical priority comparator — THE trust root of the whole protocol.
 *
 * `(blockHeight, txIndex)` is the proven canonical source-chain position. `seq` is the vault's own
 * monotonic counter and only ever breaks a tie that cannot occur (identical height AND index), so
 * it acts as a consistency assertion rather than a real tie-break.
 */
export function compareProvenOrder(a: SourceLockRecord, b: SourceLockRecord): number {
  if (a.lockBlockNumber !== b.lockBlockNumber) return a.lockBlockNumber - b.lockBlockNumber;
  if (a.lockTxIndex !== b.lockTxIndex) return a.lockTxIndex - b.lockTxIndex;
  return a.seq - b.seq;
}

export function sortByProvenOrder(locks: SourceLockRecord[]): SourceLockRecord[] {
  return [...locks].sort(compareProvenOrder);
}

export interface TrancheSizing {
  seniorUsd: number;
  juniorUsd: number;
  subordinateUsd: number;
}

export interface SettlementResult {
  settlement: PrioritySettlement;
  claims: PriorityClaim[];
  refunds: RefundRecord[];
}

/**
 * Settle priority from proven ordering.
 *
 * @param locks   verified locks — each already bound to the registered vault and status-checked
 * @param sizing  the facility's per-tranche capacity
 */
export function settlePriorityLocks(
  collateralId: string,
  locks: SourceLockRecord[],
  sizing: TrancheSizing,
  opts: {
    settlementBlock?: number;
    creditcoinTxHash?: Hex;
    allowDemotion?: Record<AgentId, boolean>;
    /** Coupons the BORROWER posted for this facility. Falls back only if absent. */
    rates?: Record<Tranche, number>;
  } = {},
): SettlementResult {
  const now = new Date().toISOString();
  const ordered = sortByProvenOrder(locks);
  const allowDemotion = opts.allowDemotion ?? {};
  const rates = opts.rates ?? FALLBACK_RATE_PCT;

  const claims: PriorityClaim[] = [];
  const refunds: RefundRecord[] = [];
  const remaining: Record<Tranche, number> = {
    SENIOR: sizing.seniorUsd,
    JUNIOR: sizing.juniorUsd,
    SUBORDINATE: sizing.subordinateUsd,
  };
  const awarded: Partial<Record<Tranche, { agentId: AgentId; amountUsd: number }>> = {};

  /** Try to seat `lock` in `tranche`; returns the amount seated (0 if it doesn't fit). */
  function seat(lock: SourceLockRecord, tranche: Tranche): number {
    const capacity = remaining[tranche];
    if (capacity <= 0) return 0;
    const amount = Math.min(lock.amountUsd, capacity);
    if (amount <= 0) return 0;

    remaining[tranche] -= amount;
    if (!awarded[tranche]) awarded[tranche] = { agentId: lock.financier, amountUsd: amount };

    claims.push({
      claimId: `claim-${collateralId}-${tranche.toLowerCase()}-${lock.financier}`,
      collateralId,
      tranche,
      holder: lock.financier,
      holderAddress: lock.financierAddress,
      principalUsd: amount,
      ratePct: rates[tranche],
      tokenId: `1155-${RANK_OF[tranche]}`,
      priorityRank: RANK_OF[tranche],
      provenAt: {
        blockNumber: lock.lockBlockNumber,
        txIndex: lock.lockTxIndex,
        seq: lock.seq,
      },
      state: "ACTIVE",
      mintedAt: now,
    });
    return amount;
  }

  // Walk locks in PROVEN order. Earliest proven lock in a tranche takes it.
  for (const lock of ordered) {
    const seated = seat(lock, lock.tranche);

    if (seated >= lock.amountUsd) continue;

    const unseated = lock.amountUsd - seated;
    const winner = awarded[lock.tranche];
    const outpacedBy = winner && winner.agentId !== lock.financier ? winner.agentId : undefined;

    // Demotion is opt-in only.
    if (allowDemotion[lock.financier]) {
      let left = unseated;
      for (const t of TRANCHE_ORDER.slice(TRANCHE_ORDER.indexOf(lock.tranche) + 1)) {
        if (left <= 0) break;
        left -= seat({ ...lock, amountUsd: left, tranche: t }, t);
      }
      if (left > 0) {
        refunds.push({
          agentId: lock.financier,
          amountUsd: left,
          tranche: lock.tranche,
          reason: `Facility fully allocated across all tranches — $${left.toLocaleString()} auto-refunded via PriorityVault.refund()`,
        });
      }
      continue;
    }

    refunds.push({
      agentId: lock.financier,
      amountUsd: unseated,
      tranche: lock.tranche,
      reason: outpacedBy
        ? `Outpaced in ${lock.tranche} by ${outpacedBy.toUpperCase()} at proven position (block ${
            ordered.find((l) => l.financier === outpacedBy)?.lockBlockNumber ?? "?"
          }, txIndex ${ordered.find((l) => l.financier === outpacedBy)?.lockTxIndex ?? "?"}) — capital returned, not demoted`
        : `${lock.tranche} tranche fully allocated — $${unseated.toLocaleString()} auto-refunded via PriorityVault.refund()`,
    });
  }

  const senior = awarded.SENIOR;
  const junior = awarded.JUNIOR;
  const subordinate = awarded.SUBORDINATE;

  const settlement: PrioritySettlement = {
    collateralId,
    seniorFinancier: senior?.agentId ?? "",
    seniorAmountUsd: senior?.amountUsd ?? 0,
    juniorFinancier: junior?.agentId ?? "",
    juniorAmountUsd: junior?.amountUsd ?? 0,
    subordinateFinancier: subordinate?.agentId,
    subordinateAmountUsd: subordinate?.amountUsd,
    refundedFinanciers: refunds,
    provenOrder: ordered.map((l) => ({
      agentId: l.financier,
      blockNumber: l.lockBlockNumber,
      txIndex: l.lockTxIndex,
      seq: l.seq,
    })),
    settlementBlock: opts.settlementBlock ?? 0,
    creditcoinTxHash: opts.creditcoinTxHash ?? ("0x" as Hex),
    settledAt: now,
  };

  return { settlement, claims, refunds };
}

/**
 * Completeness check mirroring `AttestationGate`'s on-chain `seq` requirement.
 *
 * The gate requires `seq` contiguous from 1, which makes it impossible for a prover to OMIT a
 * middle lock in order to promote a friend. Only tail truncation is possible, and a truncated tail
 * omits later — more junior — locks, whose holders can submit their own proof.
 */
export function checkSeqContiguity(locks: SourceLockRecord[]): { ok: boolean; reason?: string } {
  const seqs = locks.map((l) => l.seq).sort((a, b) => a - b);
  for (let i = 0; i < seqs.length; i++) {
    if (seqs[i] !== i + 1) {
      return {
        ok: false,
        reason: `seq gap at position ${i + 1}: expected ${i + 1}, got ${seqs[i]} — submitted lock set is not contiguous from 1`,
      };
    }
  }
  return { ok: true };
}

/** Ordering assertion mirroring the gate's `require(height > prev || (height == prev && idx > prev))`. */
export function checkStrictOrdering(locks: SourceLockRecord[]): { ok: boolean; reason?: string } {
  for (let i = 1; i < locks.length; i++) {
    if (compareProvenOrder(locks[i - 1], locks[i]) >= 0) {
      return {
        ok: false,
        reason: `locks ${i - 1} and ${i} are not strictly increasing in (height, txIndex) — the gate would reject this submission`,
      };
    }
  }
  return { ok: true };
}
