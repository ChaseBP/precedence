/**
 * Gemini-assisted runtime.
 *
 * @remarks
 * **`decide()` here is identical to the deterministic runtime — deliberately.** Bids are computed
 * by `domain/policy.ts` and nothing else. A model does not price risk, does not choose a tranche,
 * and does not size capital. That is not a limitation of this implementation; it is the point:
 *
 *  - priority settles from cryptographic proof, so a model near settlement undercuts the claim,
 *  - a demo must be reproducible, and bids that drift between rehearsals are a liability,
 *  - and a judge can check a policy function with visible weights but cannot check a model.
 *
 * What the model DOES do is the work a policy function cannot do at all:
 *
 *  1. `interpretDocument` — read an unstructured warehouse receipt, bill of lading or invoice and
 *     extract structured fields. Real trade finance drowns in paper, this is genuinely
 *     model-shaped, and it sits strictly upstream of any capital decision. Everything it returns
 *     goes through `ratifyExtraction`, which rejects by default.
 *  2. `narrateDecision` — human-readable prose for a bid the policy already made. If it is
 *     imperfect, no money is affected.
 *  3. refinance proposals — surfaces candidates; the policy filter and the proofs decide.
 *
 * Demo safety: `temperature: 0`, plus a recorded-response fallback so an API hiccup cannot break a
 * run. No model call is ever on the critical path of the 90-second demo.
 *
 * @see https://ai.google.dev/gemini-api/docs
 */
import type { AgentDecision, CollateralAsset, DocumentExtraction, Hex } from "../../types";
import type { AgentRuntime, DecideParams } from "./agent-runtime";
import { evaluate } from "../../domain/policy";
import { deriveFinancierAccount } from "../../domain/lock";
import { ratifyExtraction, sanitizeNarration, type RatificationResult } from "../../domain/ratify";

export const GEMINI_MODEL = "gemini-3.5-flash-lite";
const API_BASE = "https://generativelanguage.googleapis.com/v1beta";
const TIMEOUT_MS = 20_000;

/**
 * The classic `:generateContent` endpoint.
 *
 * @remarks Chosen over the newer `/v1beta/interactions` surface deliberately: `generateContent` has
 * a stable, unambiguous request/response shape, while Interactions took breaking changes in May
 * 2026. Isolated in one function so switching is a one-line change if we ever want the newer API.
 */
function endpointFor(model: string): string {
  return `${API_BASE}/models/${model}:generateContent`;
}

export interface LlmRuntimeOptions {
  apiKey?: string;
  model?: string;
  /** Pre-recorded responses keyed by cache key. Lets a demo run with no network at all. */
  recorded?: Record<string, string>;
  onCall?: (info: { kind: string; ok: boolean; ms: number; note?: string }) => void;
}

/** Shape of a `generateContent` response — only the fields we actually read. */
interface GeminiResponse {
  candidates?: {
    content?: { parts?: { text?: string }[]; role?: string };
    finishReason?: string;
  }[];
  promptFeedback?: { blockReason?: string };
  error?: { code?: number; message?: string; status?: string };
}

export class LlmRuntime implements AgentRuntime {
  private readonly opts: LlmRuntimeOptions;

  constructor(opts: LlmRuntimeOptions = {}) {
    this.opts = { model: GEMINI_MODEL, ...opts };
  }

  get available(): boolean {
    return Boolean(this.opts.apiKey);
  }

  get model(): string {
    return this.opts.model ?? GEMINI_MODEL;
  }

  // ─────────────────────── the settlement path: NO model ───────────────────────

  /**
   * Bid decision. Deterministic policy, always.
   *
   * @remarks Identical to `LocalRuntime.decide` on purpose. If you are tempted to route this
   * through a model, re-read the note at the top of this file first.
   */
  async decide({ agent, collateral, analysis, requestedUsd }: DecideParams): Promise<AgentDecision> {
    return evaluate(agent, collateral, analysis, requestedUsd);
  }

  async signLock(agentId: string, collateralId: string, amountUsd: number): Promise<Hex> {
    const account = deriveFinancierAccount(agentId);
    return account.signMessage({
      message: { raw: `0x${Buffer.from(`${collateralId}:${amountUsd}`).toString("hex")}` as Hex },
    });
  }

  // ─────────────────────── where the model earns its place ───────────────────────

  /**
   * Extract structured fields from an unstructured collateral document.
   *
   * @returns the ratification result — which fields were ACCEPTED, which were rejected and why.
   * Never the raw model output.
   *
   * @remarks A discrepancy between the document and the registration is reported as a FLAG rather
   * than applied as a correction. Two sources disagreeing about a warehouse receipt is exactly the
   * situation a human should look at, and silently preferring the model would be worse than
   * surfacing it.
   */
  async interpretDocument(
    documentText: string,
    registered: CollateralAsset,
  ): Promise<RatificationResult> {
    const started = Date.now();
    const prompt =
      `Extract the following fields from this trade-finance document. Return ONLY minified JSON ` +
      `with keys: faceValueUsd (number), obligor (string), custodian (string), expiry ` +
      `(ISO-8601 date string), assetDescription (string), confidence (number 0-1 reflecting how ` +
      `certain you are). Omit any key you cannot read with confidence. Do not guess.\n\n` +
      `DOCUMENT:\n${documentText.slice(0, 8000)}`;

    let raw: string | null = null;
    let note: string | undefined;

    const cacheKey = `doc:${registered.id}`;
    if (this.opts.recorded?.[cacheKey]) {
      raw = this.opts.recorded[cacheKey];
      note = "recorded response";
    } else if (this.available) {
      try {
        raw = await this.call(prompt, { json: true });
      } catch (e) {
        note = `Gemini call failed: ${(e as Error).message.slice(0, 120)}`;
      }
    } else {
      note = "no GEMINI_API_KEY — extraction skipped";
    }

    const proposal: DocumentExtraction = {
      collateralId: registered.id,
      confidence: 0,
      source: "llm",
      model: this.model,
      ratified: false,
      ratificationNotes: [],
      extractedAt: new Date().toISOString(),
    };

    if (raw) {
      try {
        const parsed = JSON.parse(stripFences(raw)) as Partial<DocumentExtraction> & {
          confidence?: number;
        };
        Object.assign(proposal, {
          faceValueUsd: typeof parsed.faceValueUsd === "number" ? parsed.faceValueUsd : undefined,
          obligor: typeof parsed.obligor === "string" ? parsed.obligor : undefined,
          custodian: typeof parsed.custodian === "string" ? parsed.custodian : undefined,
          expiry: typeof parsed.expiry === "string" ? parsed.expiry : undefined,
          assetDescription:
            typeof parsed.assetDescription === "string" ? parsed.assetDescription : undefined,
          confidence: typeof parsed.confidence === "number" ? parsed.confidence : 0,
        });
      } catch {
        note = "Gemini returned unparseable JSON — extraction discarded";
      }
    }

    this.opts.onCall?.({ kind: "interpretDocument", ok: Boolean(raw), ms: Date.now() - started, note });

    // Everything goes through the deterministic filter. Nothing above this line is trusted.
    const result = ratifyExtraction(proposal, registered);
    if (note) result.extraction.ratificationNotes.unshift(note);
    return result;
  }

  /**
   * Human-readable prose for a decision the POLICY already made.
   * @remarks Falls back to the policy's own reasoning string, which is always present.
   */
  async narrateDecision(decision: AgentDecision, collateral: CollateralAsset): Promise<string> {
    const fallback = decision.reasoning;
    if (!this.available) return fallback;

    const started = Date.now();
    try {
      const raw = await this.call(
        `In at most two sentences, explain plainly why a lender with this mandate made this bid. ` +
          `Do not invent figures. Do not claim anything is proven or verified.\n\n` +
          `Collateral: ${collateral.title}, face value $${collateral.faceValueUsd}, ` +
          `risk score ${collateral.riskScore}.\n` +
          `Decision: ${decision.verb} ${decision.tranche} $${decision.amountUsd} at ${decision.ratePct}%.\n` +
          `Policy reasoning: ${decision.reasoning}`,
      );
      const { text, flags } = sanitizeNarration(raw);
      this.opts.onCall?.({
        kind: "narrateDecision",
        ok: true,
        ms: Date.now() - started,
        note: flags.length ? `flags: ${flags.join(", ")}` : undefined,
      });
      // If the model overclaimed, use the policy's own words rather than trying to repair prose.
      return flags.some((f) => f === "asserts proof" || f === "overclaims certainty") ? fallback : text;
    } catch (e) {
      this.opts.onCall?.({
        kind: "narrateDecision",
        ok: false,
        ms: Date.now() - started,
        note: (e as Error).message.slice(0, 120),
      });
      return fallback;
    }
  }

  // ─────────────────────── transport ───────────────────────

  /**
   * One `generateContent` call.
   *
   * @param opts.json ask for a JSON-only response via `responseMimeType`, which is more reliable
   * than requesting JSON in the prompt alone.
   */
  private async call(prompt: string, opts: { json?: boolean } = {}): Promise<string> {
    if (!this.opts.apiKey) throw new Error("no GEMINI_API_KEY");

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(endpointFor(this.model), {
        method: "POST",
        signal: controller.signal,
        headers: {
          "content-type": "application/json",
          // Gemini authenticates with a header key, not a bearer token.
          "x-goog-api-key": this.opts.apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            // Zero temperature: a demo producing different numbers on each rehearsal is a
            // liability, and reproducibility is worth more here than variety.
            temperature: 0,
            maxOutputTokens: 1024,
            ...(opts.json ? { responseMimeType: "application/json" } : {}),
          },
        }),
      });

      const json = (await res.json()) as GeminiResponse;

      if (!res.ok || json.error) {
        throw new Error(`HTTP ${res.status}: ${json.error?.message ?? res.statusText}`);
      }
      if (json.promptFeedback?.blockReason) {
        throw new Error(`blocked: ${json.promptFeedback.blockReason}`);
      }

      const text = json.candidates?.[0]?.content?.parts
        ?.map((p) => p.text ?? "")
        .join("")
        .trim();
      if (!text) {
        throw new Error(
          `no text in response (finishReason: ${json.candidates?.[0]?.finishReason ?? "unknown"})`,
        );
      }
      return text;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Round-trip a trivial prompt to confirm the key, the model id and the endpoint all work.
   * @remarks Exists so nobody has to take "the Gemini integration works" on trust.
   */
  async healthCheck(): Promise<{ ok: boolean; model: string; detail: string }> {
    if (!this.available) return { ok: false, model: this.model, detail: "no GEMINI_API_KEY set" };
    try {
      const t = await this.call("Reply with exactly: OK");
      return { ok: /ok/i.test(t), model: this.model, detail: t.slice(0, 80) };
    } catch (e) {
      return { ok: false, model: this.model, detail: (e as Error).message.slice(0, 160) };
    }
  }
}

/** Models sometimes wrap JSON in a code fence despite instructions. */
function stripFences(s: string): string {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}
