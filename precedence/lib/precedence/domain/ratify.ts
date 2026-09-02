/**
 * The ratification seam: where a model's proposal meets deterministic policy.
 *
 * @remarks
 * **The architectural rule this file exists to enforce:** an LLM emits a PROPOSAL; a deterministic
 * filter validates it against hard limits; only then does anything on-chain happen. Nothing a model
 * produces is ever treated as evidence.
 *
 * Why it is drawn here rather than left as a convention:
 *
 *  - Priority settles from cryptographic proof. A model anywhere near settlement would undercut the
 *    project's own headline claim.
 *  - A demo must be reproducible. Bids that vary between rehearsals are a liability.
 *  - A judge can verify a policy function with visible weights. They cannot verify a model's
 *    decision.
 *
 * So the LLM is used where it is genuinely the right tool and cannot cause harm: turning
 * unstructured paper into structured fields. That is real trade-finance work a policy function
 * cannot do at all, and it sits strictly UPSTREAM of any capital decision.
 */
import type { CollateralAsset, DocumentExtraction } from "../types";

/** Bounds any extracted figure must fall inside to be usable. */
export const EXTRACTION_LIMITS = {
  /** Below this a facility is not worth financing; above it, something is wrong with the document. */
  minFaceValueUsd: 1_000,
  maxFaceValueUsd: 50_000_000,
  /** A model that is not reasonably sure about a figure does not get to set it. */
  minConfidence: 0.7,
  /** How far an extracted face value may diverge from the registered one before we refuse it. */
  maxFaceValueDriftPct: 25,
} as const;

export interface RatificationResult {
  extraction: DocumentExtraction;
  /** Only these fields passed and may be used. */
  accepted: Partial<Pick<CollateralAsset, "faceValueUsd" | "obligor" | "custodian">>;
  rejected: { field: string; reason: string }[];
}

/**
 * Does an extracted free-text field corroborate the registered one?
 *
 * @remarks Exact string equality was too strict to be useful. A warehouse receipt naming
 * "Santos Port Terminal #4 Vaults, Santos, Brazil" genuinely corroborates a registration whose
 * custodian is "Santos Port Terminal #4 Vaults" and whose location is a separate field — reporting
 * that as a DISCREPANCY made a clean document fail ratification, and a flag that fires on correct
 * documents trains everyone to ignore flags.
 *
 * So: normalise punctuation and case, then accept containment in either direction. This is
 * deliberately about corroboration and nothing more — neither value is ever written back over the
 * registration, so a generous match cannot alter the authoritative record.
 */
function freeTextCorroborates(extracted: string, registered: string): boolean {
  const norm = (x: string) =>
    x
      .toLowerCase()
      .replace(/[.,;:'"()\[\]]/g, " ")
      .replace(/\b(ltd|llc|inc|s\.?a\.?|gmbh|plc|co|corp|company|limited)\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();

  const a = norm(extracted);
  const b = norm(registered);
  if (!a || !b) return false;
  return a === b || a.includes(b) || b.includes(a);
}

/**
 * Ratify a model's document extraction against the registered collateral.
 *
 * @param proposal what the model claims it read
 * @param registered the on-chain record, which is authoritative
 *
 * @remarks Every field is rejected by default and must earn acceptance. The registered values are
 * never overwritten by an extraction — the extraction can only *corroborate* or *flag* them, which
 * is the honest limit of what reading a document can establish.
 */
export function ratifyExtraction(
  proposal: DocumentExtraction,
  registered: CollateralAsset,
): RatificationResult {
  const accepted: RatificationResult["accepted"] = {};
  const rejected: { field: string; reason: string }[] = [];
  const notes: string[] = [];

  if (proposal.source !== "llm" && proposal.source !== "manual") {
    rejected.push({ field: "*", reason: `unknown extraction source "${proposal.source}"` });
  }

  if (proposal.confidence < EXTRACTION_LIMITS.minConfidence) {
    rejected.push({
      field: "*",
      reason:
        `self-reported confidence ${proposal.confidence.toFixed(2)} is below the ` +
        `${EXTRACTION_LIMITS.minConfidence} floor — nothing from this extraction is used`,
    });
    notes.push("Low-confidence extraction discarded in full.");
    return {
      extraction: { ...proposal, ratified: false, ratificationNotes: notes },
      accepted,
      rejected,
    };
  }

  // ── face value ──
  if (proposal.faceValueUsd !== undefined) {
    const v = proposal.faceValueUsd;
    if (!Number.isFinite(v) || v <= 0) {
      rejected.push({ field: "faceValueUsd", reason: "not a positive finite number" });
    } else if (v < EXTRACTION_LIMITS.minFaceValueUsd || v > EXTRACTION_LIMITS.maxFaceValueUsd) {
      rejected.push({
        field: "faceValueUsd",
        reason: `$${v.toLocaleString()} is outside the financeable band ` +
          `($${EXTRACTION_LIMITS.minFaceValueUsd.toLocaleString()}–$${EXTRACTION_LIMITS.maxFaceValueUsd.toLocaleString()})`,
      });
    } else {
      const driftPct = Math.abs((v - registered.faceValueUsd) / registered.faceValueUsd) * 100;
      if (driftPct > EXTRACTION_LIMITS.maxFaceValueDriftPct) {
        // A large disagreement is a FLAG, not a correction. The document and the registration
        // disagreeing is exactly the situation a human should look at.
        rejected.push({
          field: "faceValueUsd",
          reason:
            `extracted $${v.toLocaleString()} differs from the registered ` +
            `$${registered.faceValueUsd.toLocaleString()} by ${driftPct.toFixed(1)}% — ` +
            `flagged for review rather than applied`,
        });
        notes.push(
          `DISCREPANCY: the document and the registration disagree on face value by ${driftPct.toFixed(1)}%.`,
        );
      } else {
        accepted.faceValueUsd = v;
        notes.push(`Face value corroborated within ${driftPct.toFixed(1)}% of the registered figure.`);
      }
    }
  }

  // ── free-text fields: corroboration only ──
  for (const field of ["obligor", "custodian"] as const) {
    const v = proposal[field];
    if (v === undefined) continue;
    if (typeof v !== "string" || v.trim().length < 2) {
      rejected.push({ field, reason: "empty or implausibly short" });
      continue;
    }
    const same = freeTextCorroborates(v, registered[field]);
    if (same) {
      accepted[field] = v.trim();
      notes.push(`${field} matches the registration.`);
    } else {
      rejected.push({
        field,
        reason: `extracted "${v.trim()}" does not match the registered "${registered[field]}" — flagged, not applied`,
      });
      notes.push(`DISCREPANCY: ${field} in the document does not match the registration.`);
    }
  }

  if (proposal.expiry) {
    const t = Date.parse(proposal.expiry);
    if (Number.isNaN(t)) {
      rejected.push({ field: "expiry", reason: "unparseable date" });
    } else if (t < Date.now()) {
      notes.push("WARNING: the document's stated expiry is in the past.");
    }
  }

  return {
    extraction: { ...proposal, ratified: rejected.length === 0, ratificationNotes: notes },
    accepted,
    rejected,
  };
}

/**
 * Guard for anything a model narrates.
 *
 * @remarks Narration is cosmetic — if the prose is imperfect no money moves — but it still reaches a
 * judge's screen, so it must not contain a figure the protocol did not compute, and must not claim
 * a proof exists. Rather than trying to validate meaning, this rejects the specific shapes that
 * would constitute overclaiming.
 */
export function sanitizeNarration(text: string, maxLen = 400): { text: string; flags: string[] } {
  const flags: string[] = [];
  let out = text.trim().replace(/\s+/g, " ");

  if (out.length > maxLen) {
    out = `${out.slice(0, maxLen - 1)}…`;
    flags.push("truncated");
  }

  // A model must never assert that something was proven or verified. Only the precompile's return
  // value establishes that, and it is recorded elsewhere.
  const overclaims = [
    { re: /\b(proven|verified|confirmed on-chain|cryptographically guaranteed)\b/i, flag: "asserts proof" },
    { re: /\b0x[0-9a-f]{16,}\b/i, flag: "contains a hash-like literal" },
    { re: /\b(guaranteed|risk-free|no risk|certain)\b/i, flag: "overclaims certainty" },
  ];
  for (const o of overclaims) {
    if (o.re.test(out)) flags.push(o.flag);
  }

  return { text: out, flags };
}
