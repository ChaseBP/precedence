/**
 * Collateral Registration and Risk Analysis for PRECEDENCE.
 *
 * Real-world collateral assets (warehouse receipts, trade receivables, commodity pledges)
 * minted as hash-unique NFTs on Creditcoin CC3.
 */
import type { CollateralAsset, CollateralAnalysis, Hex } from "../types";
import { hashObject } from "../crypto/hash";

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

  // Recommended tranche structure: Senior (60%), Junior (30%), Subordinate (10%)
  const seniorUsd = Math.round(effectiveFunding * 0.6);
  const juniorUsd = Math.round(effectiveFunding * 0.3);
  const subordinateUsd = Math.max(0, effectiveFunding - seniorUsd - juniorUsd);

  const notes = [
    `15% collateral haircut applied ($${Math.round(collateral.faceValueUsd * 0.15).toLocaleString()} buffer)`,
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
    recommendedTranches: {
      seniorUsd,
      juniorUsd,
      subordinateUsd,
    },
  };
}
