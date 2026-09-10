/**
 * Collateral Registration and Risk Analysis for PRECEDENCE.
 *
 * Real-world collateral assets (warehouse receipts, trade receivables, commodity pledges)
 * minted as hash-unique NFTs on Creditcoin CC3.
 */
import type { CollateralAnalysis, CollateralAsset, FacilityTerms, Hex, Tranche } from "../types";
import { hashObject } from "../hash";

/** Generate canonical hash-unique identifier for a collateral asset on Creditcoin. */
export function collateralDocumentHash(doc: {
  assetType: string;
  docIdentifier: string;
  custodian: string;
  obligor: string;
  faceValueUsd: number;
}): Hex {
  return hashObject(doc);
}

/** Analyze collateral risk, haircut, and recommend tranche breakdown. */
export function analyzeCollateral(collateral: CollateralAsset, requestedUsd?: number): CollateralAnalysis {
  const req = requestedUsd ?? collateral.financingRequestedUsd;
  const haircutPct = collateral.haircutPct ?? 15;
  const maxDrawUsd = Math.round(collateral.faceValueUsd * (1 - haircutPct / 100));
  const effectiveFunding = Math.min(req, maxDrawUsd);

  // A SUGGESTION to pre-fill the borrower's form. Once they post terms, those are authoritative:
  // showing a suggested rate as if it were the offer would tell a lender something untrue.
  const seniorUsd = Math.round(effectiveFunding * 0.6);
  const juniorUsd = Math.round(effectiveFunding * 0.3);
  const subordinateUsd = Math.max(0, effectiveFunding - seniorUsd - juniorUsd);

  const notes = [
    `15% safety margin held back ($${Math.round(collateral.faceValueUsd * 0.15).toLocaleString()} buffer for lenders)`,
    collateral.verifiedClearTitle ? "Verified clear title — zero prior liens on Creditcoin CC3" : "Existing encumbrance detected",
    `Custodian verified: ${collateral.custodian} (${collateral.custodianLocation})`,
  ];

  return {
    collateralId: collateral.id,
    estRatePct: collateral.targetRatePct || collateral.currentRatePct,
    riskScore: collateral.riskScore,
    advanceRatePct: 100 - haircutPct,
    haircutUsd: Math.round(collateral.faceValueUsd * (haircutPct / 100)),
    maxDrawUsd,
    notes,
    suggestedTranches: {
      seniorUsd,
      juniorUsd,
      subordinateUsd,
      // Ordinal by construction: senior is protected by everything beneath it, so it is the
      // cheapest capital. The contract rejects any posting that inverts this.
      seniorRatePct: SUGGESTED_RATES.SENIOR,
      juniorRatePct: SUGGESTED_RATES.JUNIOR,
      subordinateRatePct: SUGGESTED_RATES.SUBORDINATE,
    },
  };
}

/**
 * Default coupons offered to a borrower as a starting point.
 *
 * @remarks Deliberately a wide spread. First-loss capital that earns barely more than protected
 * capital is not a real risk premium, and the demo should make the trade-off legible.
 */
export const SUGGESTED_RATES = { SENIOR: 5, JUNIOR: 10, SUBORDINATE: 18 } as const;

/** Per-tranche capacity for a facility: the posted terms if any, otherwise the suggestion. */
export function trancheSizing(
  collateral: CollateralAsset,
  analysis: CollateralAnalysis,
): { seniorUsd: number; juniorUsd: number; subordinateUsd: number } {
  const t = collateral.terms;
  if (t) {
    return { seniorUsd: t.seniorCapUsd, juniorUsd: t.juniorCapUsd, subordinateUsd: t.subordinateCapUsd };
  }
  const s = analysis.suggestedTranches;
  return { seniorUsd: s.seniorUsd, juniorUsd: s.juniorUsd, subordinateUsd: s.subordinateUsd };
}

/** The coupon a tranche actually pays on this facility. Posted terms win. */
export function rateFor(collateral: CollateralAsset, tranche: Tranche): number {
  const t = collateral.terms;
  if (t) {
    return tranche === "SENIOR" ? t.seniorRatePct : tranche === "JUNIOR" ? t.juniorRatePct : t.subordinateRatePct;
  }
  return SUGGESTED_RATES[tranche];
}

/**
 * Validate a borrower's proposed terms before they are posted.
 * @remarks Mirrors the contract's checks so the form can reject locally instead of on a revert.
 */
export function validateTerms(
  collateral: CollateralAsset,
  t: Omit<FacilityTerms, "termDays" | "postedAt">,
): { ok: boolean; problems: string[] } {
  const problems: string[] = [];
  const total = t.seniorCapUsd + t.juniorCapUsd + t.subordinateCapUsd;
  const maxAdvance = Math.round(collateral.faceValueUsd * (1 - collateral.haircutPct / 100));

  if (total <= 0) problems.push("Facility size must be greater than zero.");
  if (total > maxAdvance) {
    problems.push(
      `Tranche caps total $${total.toLocaleString()}, above the $${maxAdvance.toLocaleString()} ` +
        `advance available after the ${collateral.haircutPct}% haircut. The haircut is the lenders' ` +
        `protection, so the facility cannot be sized past it.`,
    );
  }
  if (!(t.seniorRatePct <= t.juniorRatePct && t.juniorRatePct <= t.subordinateRatePct)) {
    problems.push(
      "Rates must increase with risk: senior ≤ junior ≤ subordinate. Senior is paid first and is " +
        "protected by the tranches beneath it, so it cannot pay more than they do.",
    );
  }
  if (t.subordinateRatePct > 100) problems.push("Rates above 100% are rejected.");
  return { ok: problems.length === 0, problems };
}
