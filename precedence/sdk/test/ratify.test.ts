/**
 * The ratification seam: a model proposes, deterministic policy ratifies.
 *
 * @remarks This is the architectural rule of the whole project expressed as a function, so it is
 * worth testing carefully. Nothing a model produces is evidence. Every field is rejected by
 * default and has to earn acceptance, the registered values are never overwritten, and a
 * disagreement between the document and the registration is reported as a **flag** rather than
 * silently applied as a correction — because that disagreement is exactly the situation a person
 * should look at.
 *
 * `sanitizeNarration` guards the cosmetic path. Narration moves no money, but it reaches a judge's
 * screen, so it must not assert that something was proven — only the precompile's return value
 * establishes that.
 */
import { describe, expect, test } from "bun:test";
import {
  EXTRACTION_LIMITS,
  ratifyExtraction,
  sanitizeNarration,
} from "../src/domain/ratify";
import { asset, extraction } from "./helpers";

describe("ratifyExtraction — confidence", () => {
  test("accepts a confident extraction", () => {
    expect(ratifyExtraction(extraction(), asset()).extraction.ratified).toBe(true);
  });

  test("discards everything below the confidence floor", () => {
    const r = ratifyExtraction(extraction({ confidence: 0.5 }), asset());
    expect(r.extraction.ratified).toBe(false);
    expect(r.accepted).toEqual({});
  });

  test("says the whole extraction was discarded", () => {
    const r = ratifyExtraction(extraction({ confidence: 0.5 }), asset());
    expect(r.extraction.ratificationNotes.join(" ")).toContain("discarded in full");
  });

  test("names the floor it fell below", () => {
    const r = ratifyExtraction(extraction({ confidence: 0.5 }), asset());
    expect(r.rejected[0].reason).toContain(String(EXTRACTION_LIMITS.minConfidence));
  });

  test("accepts confidence exactly at the floor", () => {
    const r = ratifyExtraction(
      extraction({ confidence: EXTRACTION_LIMITS.minConfidence }),
      asset(),
    );
    expect(r.extraction.ratified).toBe(true);
  });

  test("stops at the floor rather than checking fields it will not use", () => {
    const r = ratifyExtraction(
      extraction({ confidence: 0.1, faceValueUsd: -5, obligor: "" }),
      asset(),
    );
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0].field).toBe("*");
  });

  test("rejects an unknown extraction source", () => {
    const r = ratifyExtraction(extraction({ source: "vibes" as never }), asset());
    expect(r.extraction.ratified).toBe(false);
    expect(r.rejected.some((x) => x.reason.includes("unknown extraction source"))).toBe(true);
  });

  test("accepts a manual extraction as well as a model's", () => {
    expect(ratifyExtraction(extraction({ source: "manual" }), asset()).extraction.ratified).toBe(
      true,
    );
  });
});

describe("ratifyExtraction — face value", () => {
  test("accepts a figure that corroborates the registration", () => {
    const r = ratifyExtraction(extraction({ faceValueUsd: 10_000 }), asset());
    expect(r.accepted.faceValueUsd).toBe(10_000);
  });

  test("accepts a small divergence and says how small", () => {
    const r = ratifyExtraction(extraction({ faceValueUsd: 10_500 }), asset());
    expect(r.accepted.faceValueUsd).toBe(10_500);
    expect(r.extraction.ratificationNotes.join(" ")).toContain("corroborated");
  });

  test("flags a large divergence rather than applying it", () => {
    const r = ratifyExtraction(extraction({ faceValueUsd: 50_000 }), asset());
    expect(r.accepted.faceValueUsd).toBeUndefined();
    expect(r.extraction.ratified).toBe(false);
  });

  test("calls a large divergence a DISCREPANCY for a human to look at", () => {
    const r = ratifyExtraction(extraction({ faceValueUsd: 50_000 }), asset());
    expect(r.extraction.ratificationNotes.join(" ")).toContain("DISCREPANCY");
  });

  test("says it was flagged rather than applied", () => {
    const r = ratifyExtraction(extraction({ faceValueUsd: 50_000 }), asset());
    expect(r.rejected.find((x) => x.field === "faceValueUsd")?.reason).toContain(
      "flagged for review rather than applied",
    );
  });

  test("never overwrites the registered figure", () => {
    const registered = asset();
    ratifyExtraction(extraction({ faceValueUsd: 999_999 }), registered);
    expect(registered.faceValueUsd).toBe(10_000);
  });

  test("accepts a divergence right at the drift limit", () => {
    const limit = 10_000 * (1 + EXTRACTION_LIMITS.maxFaceValueDriftPct / 100);
    const r = ratifyExtraction(extraction({ faceValueUsd: limit }), asset());
    expect(r.accepted.faceValueUsd).toBe(limit);
  });

  test("rejects a figure below the financeable band", () => {
    const r = ratifyExtraction(
      extraction({ faceValueUsd: 100 }),
      asset({ faceValueUsd: 100 }),
    );
    expect(r.rejected.some((x) => x.field === "faceValueUsd")).toBe(true);
  });

  test("rejects a figure above the financeable band", () => {
    const r = ratifyExtraction(
      extraction({ faceValueUsd: 99_000_000 }),
      asset({ faceValueUsd: 99_000_000 }),
    );
    expect(r.rejected.some((x) => x.reason.includes("outside the financeable band"))).toBe(true);
  });

  test("rejects a negative figure", () => {
    const r = ratifyExtraction(extraction({ faceValueUsd: -1 }), asset());
    expect(r.rejected.some((x) => x.reason.includes("positive finite"))).toBe(true);
  });

  test("rejects a non-finite figure", () => {
    const r = ratifyExtraction(extraction({ faceValueUsd: Number.NaN }), asset());
    expect(r.rejected.some((x) => x.field === "faceValueUsd")).toBe(true);
  });

  test("skips the check when the model read no figure", () => {
    const r = ratifyExtraction(extraction({ faceValueUsd: undefined }), asset());
    expect(r.rejected.some((x) => x.field === "faceValueUsd")).toBe(false);
  });
});

describe("ratifyExtraction — free text corroborates, never corrects", () => {
  test("accepts an exact match", () => {
    expect(ratifyExtraction(extraction(), asset()).accepted.obligor).toBe(
      "Atlas Coffee Importers LLC",
    );
  });

  test("accepts a match that differs only by a company suffix", () => {
    const r = ratifyExtraction(extraction({ obligor: "Atlas Coffee Importers" }), asset());
    expect(r.accepted.obligor).toBe("Atlas Coffee Importers");
  });

  test("accepts a custodian that also carries its location", () => {
    // The case that used to fail: a receipt naming the terminal AND the city corroborates a
    // registration whose location is a separate field. A flag that fires on a clean document
    // teaches everyone to ignore flags.
    const r = ratifyExtraction(
      extraction({ custodian: "Santos Port Terminal #4 Vaults, Santos, Brazil" }),
      asset(),
    );
    expect(r.accepted.custodian).toBeDefined();
  });

  test("ignores case and punctuation", () => {
    const r = ratifyExtraction(extraction({ obligor: "atlas coffee importers, llc." }), asset());
    expect(r.accepted.obligor).toBeDefined();
  });

  test("flags a genuinely different name", () => {
    const r = ratifyExtraction(extraction({ obligor: "Rotterdam Grain BV" }), asset());
    expect(r.accepted.obligor).toBeUndefined();
    expect(r.extraction.ratificationNotes.join(" ")).toContain("DISCREPANCY");
  });

  test("says a mismatch was flagged, not applied", () => {
    const r = ratifyExtraction(extraction({ obligor: "Rotterdam Grain BV" }), asset());
    expect(r.rejected.find((x) => x.field === "obligor")?.reason).toContain("flagged, not applied");
  });

  test("rejects an implausibly short value", () => {
    const r = ratifyExtraction(extraction({ custodian: "x" }), asset());
    expect(r.rejected.find((x) => x.field === "custodian")?.reason).toContain("implausibly short");
  });

  test("rejects an empty value", () => {
    const r = ratifyExtraction(extraction({ custodian: "   " }), asset());
    expect(r.rejected.some((x) => x.field === "custodian")).toBe(true);
  });

  test("trims what it accepts", () => {
    const r = ratifyExtraction(extraction({ obligor: "  Atlas Coffee Importers LLC  " }), asset());
    expect(r.accepted.obligor).toBe("Atlas Coffee Importers LLC");
  });

  test("checks obligor and custodian independently", () => {
    const r = ratifyExtraction(extraction({ obligor: "Wrong Name Ltd" }), asset());
    expect(r.accepted.custodian).toBeDefined();
    expect(r.accepted.obligor).toBeUndefined();
  });

  test("never accepts a field the registration does not have", () => {
    const r = ratifyExtraction(extraction(), asset({ custodian: "" }));
    expect(r.accepted.custodian).toBeUndefined();
  });
});

describe("ratifyExtraction — expiry", () => {
  test("rejects an unparseable date", () => {
    const r = ratifyExtraction(extraction({ expiry: "next Tuesday-ish" }), asset());
    expect(r.rejected.some((x) => x.field === "expiry")).toBe(true);
  });

  test("warns about a document that has already expired", () => {
    const r = ratifyExtraction(extraction({ expiry: "2020-01-01T00:00:00.000Z" }), asset());
    expect(r.extraction.ratificationNotes.join(" ")).toContain("WARNING");
  });

  test("a past expiry is a warning, not a rejection", () => {
    const r = ratifyExtraction(extraction({ expiry: "2020-01-01T00:00:00.000Z" }), asset());
    expect(r.extraction.ratified).toBe(true);
  });

  test("says nothing about a future expiry", () => {
    const r = ratifyExtraction(extraction({ expiry: "2099-01-01T00:00:00.000Z" }), asset());
    expect(r.extraction.ratificationNotes.join(" ")).not.toContain("WARNING");
  });
});

describe("ratifyExtraction — the record it returns", () => {
  test("marks itself ratified only when nothing was rejected", () => {
    expect(ratifyExtraction(extraction(), asset()).extraction.ratified).toBe(true);
    expect(
      ratifyExtraction(extraction({ obligor: "Nope Ltd" }), asset()).extraction.ratified,
    ).toBe(false);
  });

  test("carries the model's original claims unchanged", () => {
    const proposal = extraction({ faceValueUsd: 10_500 });
    const r = ratifyExtraction(proposal, asset());
    expect(r.extraction.faceValueUsd).toBe(10_500);
    expect(r.extraction.model).toBe("test-double");
  });

  test("keeps accepted and rejected apart", () => {
    const r = ratifyExtraction(
      extraction({ faceValueUsd: 10_100, obligor: "Nope Ltd" }),
      asset(),
    );
    expect(r.accepted.faceValueUsd).toBe(10_100);
    expect(r.rejected.map((x) => x.field)).toContain("obligor");
  });

  test("explains every rejection", () => {
    const r = ratifyExtraction(
      extraction({ faceValueUsd: 90_000, obligor: "Nope Ltd", custodian: "x" }),
      asset(),
    );
    for (const x of r.rejected) expect(x.reason.length).toBeGreaterThan(10);
  });
});

describe("sanitizeNarration", () => {
  test("passes clean prose through", () => {
    const r = sanitizeNarration("Meridian locked senior capital against the Santos receipt.");
    expect(r.flags).toEqual([]);
  });

  test("collapses whitespace", () => {
    expect(sanitizeNarration("a   b\n\nc").text).toBe("a b c");
  });

  test("trims", () => {
    expect(sanitizeNarration("  hello  ").text).toBe("hello");
  });

  test("truncates past the limit and says so", () => {
    const r = sanitizeNarration("x".repeat(500));
    expect(r.text.length).toBeLessThanOrEqual(400);
    expect(r.flags).toContain("truncated");
  });

  test("honours a custom limit", () => {
    const r = sanitizeNarration("x".repeat(50), 10);
    expect(r.text).toHaveLength(10);
  });

  test("flags a claim that something was proven", () => {
    expect(sanitizeNarration("The lock is proven on chain.").flags).toContain("asserts proof");
  });

  test("flags a claim that something was verified", () => {
    expect(sanitizeNarration("Verified at the precompile.").flags).toContain("asserts proof");
  });

  test("flags a hash-like literal, which a model must not invent", () => {
    expect(sanitizeNarration("See 0xdeadbeefdeadbeefdeadbeef.").flags).toContain(
      "contains a hash-like literal",
    );
  });

  test("flags overclaimed certainty", () => {
    expect(sanitizeNarration("This facility is risk-free.").flags).toContain(
      "overclaims certainty",
    );
  });

  test("flags a guarantee", () => {
    expect(sanitizeNarration("Repayment is guaranteed.").flags).toContain("overclaims certainty");
  });

  test("returns the text even when it flags it, because narration is cosmetic", () => {
    const r = sanitizeNarration("Proven and guaranteed.");
    expect(r.text).toBe("Proven and guaranteed.");
    expect(r.flags.length).toBeGreaterThan(1);
  });

  test("does not flag a short hex value that is not hash-shaped", () => {
    expect(sanitizeNarration("Tranche 0xff was filled.").flags).toEqual([]);
  });
});
