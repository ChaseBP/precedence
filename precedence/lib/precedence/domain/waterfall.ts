/**
 * Strict seniority waterfall and loss allocation.
 *
 * This replaces the ported pro-rata split (`DECISIONS.md` "functional bug #2"), which was the
 * economic OPPOSITE of the protocol's claim. Priority means nothing if proceeds are shared evenly.
 *
 * Repayment (performing):
 *   1. Protocol + prover fees deducted off the top.
 *   2. SENIOR receives principal AND interest IN FULL before junior receives anything at all.
 *   3. Then JUNIOR, in full, before subordinate receives anything.
 *   4. Then SUBORDINATE. Any residual returns to the obligor.
 *
 * Liquidation (distressed) — the same waterfall run downward, which is what makes the loss land
 * where the pricing said it would:
 *   1. Fees.
 *   2. SENIOR made whole first out of recovery proceeds.
 *   3. Whatever remains flows to JUNIOR, then SUBORDINATE.
 *   4. Shortfalls are absorbed bottom-up: SUBORDINATE takes first loss, then JUNIOR, then SENIOR.
 */
import type { PriorityClaim, WaterfallLine, WaterfallResult } from "../types";

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface WaterfallOpts {
  protocolFeeBps: number;
  proverFeeBps: number;
  /** Accrual period in days. Defaults to a 90-day facility. */
  termDays?: number;
  kind?: "REPAYMENT" | "LIQUIDATION";
}

/**
 * Run the waterfall over `claims`, strictly in priority rank order.
 *
 * `totalRepaidUsd` is the realised amount — for a performing payoff it comes from the *decoded,
 * verified* repayment transaction; for a liquidation it is the auction's clearing proceeds.
 */
export function computeWaterfall(
  claims: PriorityClaim[],
  totalRepaidUsd: number,
  opts: WaterfallOpts,
): WaterfallResult {
  const termDays = opts.termDays ?? 90;
  const kind = opts.kind ?? "REPAYMENT";

  const protocolFeeUsd = round2(totalRepaidUsd * (opts.protocolFeeBps / 10000));
  const proverFeeUsd = round2(totalRepaidUsd * (opts.proverFeeBps / 10000));
  const distributableUsd = round2(Math.max(0, totalRepaidUsd - protocolFeeUsd - proverFeeUsd));

  // Strict rank order. Rank 1 (SENIOR) is satisfied completely before rank 2 sees a cent.
  const ordered = [...claims].sort((a, b) => a.priorityRank - b.priorityRank);

  let remaining = distributableUsd;
  const lines: WaterfallLine[] = [];

  for (const claim of ordered) {
    const principal = claim.principalUsd;
    // Interest is only *earned* on a performing payoff. A liquidation recovers principal first.
    const interestDueUsd =
      kind === "REPAYMENT" ? round2(principal * (claim.ratePct / 100) * (termDays / 365)) : 0;
    const totalDue = round2(principal + interestDueUsd);

    const payoutUsd = round2(Math.min(remaining, totalDue));
    const principalReturnedUsd = round2(Math.min(principal, payoutUsd));
    const interestEarnedUsd = round2(Math.max(0, payoutUsd - principalReturnedUsd));
    const lossAbsorbedUsd = round2(principal - principalReturnedUsd);

    lines.push({
      agentId: claim.holder,
      tranche: claim.tranche,
      priorityRank: claim.priorityRank,
      contributedUsd: principal,
      interestDueUsd,
      interestEarnedUsd,
      principalReturnedUsd,
      lossAbsorbedUsd,
      payoutUsd,
      satisfiedInFull: payoutUsd >= totalDue,
    });

    remaining = round2(Math.max(0, remaining - payoutUsd));
  }

  return {
    realizedRepaymentUsd: round2(totalRepaidUsd),
    protocolFeeUsd,
    proverFeeUsd,
    distributableUsd,
    kind,
    lines,
    unallocatedUsd: remaining,
    computedAt: new Date().toISOString(),
  };
}

/**
 * Assert the waterfall actually respected seniority.
 *
 * Used by tests and by the demo's Judge Mode: if any tranche received a payout while a more senior
 * tranche went unsatisfied, the protocol's central claim is false. Cheap to check, so check it.
 */
export function assertSeniorityRespected(result: WaterfallResult): { ok: boolean; violations: string[] } {
  const violations: string[] = [];
  const ordered = [...result.lines].sort((a, b) => a.priorityRank - b.priorityRank);

  for (let i = 1; i < ordered.length; i++) {
    const senior = ordered[i - 1];
    const junior = ordered[i];
    if (!senior.satisfiedInFull && junior.payoutUsd > 0) {
      violations.push(
        `${junior.tranche} (rank ${junior.priorityRank}) received $${junior.payoutUsd.toLocaleString()} while ` +
          `${senior.tranche} (rank ${senior.priorityRank}) was short $${senior.lossAbsorbedUsd.toLocaleString()}`,
      );
    }
  }
  return { ok: violations.length === 0, violations };
}

/** Total loss by tranche — first loss should land on the most subordinate holder. */
export function lossByTranche(result: WaterfallResult): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of result.lines) out[l.tranche] = round2((out[l.tranche] ?? 0) + l.lossAbsorbedUsd);
  return out;
}
