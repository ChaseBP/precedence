/**
 * Collateral analysis, the document hash, and the terms validation the contract mirrors.
 *
 * @remarks `validateTerms` duplicates `CollateralRegistry.postFacilityTerms` on purpose, so a
 * borrower is told what is wrong before a transaction reverts rather than after. The two rules it
 * enforces are the ones the contract cares about: caps cannot exceed the advance the haircut
 * leaves, because the haircut IS the lenders' protection; and rates must be ordinal, because
 * senior is paid first and protected by everything beneath it, so it cannot pay more than they do.
 *
 * `collateralDocumentHash` matters for a different reason. It is what identifies a facility on
 * both paths — a registration signed on Creditcoin and one stored locally must produce the same
 * hash for the same document, or the app has two records of one asset. Which is precisely the
 * condition this protocol exists to make detectable.
 */
import { describe, expect, test } from "bun:test";
import {
  SUGGESTED_RATES,
  analyzeCollateral,
  collateralDocumentHash,
  rateFor,
  trancheSizing,
  validateTerms,
} from "../src/domain/collateral";
import { asset } from "./helpers";

const DOC = {
  assetType: "warehouse-receipt",
  docIdentifier: "WR-2026-441",
  custodian: "Antwerp Bonded Storage",
  obligor: "Northwind Metals Ltd",
  faceValueUsd: 480_000,
};

const TERMS = {
  seniorCapUsd: 5_100,
  juniorCapUsd: 2_550,
  subordinateCapUsd: 850,
  seniorRatePct: 5,
  juniorRatePct: 10,
  subordinateRatePct: 18,
};

describe("collateralDocumentHash", () => {
  test("is a 32-byte hash", () => {
    expect(collateralDocumentHash(DOC)).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("is deterministic for the same document", () => {
    expect(collateralDocumentHash(DOC)).toBe(collateralDocumentHash(DOC));
  });

  test("does not depend on key order", () => {
    const shuffled = {
      faceValueUsd: DOC.faceValueUsd,
      obligor: DOC.obligor,
      assetType: DOC.assetType,
      custodian: DOC.custodian,
      docIdentifier: DOC.docIdentifier,
    };
    expect(collateralDocumentHash(shuffled)).toBe(collateralDocumentHash(DOC));
  });

  test("changes when the document identifier changes", () => {
    expect(collateralDocumentHash({ ...DOC, docIdentifier: "WR-2026-442" })).not.toBe(
      collateralDocumentHash(DOC),
    );
  });

  test("changes when the face value changes", () => {
    expect(collateralDocumentHash({ ...DOC, faceValueUsd: 480_001 })).not.toBe(
      collateralDocumentHash(DOC),
    );
  });

  test("changes when the custodian changes", () => {
    expect(collateralDocumentHash({ ...DOC, custodian: "Rotterdam Silos" })).not.toBe(
      collateralDocumentHash(DOC),
    );
  });

  test("changes when the obligor changes", () => {
    expect(collateralDocumentHash({ ...DOC, obligor: "Someone Else Ltd" })).not.toBe(
      collateralDocumentHash(DOC),
    );
  });

  test("is case sensitive, so two spellings are two documents", () => {
    expect(collateralDocumentHash({ ...DOC, obligor: "NORTHWIND METALS LTD" })).not.toBe(
      collateralDocumentHash(DOC),
    );
  });
});

describe("analyzeCollateral", () => {
  test("derives the maximum draw from the haircut", () => {
    expect(analyzeCollateral(asset()).maxDrawUsd).toBe(8_500);
  });

  test("reports the haircut in dollars", () => {
    expect(analyzeCollateral(asset()).haircutUsd).toBe(1_500);
  });

  test("reports the advance rate as the complement of the haircut", () => {
    expect(analyzeCollateral(asset({ haircutPct: 22 })).advanceRatePct).toBe(78);
  });

  test("defaults a missing haircut to fifteen per cent", () => {
    const a = analyzeCollateral(asset({ haircutPct: undefined as never }));
    expect(a.advanceRatePct).toBe(85);
  });

  test("splits a request 60/30/10 across the tranches", () => {
    const t = analyzeCollateral(asset(), 5_000).suggestedTranches;
    expect(t.seniorUsd).toBe(3_000);
    expect(t.juniorUsd).toBe(1_500);
    expect(t.subordinateUsd).toBe(500);
  });

  test("splits the ADVANCE, not the request, once the request exceeds it", () => {
    // 10,000 asked against a 10,000 receipt at a 15% haircut: the split is of 8,500.
    const t = analyzeCollateral(asset(), 10_000).suggestedTranches;
    expect(t.seniorUsd).toBe(5_100);
    expect(t.juniorUsd).toBe(2_550);
    expect(t.subordinateUsd).toBe(850);
  });

  test("caps the split at the advance available", () => {
    const t = analyzeCollateral(asset(), 999_999).suggestedTranches;
    expect(t.seniorUsd + t.juniorUsd + t.subordinateUsd).toBe(8_500);
  });

  test("never suggests a negative subordinate slice", () => {
    const t = analyzeCollateral(asset(), 1).suggestedTranches;
    expect(t.subordinateUsd).toBeGreaterThanOrEqual(0);
  });

  test("defaults the request to the facility's own", () => {
    const t = analyzeCollateral(asset()).suggestedTranches;
    expect(t.seniorUsd + t.juniorUsd + t.subordinateUsd).toBe(8_500);
  });

  test("suggests ordinal rates", () => {
    const t = analyzeCollateral(asset()).suggestedTranches;
    expect(t.seniorRatePct).toBeLessThan(t.juniorRatePct);
    expect(t.juniorRatePct).toBeLessThan(t.subordinateRatePct);
  });

  test("uses a wide spread, so the risk premium is legible", () => {
    expect(SUGGESTED_RATES.SUBORDINATE - SUGGESTED_RATES.SENIOR).toBeGreaterThanOrEqual(10);
  });

  test("prefers the target rate as the estimate", () => {
    expect(analyzeCollateral(asset()).estRatePct).toBe(5.2);
  });

  test("falls back to the current rate when no target is set", () => {
    expect(analyzeCollateral(asset({ targetRatePct: 0, currentRatePct: 9.4 })).estRatePct).toBe(9.4);
  });

  test("says clear title only when the registry reports it", () => {
    expect(analyzeCollateral(asset()).notes.join(" ")).toContain("Verified clear title");
    expect(analyzeCollateral(asset({ verifiedClearTitle: false })).notes.join(" ")).toContain(
      "Existing encumbrance",
    );
  });

  test("names the custodian and its location", () => {
    const notes = analyzeCollateral(asset()).notes.join(" ");
    expect(notes).toContain("Santos Port Terminal");
    expect(notes).toContain("Santos, Brazil");
  });

  test("carries the facility's own id", () => {
    expect(analyzeCollateral(asset({ id: "col-xyz" })).collateralId).toBe("col-xyz");
  });

  test("passes the risk score through rather than recomputing it", () => {
    expect(analyzeCollateral(asset({ riskScore: 0.42 })).riskScore).toBe(0.42);
  });
});

describe("trancheSizing", () => {
  test("uses the borrower's posted terms when there are any", () => {
    const a = asset({ terms: { ...TERMS, termDays: 90, postedAt: "2026-09-01T00:00:00.000Z" } });
    expect(trancheSizing(a, analyzeCollateral(a))).toEqual({
      seniorUsd: 5_100,
      juniorUsd: 2_550,
      subordinateUsd: 850,
    });
  });

  test("falls back to the suggestion when nothing is posted", () => {
    const a = asset({ terms: undefined });
    const sizing = trancheSizing(a, analyzeCollateral(a));
    expect(sizing.seniorUsd).toBe(5_100);
  });

  test("posted terms win even when they differ from the suggestion", () => {
    const a = asset({
      terms: { ...TERMS, seniorCapUsd: 1, termDays: 90, postedAt: "2026-09-01T00:00:00.000Z" },
    });
    expect(trancheSizing(a, analyzeCollateral(a)).seniorUsd).toBe(1);
  });
});

describe("rateFor", () => {
  test("returns the posted coupon for each tranche", () => {
    const a = asset({ terms: { ...TERMS, termDays: 90, postedAt: "2026-09-01T00:00:00.000Z" } });
    expect(rateFor(a, "SENIOR")).toBe(5);
    expect(rateFor(a, "JUNIOR")).toBe(10);
    expect(rateFor(a, "SUBORDINATE")).toBe(18);
  });

  test("falls back to the suggested coupon when nothing is posted", () => {
    const a = asset({ terms: undefined });
    expect(rateFor(a, "SENIOR")).toBe(SUGGESTED_RATES.SENIOR);
  });

  test("posted terms override the suggestion", () => {
    const a = asset({
      terms: { ...TERMS, seniorRatePct: 3.75, termDays: 90, postedAt: "2026-09-01T00:00:00.000Z" },
    });
    expect(rateFor(a, "SENIOR")).toBe(3.75);
  });
});

describe("validateTerms — mirroring the contract's own checks", () => {
  test("accepts terms inside the advance", () => {
    expect(validateTerms(asset(), TERMS).ok).toBe(true);
  });

  test("rejects a facility of zero", () => {
    const r = validateTerms(asset(), {
      ...TERMS,
      seniorCapUsd: 0,
      juniorCapUsd: 0,
      subordinateCapUsd: 0,
    });
    expect(r.ok).toBe(false);
    expect(r.problems).toContain("Facility size must be greater than zero.");
  });

  test("accepts caps totalling exactly the advance", () => {
    const r = validateTerms(asset(), {
      ...TERMS,
      seniorCapUsd: 8_500,
      juniorCapUsd: 0,
      subordinateCapUsd: 0,
    });
    expect(r.ok).toBe(true);
  });

  test("rejects caps one dollar past the advance", () => {
    const r = validateTerms(asset(), {
      ...TERMS,
      seniorCapUsd: 8_501,
      juniorCapUsd: 0,
      subordinateCapUsd: 0,
    });
    expect(r.ok).toBe(false);
  });

  test("says the haircut is the lenders' protection", () => {
    const r = validateTerms(asset(), { ...TERMS, seniorCapUsd: 100_000 });
    expect(r.problems.join(" ")).toContain("lenders' protection");
  });

  test("quotes both the total and the advance", () => {
    const r = validateTerms(asset(), { ...TERMS, seniorCapUsd: 100_000 });
    expect(r.problems.join(" ")).toContain("8,500");
  });

  test("rejects a senior rate above junior", () => {
    const r = validateTerms(asset(), { ...TERMS, seniorRatePct: 12 });
    expect(r.ok).toBe(false);
    expect(r.problems.join(" ")).toContain("Rates must increase with risk");
  });

  test("rejects a junior rate above subordinate", () => {
    const r = validateTerms(asset(), { ...TERMS, juniorRatePct: 20 });
    expect(r.ok).toBe(false);
  });

  test("accepts equal rates across tranches", () => {
    const r = validateTerms(asset(), {
      ...TERMS,
      seniorRatePct: 7,
      juniorRatePct: 7,
      subordinateRatePct: 7,
    });
    expect(r.ok).toBe(true);
  });

  test("explains that senior is paid first", () => {
    const r = validateTerms(asset(), { ...TERMS, seniorRatePct: 12 });
    expect(r.problems.join(" ")).toContain("paid first");
  });

  test("rejects a rate above one hundred per cent", () => {
    const r = validateTerms(asset(), { ...TERMS, subordinateRatePct: 101 });
    expect(r.problems).toContain("Rates above 100% are rejected.");
  });

  test("reports several problems at once", () => {
    const r = validateTerms(asset(), {
      ...TERMS,
      seniorCapUsd: 100_000,
      seniorRatePct: 99,
      subordinateRatePct: 101,
    });
    expect(r.problems.length).toBeGreaterThanOrEqual(3);
  });

  test("scales the advance with the haircut", () => {
    // A thinner haircut leaves more advance, so the same caps become legal.
    const thick = validateTerms(asset({ haircutPct: 50 }), { ...TERMS, seniorCapUsd: 6_000 });
    const thin = validateTerms(asset({ haircutPct: 5 }), { ...TERMS, seniorCapUsd: 6_000 });
    expect(thick.ok).toBe(false);
    expect(thin.ok).toBe(true);
  });

  test("allows a two-tranche facility", () => {
    const r = validateTerms(asset(), { ...TERMS, subordinateCapUsd: 0 });
    expect(r.ok).toBe(true);
  });

  test("returns no problems when it passes", () => {
    expect(validateTerms(asset(), TERMS).problems).toEqual([]);
  });
});
