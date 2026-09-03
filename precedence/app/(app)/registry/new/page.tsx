"use client";
/**
 * Register real-world collateral, and post the facility terms lenders will bid into.
 *
 * @remarks Two things make this more than a form.
 *
 * The **terms** are the borrower's, not the protocol's. Per-tranche caps and coupons are published
 * here and read back by `PriorityEngine` during settlement, which is what keeps proven ordering
 * load-bearing: lenders race for a rank whose price the borrower already fixed, so the race
 * decides *who* gets senior, never *what senior costs*.
 *
 * The **document reader** is a pre-fill and is labelled as one. There is no on-chain record to
 * ratify against at registration time, so nothing a model reads here is evidence — every field
 * stays editable and the borrower's signature is what turns it into a claim. Its `concerns` list
 * is the part worth having: a model is genuinely good at noticing the missing date a hurried
 * human skims past.
 *
 * Registration signs on **Creditcoin CC3**, not Sepolia, because `registerCollateral` takes
 * `msg.sender` as the obligor of record.
 */
import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  FileText,
  Loader2,
  Sparkles,
} from "lucide-react";
import { api } from "@/lib/client/api";
import { usd } from "@/lib/client/format";
import { Badge, Card, Eyebrow, Why } from "@/components/ui";
import { FadeUp } from "@/components/motion/Reveal";
import { useWallet } from "@/lib/client/wallet";
import { ConnectPrompt } from "@/components/ConnectPrompt";
import { SUGGESTED_RATES } from "@/lib/precedence/domain/collateral";
import type { CollateralAssetType, RegistrationProposal } from "@/lib/precedence/types";
const ASSET_TYPES: { value: CollateralAssetType; label: string; hint: string }[] = [
  { value: "warehouse-receipt", label: "Warehouse receipt", hint: "Goods in a bonded store" },
  { value: "trade-receivable", label: "Trade receivable", hint: "An invoice owed to you" },
  { value: "commodity-pledge", label: "Commodity pledge", hint: "Metal or bulk under pledge" },
];
interface Form {
  assetType: CollateralAssetType;
  title: string;
  obligor: string;
  custodian: string;
  custodianLocation: string;
  docIdentifier: string;
  faceValueUsd: string;
  haircutPct: string;
  termDays: string;
  seniorCapUsd: string;
  juniorCapUsd: string;
  subordinateCapUsd: string;
  seniorRatePct: string;
  juniorRatePct: string;
  subordinateRatePct: string;
}
const EMPTY: Form = {
  assetType: "warehouse-receipt",
  title: "",
  obligor: "",
  custodian: "",
  custodianLocation: "",
  docIdentifier: "",
  faceValueUsd: "",
  haircutPct: "15",
  termDays: "90",
  seniorCapUsd: "",
  juniorCapUsd: "",
  subordinateCapUsd: "",
  seniorRatePct: String(SUGGESTED_RATES.SENIOR),
  juniorRatePct: String(SUGGESTED_RATES.JUNIOR),
  subordinateRatePct: String(SUGGESTED_RATES.SUBORDINATE),
};
const n = (v: string) => (v.trim() === "" ? Number.NaN : Number(v));
export default function RegisterCollateralPage() {
  const router = useRouter();
  const { address, status } = useWallet();
  const [f, setF] = useState<Form>(EMPTY);
  const [doc, setDoc] = useState("");
  const [reading, setReading] = useState(false);
  const [proposal, setProposal] = useState<RegistrationProposal | null>(null);
  const [readNote, setReadNote] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [problems, setProblems] = useState<string[]>([]);
  const [done, setDone] = useState<{ id: string; chain: boolean; note: string } | null>(null);
  // A fresh form must not scold. Validation appears once the borrower has actually engaged with
  // the terms, or as soon as they try to submit — never before they have typed anything.
  const [attempted, setAttempted] = useState(false);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  // ── the facility arithmetic, shown live so the caps rule is obvious before submitting ──
  const money = useMemo(() => {
    const face = n(f.faceValueUsd);
    const haircut = n(f.haircutPct);
    const advance = Number.isFinite(face) && Number.isFinite(haircut)
      ? Math.round(face * (1 - haircut / 100))
      : Number.NaN;
    const caps = [n(f.seniorCapUsd), n(f.juniorCapUsd), n(f.subordinateCapUsd)];
    const total = caps.reduce((s, c) => s + (Number.isFinite(c) ? c : 0), 0);
    return { face, haircut, advance, total, headroom: advance - total };
  }, [f.faceValueUsd, f.haircutPct, f.seniorCapUsd, f.juniorCapUsd, f.subordinateCapUsd]);
  // Mirrors the contract's own two rules, so the reason a facility is invalid is visible here
  // rather than arriving as a revert.
  const localProblems = useMemo(() => {
    const out: string[] = [];
    const s = n(f.seniorRatePct), j = n(f.juniorRatePct), sub = n(f.subordinateRatePct);
    if (Number.isFinite(money.advance) && money.total > money.advance) {
      out.push(
        `Caps total ${usd(money.total)}, over the ${usd(money.advance)} advance your ${f.haircutPct}% ` +
          `haircut leaves. The haircut is the lenders' protection, so the facility cannot exceed it.`,
      );
    }
    if ([s, j, sub].every(Number.isFinite) && !(s <= j && j <= sub)) {
      out.push(
        "Rates must rise with risk: senior ≤ junior ≤ subordinate. Senior is repaid first and is " +
          "protected by the tranches beneath it, so it cannot pay more than they do.",
      );
    }
    if (money.total === 0) out.push("Give at least one tranche a cap — that is the facility.");
    return out;
  }, [f.seniorRatePct, f.juniorRatePct, f.subordinateRatePct, f.haircutPct, money]);
  // Server-side problems always show — they came from an actual attempt. Local ones wait until
  // the borrower has entered a cap or pressed the button.
  const showProblems = [...(attempted || money.total > 0 ? localProblems : []), ...problems];
  /** Split the advance 60/30/10 — a conventional starting point, not a recommendation. */
  function suggestCaps() {
    if (!Number.isFinite(money.advance) || money.advance <= 0) return;
    const senior = Math.round(money.advance * 0.6);
    const junior = Math.round(money.advance * 0.3);
    setF((p) => ({
      ...p,
      seniorCapUsd: String(senior),
      juniorCapUsd: String(junior),
      subordinateCapUsd: String(money.advance - senior - junior),
    }));
  }
  async function readDocument() {
    setReading(true);
    setReadNote(null);
    setProposal(null);
    try {
      const r = await api.parseDocument(doc);
      if (!r.available) {
        setReadNote(r.reason ?? "No model is available. Fill the form by hand.");
        return;
      }
      const p = r.proposal!;
      setProposal(p);
      // Only fills blanks. Overwriting something the borrower typed would be the model
      // correcting a human, which is exactly backwards here.
      setF((prev) => ({
        ...prev,
        assetType: p.assetType ?? prev.assetType,
        title: prev.title || (p.title ?? ""),
        docIdentifier: prev.docIdentifier || (p.docIdentifier ?? ""),
        obligor: prev.obligor || (p.obligor ?? ""),
        custodian: prev.custodian || (p.custodian ?? ""),
        custodianLocation: prev.custodianLocation || (p.custodianLocation ?? ""),
        faceValueUsd: prev.faceValueUsd || (p.faceValueUsd ? String(p.faceValueUsd) : ""),
        termDays: p.termDays ? String(p.termDays) : prev.termDays,
      }));
    } catch (e) {
      setReadNote(`Could not read the document: ${(e as Error).message}`);
    } finally {
      setReading(false);
    }
  }
  async function submit() {
    setAttempted(true);
    setProblems([]);
    // Bail before the network call. Pressing the button on an incomplete form should reveal what
    // is wrong, not spend a round trip discovering it.
    if (localProblems.length > 0) return;
    setSubmitting(true);
    try {
      const r = await api.registerCollateral({
        assetType: f.assetType,
        title: f.title,
        obligor: f.obligor,
        obligorAddress: address,
        custodian: f.custodian,
        custodianLocation: f.custodianLocation,
        docIdentifier: f.docIdentifier,
        faceValueUsd: n(f.faceValueUsd),
        haircutPct: n(f.haircutPct),
        termDays: n(f.termDays),
        terms: {
          seniorCapUsd: n(f.seniorCapUsd),
          juniorCapUsd: n(f.juniorCapUsd),
          subordinateCapUsd: n(f.subordinateCapUsd),
          seniorRatePct: n(f.seniorRatePct),
          juniorRatePct: n(f.juniorRatePct),
          subordinateRatePct: n(f.subordinateRatePct),
        },
      });
      if (!r.ok) {
        setProblems(r.problems ?? [r.error ?? "Registration failed."]);
        return;
      }
      setDone({ id: r.collateral!.id, chain: Boolean(r.chain), note: r.note ?? "" });
    } catch (e) {
      setProblems([(e as Error).message]);
    } finally {
      setSubmitting(false);
    }
  }
  // ── success ──
  if (done) {
    return (
      <FadeUp>
        <div className="mx-auto max-w-lg py-14 text-center">
          <CheckCircle2 size={30} className="mx-auto mb-4" style={{ color: "var(--proof-verified)" }} />
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight tracking-tight">
            Collateral registered
          </h1>
          <p className="mx-auto mt-2.5 max-w-md text-sm" style={{ color: "var(--text-muted)" }}>
            {done.note}
          </p>
          {!done.chain ? (
            <div className="mt-3 flex justify-center">
              <Badge color="var(--warn)">Simulated — nothing was written to a chain</Badge>
            </div>
          ) : null}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link
              href="/collateral"
              className="rounded-lg px-4 py-2 text-xs font-semibold"
              style={{ background: "var(--accent)", color: "var(--on-accent)" }}
            >
              See it on the marketplace
            </Link>
            <button onClick={() => { setDone(null); setF(EMPTY); setDoc(""); setProposal(null); }}
              className="btn-ghost rounded-lg px-4 py-2 text-xs">
              Register another
            </button>
          </div>
        </div>
      </FadeUp>
    );
  }
  const disconnected = status !== "connected";
  return (
    <div className="mx-auto max-w-3xl">
      <FadeUp>
        <header className="mb-6">
          {/* Pointed at /portfolio, which is not where anyone arrives from — the entry points are
              the nav's Borrow item and the registry's own action. */}
          <Link href="/registry" className="mb-3 inline-flex items-center gap-1.5 text-[11px]"
            style={{ color: "var(--text-muted)" }}>
            <ArrowLeft size={12} /> Back to the registry
          </Link>
          <Eyebrow>Borrower · Creditcoin CC3 registry</Eyebrow>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight tracking-tight">
            Register <span className="text-gradient">collateral</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--text-muted)" }}>
            Describe the asset, then publish the terms lenders bid into. You set the price of each
            tranche; the race only decides who takes it.
          </p>
        </header>
      </FadeUp>
      {/* One shared prompt rather than three hand-rolled branches. The previous version
          rendered a Connect button and never displayed connect()'s error, so in a browser with no
          wallet it silently did nothing. */}
      <ConnectPrompt
        need="creditcoin"
        why="Registering collateral records you as the obligor of record, so only you can sign it."
      />
      {/* ── document reader ── */}
      <section className="mt-5">
        <Card>
          <div className="flex items-center gap-2">
            <Sparkles size={15} style={{ color: "var(--accent)" }} />
            <h2 className="text-sm font-semibold">Read the document (optional)</h2>
          </div>
          <Why>
            Paste the receipt or invoice text and a model will suggest field values and flag what
            looks off. It is a pre-fill: nothing is verified, nothing is registered, and it never
            overwrites something you typed.
          </Why>
          <textarea
            value={doc}
            onChange={(e) => setDoc(e.target.value)}
            rows={5}
            placeholder="Paste the document text — receipt number, depositor, custodian, quantity, appraised value, dates…"
            className="mono mt-3 w-full resize-y rounded-lg p-3 text-[11.5px] outline-none"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button
              onClick={readDocument}
              disabled={reading || doc.trim().length < 40}
              className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] disabled:opacity-50"
            >
              {reading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
              {reading ? "Reading…" : "Read and pre-fill"}
            </button>
            {doc.trim().length > 0 && doc.trim().length < 40 ? (
              <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                needs a bit more text to be worth reading
              </span>
            ) : null}
          </div>
          {readNote ? (
            <p className="mt-3 flex items-start gap-1.5 text-[11px]" style={{ color: "var(--warn)" }}>
              <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {readNote}
            </p>
          ) : null}
          {proposal ? (
            <div className="mt-3 rounded-lg p-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge color="var(--proof-pending)">Suggestion · not verified</Badge>
                <span className="mono text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                  {proposal.model} · confidence {(proposal.confidence * 100).toFixed(0)}%
                </span>
              </div>
              {proposal.concerns.length > 0 ? (
                <>
                  <div className="eyebrow mt-2.5">What the reader flagged</div>
                  <ul className="mt-1 flex flex-col gap-1">
                    {proposal.concerns.map((c, i) => (
                      <li key={i} className="flex items-start gap-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                        <AlertTriangle size={11} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
                        {c}
                      </li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                  Nothing flagged. That is not a clean bill of health — it only means the reader
                  found no obvious problem in the text.
                </p>
              )}
            </div>
          ) : null}
        </Card>
      </section>
      {/* ── the asset ── */}
      <section className="mt-5">
        <Card>
          <h2 className="text-sm font-semibold">The asset</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field label="Asset type" full>
              <div className="flex flex-wrap gap-2">
                {ASSET_TYPES.map((a) => (
                  <button
                    key={a.value}
                    onClick={() => set("assetType", a.value)}
                    title={a.hint}
                    className="rounded-lg px-2.5 py-1.5 text-[11px] transition-colors"
                    style={{
                      border: `1px solid ${f.assetType === a.value ? "var(--accent)" : "var(--border)"}`,
                      color: f.assetType === a.value ? "var(--accent)" : "var(--text-muted)",
                      background: f.assetType === a.value ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "transparent",
                    }}
                  >
                    {a.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Asset title" full>
              <Input field="title" value={f.title} onChange={(v) => set("title", v)}
                placeholder="Santos Arabica Coffee Warehouse Receipt #8802" />
            </Field>
            <Field label="Obligor (your legal name)">
              <Input field="obligor" value={f.obligor} onChange={(v) => set("obligor", v)} placeholder="Atlas Coffee Importers LLC" />
            </Field>
            <Field label="Document identifier" hint="Receipt or invoice number">
              <Input field="docIdentifier" value={f.docIdentifier} onChange={(v) => set("docIdentifier", v)} placeholder="WR-8802" />
            </Field>
            <Field label="Custodian" hint="Institution name only">
              <Input field="custodian" value={f.custodian} onChange={(v) => set("custodian", v)} placeholder="Santos Port Terminal #4 Vaults" />
            </Field>
            <Field label="Custodian location">
              <Input field="custodianLocation" value={f.custodianLocation} onChange={(v) => set("custodianLocation", v)} placeholder="Santos, Brazil" />
            </Field>
            <Field label="Face value (USD)">
              <Input field="faceValueUsd" value={f.faceValueUsd} onChange={(v) => set("faceValueUsd", v)} placeholder="10000" numeric />
            </Field>
            <Field label="Haircut (%)" hint="Higher protects lenders and lowers your advance">
              <Input field="haircutPct" value={f.haircutPct} onChange={(v) => set("haircutPct", v)} numeric />
            </Field>
            <Field label="Term (days)">
              <Input field="termDays" value={f.termDays} onChange={(v) => set("termDays", v)} numeric />
            </Field>
          </div>
          {Number.isFinite(money.advance) && money.advance > 0 ? (
            <p className="mt-3 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              A {f.haircutPct}% haircut on {usd(money.face)} leaves a maximum advance of{" "}
              <strong style={{ color: "var(--text)" }}>{usd(money.advance)}</strong>. Your tranche
              caps cannot exceed it.
            </p>
          ) : null}
        </Card>
      </section>
      {/* ── the terms ── */}
      <section className="mt-5">
        <Card>
          {/* gap-y so the preset button does not sit flush against the heading when it wraps
              below it at 360px. */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-2.5">
            <h2 className="text-sm font-semibold">Facility terms you are posting</h2>
            <button onClick={suggestCaps} disabled={!Number.isFinite(money.advance) || money.advance <= 0}
              className="btn-ghost rounded-lg px-2.5 py-1 text-[11px] disabled:opacity-50">
              Split 60 / 30 / 10
            </button>
          </div>
          <Why>
            These go on-chain and the settlement engine reads them back, so the race decides who
            takes each rank — never what that rank costs. Senior is repaid first and sits behind
            everything below it, so it must be the cheapest.
          </Why>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {([
              ["SENIOR", "seniorCapUsd", "seniorRatePct", "var(--rank-senior)"],
              ["JUNIOR", "juniorCapUsd", "juniorRatePct", "var(--rank-junior)"],
              ["SUBORDINATE", "subordinateCapUsd", "subordinateRatePct", "var(--rank-subordinate)"],
            ] as const).map(([name, capKey, rateKey, color]) => (
              <div key={name} className="rounded-lg p-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
                <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color }}>
                  {name}
                </div>
                <div className="mt-2 flex flex-col gap-2">
                  <Field label="Cap (USD)">
                    <Input field={capKey} value={f[capKey]} onChange={(v) => set(capKey, v)} numeric placeholder="0" />
                  </Field>
                  <Field label="Coupon (%)">
                    <Input field={rateKey} value={f[rateKey]} onChange={(v) => set(rateKey, v)} numeric />
                  </Field>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-3 flex flex-wrap items-baseline gap-x-6 gap-y-1.5 text-[11.5px]">
            <span style={{ color: "var(--text-muted)" }}>
              {money.total > 0 ? (
                <>Facility total <strong style={{ color: "var(--text)" }}>{usd(money.total)}</strong></>
              ) : (
                "Give a tranche a cap to size the facility."
              )}
            </span>
            {Number.isFinite(money.advance) ? (
              <span style={{ color: money.headroom < 0 ? "var(--danger)" : "var(--text-muted)" }}>
                {money.headroom < 0 ? "Over advance by " : "Headroom "}
                <strong>{usd(Math.abs(money.headroom))}</strong>
              </span>
            ) : null}
          </div>
        </Card>
      </section>
      {/* ── problems and submit ── */}
      {showProblems.length > 0 ? (
        <div className="mt-5">
          <Card>
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
              <div>
                <h3 className="text-sm font-semibold">Fix these before registering</h3>
                <ul className="mt-1.5 flex flex-col gap-1.5">
                  {showProblems.map((p, i) => (
                    <li key={i} className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
          </Card>
        </div>
      ) : null}
      <div className="mt-5 mb-10 flex flex-wrap items-center gap-3">
        <button
          onClick={submit}
          disabled={submitting || disconnected}
          className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "var(--on-accent)" }}
        >
          {submitting ? <Loader2 size={13} className="animate-spin" /> : <FileText size={13} />}
          {submitting ? "Registering…" : "Register collateral and post terms"}
        </button>
        <button onClick={() => router.push("/collateral")} className="btn-ghost rounded-lg px-3.5 py-2 text-xs">
          Cancel
        </button>
        {disconnected ? (
          // Was faint 11px text beside a disabled button, which reads as decoration rather than as
          // the reason the button will not work.
          <span
            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium"
            style={{
              color: "var(--warn)",
              background: "color-mix(in srgb, var(--warn) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--warn) 35%, transparent)",
            }}
          >
            <AlertTriangle size={12} /> Connect a wallet to register
          </span>
        ) : null}
      </div>
    </div>
  );
}
function Field({ label, hint, full, children }: { label: string; hint?: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={`flex flex-col gap-1 ${full ? "sm:col-span-2" : ""}`}>
      <span className="eyebrow">{label}</span>
      {children}
      {hint ? <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>{hint}</span> : null}
    </label>
  );
}
function Input({ value, onChange, placeholder, numeric, field }: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  numeric?: boolean;
  /** Stable hook for browser tests. The tranche rules mirror on-chain invariants, so driving
   *  them reliably from outside the app is worth one attribute. */
  field?: string;
}) {
  return (
    <input
      data-field={field}
      value={value}
      onChange={(e) => onChange(numeric ? e.target.value.replace(/[^0-9.]/g, "") : e.target.value)}
      placeholder={placeholder}
      inputMode={numeric ? "decimal" : undefined}
      // Placeholders were rendering at full body contrast, so an empty field looked filled in —
      // a borrower could submit believing the example values were theirs.
      className={`w-full rounded-lg px-2.5 py-1.5 text-[12px] outline-none placeholder:italic placeholder:opacity-55 ${numeric ? "mono" : ""}`}
      style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text)" }}
    />
  );
}
