/**
 * Financier Policy Engine for PRECEDENCE.
 *
 * Models heterogeneous risk evaluation across autonomous financiers:
 *  - Meridian: Senior mandate, conservative, requires clear title + high face value.
 *  - Vector: Balanced yield mandate, takes junior tranches for return.
 *  - Novum: Subordinate / unproven mandate, restricted to first-loss tranche + 2x bond.
 */
import type { Agent, AgentDecision, CollateralAsset, CollateralAnalysis, FinancierPolicy, Tranche } from "../types";

export function perDollarUtility(
  policy: FinancierPolicy,
  ratePct: number,
  riskScore: number,
  tranche: Tranche,
): number {
  const horizonFrac = 90 / 365; // standard 90-day facility
  const trancheRiskMultiplier = tranche === "SENIOR" ? 0.15 : tranche === "JUNIOR" ? 0.35 : 0.65;
  const riskPenalty = (policy.riskTolerance === "conservative" ? 0.08 : policy.riskTolerance === "balanced" ? 0.05 : 0.03) * riskScore * trancheRiskMultiplier;
  return horizonFrac * (ratePct / 100 - riskPenalty);
}

export function expectedUtility(
  policy: FinancierPolicy,
  ratePct: number,
  riskScore: number,
  tranche: Tranche,
  amountUsd: number,
): number {
  return perDollarUtility(policy, ratePct, riskScore, tranche) * amountUsd;
}

/** Deterministically evaluate collateral for one financier. */
export function evaluate(
  agent: Agent,
  collateral: CollateralAsset,
  analysis: CollateralAnalysis,
  requestedUsd: number,
): AgentDecision {
  const now = new Date().toISOString();
  const { policy } = agent;
  const targetTranche: Tranche = policy.preferredTranche;

  // Tranche-specific rate pricing: Senior earns base rate, Junior earns spread, Subordinate earns high spread
  const baseRate = analysis.estRatePct || collateral.targetRatePct || collateral.currentRatePct;
  const rate =
    targetTranche === "SENIOR"
      ? baseRate
      : targetTranche === "JUNIOR"
        ? baseRate + 2.4
        : baseRate + 4.2;

  const risk = analysis.riskScore;

  const decline = (reasoning: string): AgentDecision => ({
    agentId: agent.id,
    verb: "decline",
    tranche: targetTranche,
    amountUsd: 0,
    ratePct: rate,
    expectedUtility: 0,
    reasoning,
    source: "policy",
    decidedAt: now,
  });

  // Strict clear-title check (e.g. Meridian mandate)
  if (policy.requiredClearTitle && !collateral.verifiedClearTitle && collateral.status !== "CLEAR") {
    return decline("Mandate requires verified CLEAR title with zero existing encumbrances on Creditcoin.");
  }

  // Rate floor check
  if (rate < policy.minRatePct) {
    return decline(`Tranche rate ${rate.toFixed(1)}% is below minimum hurdle of ${policy.minRatePct.toFixed(1)}%.`);
  }

  // Risk ceiling check
  if (risk > policy.maxRiskScore) {
    return decline(`Collateral risk score ${risk.toFixed(2)} exceeds mandate cap of ${policy.maxRiskScore.toFixed(2)}.`);
  }

  const perUnit = perDollarUtility(policy, rate, risk, targetTranche);
  if (perUnit <= 0) {
    return decline(`Net expected utility per dollar is non-positive (${perUnit.toFixed(3)}).`);
  }

  const affordable = Math.max(0, Math.min(policy.maxCapitalUsd, agent.balanceUsd));
  if (affordable <= 0) return decline("No available capital balance for allocation.");

  const amount = Math.min(requestedUsd, affordable);
  const eu = perUnit * amount;

  const verb = targetTranche === "SENIOR" ? "bid-senior" : targetTranche === "JUNIOR" ? "bid-junior" : "bid-subordinate";

  if (amount >= requestedUsd) {
    return {
      agentId: agent.id,
      verb,
      tranche: targetTranche,
      amountUsd: Math.round(amount),
      ratePct: rate,
      expectedUtility: Number(eu.toFixed(2)),
      reasoning: `Locking $${Math.round(amount)} for ${targetTranche} tranche at ${rate.toFixed(1)}% target rate — E(U)=${eu.toFixed(1)}.`,
      source: "policy",
      decidedAt: now,
    };
  }

  if (policy.allowJoinSmaller) {
    return {
      agentId: agent.id,
      verb: "join-smaller",
      tranche: targetTranche,
      amountUsd: Math.round(amount),
      ratePct: rate,
      expectedUtility: Number(eu.toFixed(2)),
      reasoning: `Participating with partial $${Math.round(amount)} allocation for ${targetTranche} tranche at ${rate.toFixed(1)}%.`,
      source: "policy",
      decidedAt: now,
    };
  }

  return decline(`Requested $${requestedUsd} exceeds mandate cap ($${policy.maxCapitalUsd}) and policy prohibits smaller joins.`);
}
