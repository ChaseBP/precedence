"use client";

/**
 * One facility, and the panel a lender bids into.
 *
 * @remarks This is the page that makes the borrower-posted-terms model legible: the caps and
 * coupons shown here were set by the obligor and are read back on-chain during settlement, so a
 * lender can see the price of a rank *before* racing for it. What the race decides is who gets it.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertTriangle, ArrowLeft, ArrowUpRight, ExternalLink, Layers, Loader2, Radio, RotateCcw, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client/api";
import { usd, pct, encumbranceColor, riskColor, trancheColor } from "@/lib/client/format";
import { Badge, Card, Eyebrow, Stat, Why } from "@/components/ui";
import { FadeUp } from "@/components/motion/Reveal";
import { LoadError } from "@/components/LoadError";
import { LockCapital } from "@/components/LockCapital";
import { OpenRace } from "@/components/OpenRace";
import { ServiceFacility } from "@/components/ServiceFacility";
import type { CollateralAsset, Tranche } from "@precedence/sdk/types";

/** The CC3 host that resolves; `explorer.cc3-testnet.creditcoin.network` does not. */
const CREDITCOIN_EXPLORER = "https://creditcoin-testnet.blockscout.com";

export default function FacilityPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<Awaited<ReturnType<typeof api.facility>> | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /** The on-chain settlement for this facility, if one has been recorded. */
  const [liveRaceId, setLiveRaceId] = useState<string | null>(null);
  const [recovering, setRecovering] = useState(false);
  const [recoverErr, setRecoverErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setErr(null);
    try {
      setData(await api.facility(id));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await api.facility(id);
        if (!cancelled) setData(r);
      } catch (e) {
        if (!cancelled) setErr((e as Error).message);
      }
      // Separate and best-effort: whether a live settlement exists is useful, and a failure to
      // find out must not take the facility page down with it.
      try {
        const l = await api.liveRace(id);
        if (!cancelled) setLiveRaceId(l.id ?? null);
      } catch {
        /* no live settlement, or the store cannot say — either way, no link */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // A missing facility is not a failed request, and offering Retry for one is a loop. The API
  // surfaces its status in the error text, so a 404 gets an ending rather than a retry button.
  if (err) {
    const missing = /\b404\b|not found/i.test(err);
    if (missing) {
      return (
        <Card className="mx-auto mt-10 max-w-md p-8 text-center">
          <Eyebrow>Facility</Eyebrow>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold">
            No facility with that id
          </h2>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            <span className="mono">{id}</span> is not in the registry. It may have been reset, or
            the link may be mistyped.
          </p>
          <Link href="/collateral" className="btn-accent mt-5 inline-block px-4 py-2 text-xs font-semibold">
            Browse facilities
          </Link>
        </Card>
      );
    }
    return <LoadError what="this facility" detail={err} onRetry={load} />;
  }
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 size={14} className="animate-spin" /> reading the facility…
      </div>
    );
  }

  const c = data.collateral;
  // A fixture's docHash is a visible placeholder, not a bytes32, so the vault cannot be asked
  // about it and recovery must not be offered.
  const isRealDoc = /^0x[0-9a-fA-F]{64}$/.test(c.docHash);
  const maxAdvance = Math.round(c.faceValueUsd * (1 - c.haircutPct / 100));
  const simulated = c.source === "mock" || !data.live.creditcoin;

  return (
    <div className="mx-auto max-w-3xl">
      <FadeUp>
        <header className="mb-6">
          <Link href="/collateral" className="mb-3 inline-flex items-center gap-1.5 text-[11px]"
            style={{ color: "var(--text-muted)" }}>
            <ArrowLeft size={12} /> All collateral
          </Link>
          <Eyebrow>{c.assetType.replace(/-/g, " ")} · {c.custodianLocation || "location not stated"}</Eyebrow>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight tracking-tight">
            {c.title}
          </h1>
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <Badge color={encumbranceColor(c.status)}>{c.status}</Badge>
            <Badge color={riskColor(c.riskLabel)}>{c.riskLabel} risk</Badge>
            {simulated ? <Badge color="var(--warn)">Simulated record</Badge> : (
              <Badge color="var(--proof-verified)">Creditcoin CC3 registry</Badge>
            )}
            {data.raceId ? (
              <Link href={`/race?id=${data.raceId}`} className="mono inline-flex items-center gap-1 text-[10.5px]"
                style={{ color: "var(--accent)" }}>
                race on record <ArrowUpRight size={10} />
              </Link>
            ) : null}
          </div>
        </header>
      </FadeUp>

      {/* ── the numbers ── */}
      <Card>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="Asset value" value={usd(c.faceValueUsd)} />
          <Stat label={`Safety margin ${c.haircutPct}%`} value={usd(maxAdvance)} sub="most that can be borrowed" />
          <Stat label="Term" value={`${c.termDays}d`} />
          <Stat label="Average interest" value={pct(c.currentRatePct)} />
        </div>
        <div className="mt-4 flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          <div>Borrower: {c.obligor}</div>
          <div>Held by, as declared and unverified: {c.custodian}</div>
          <div className="break-all">
            Document hash: <span className="mono">{c.docHash}</span>
          </div>
        </div>

        {/* ── the receipts for this registration ──
            A borrower signs two Creditcoin transactions to get here and watches both confirm in
            their wallet. Until now the app showed them once, on the wizard's success screen, and
            then had nowhere to put them — so the facility they landed on could not link to either
            and the registration looked unrecorded. Present only when it was actually signed. */}
        {c.onChainRefs?.creditcoinRegisterTx || c.onChainRefs?.creditcoinTermsTx ? (
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <Eyebrow>Registered on Creditcoin CC3</Eyebrow>
            <div className="mt-1.5 flex flex-col gap-1">
              {(
                [
                  ["Asset registered", c.onChainRefs?.creditcoinRegisterTx],
                  ["Terms posted", c.onChainRefs?.creditcoinTermsTx],
                ] as [string, string | undefined][]
              ).map(([label, hash]) =>
                hash ? (
                  <a
                    key={label}
                    href={`${CREDITCOIN_EXPLORER}/tx/${hash}`}
                    target="_blank"
                    rel="noreferrer"
                    className="mono inline-flex items-start gap-1.5 break-all text-[10.5px] underline decoration-dotted underline-offset-4 hover:decoration-solid"
                    style={{ color: "var(--accent)" }}
                  >
                    <span className="shrink-0" style={{ color: "var(--text-faint)" }}>{label} ·</span>
                    {hash}
                    <ExternalLink size={9} className="mt-0.5 shrink-0" />
                  </a>
                ) : null,
              )}
            </div>
          </div>
        ) : null}

        {/* Recovery, offered when the vault may hold a settlement this app has no note of.
            The store is memory-only unless PRECEDENCE_STORE_PATH is set, so a restart or an admin
            reset loses the record while the chain keeps the locks, the race and the attestation.
            The only way back used to be redoing the run and waiting out attestation again. */}
        {!liveRaceId && isRealDoc ? (
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <button
              onClick={async () => {
                setRecoverErr(null);
                setRecovering(true);
                try {
                  const r = await api.recoverLiveRace(String(id));
                  if (r.ok && r.id) setLiveRaceId(r.id);
                  else setRecoverErr(r.error ?? "nothing to recover");
                } catch (e) {
                  setRecoverErr(e instanceof Error ? e.message : String(e));
                } finally {
                  setRecovering(false);
                }
              }}
              disabled={recovering}
              className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[11px] disabled:opacity-50"
            >
              {recovering ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              {recovering ? "Reading the vault…" : "Recover the settlement from the chain"}
            </button>
            <p className="mt-1.5 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
              Rebuilds this app&rsquo;s record of a race the vault already holds — locks, blocks and
              transaction indices read back from Sepolia. Nothing on chain changes and no
              attestation is repeated.
            </p>
            {recoverErr ? (
              <p className="mt-1.5 flex items-start gap-1.5 text-[11px]" style={{ color: "var(--warn)" }}>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">{recoverErr}</span>
              </p>
            ) : null}
          </div>
        ) : null}

        {/* A settlement that exists on chain for this facility, linked from the facility itself.
            Without this a lender who locked capital in one session had no route back to the run
            their position is in. */}
        {liveRaceId ? (
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
            <Link
              href={`/race?id=${liveRaceId}`}
              className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold"
              style={{ color: "var(--accent)" }}
            >
              <Radio size={12} style={{ color: "var(--success)" }} />
              Open the live settlement for this facility
              <ArrowUpRight size={12} className="shrink-0" />
            </Link>
          </div>
        ) : null}
        <p className="mt-3 flex items-start gap-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
          <ShieldCheck size={12} className="mt-0.5 shrink-0" />
          {c.verifiedClearTitle
            ? "No prior lien against this document in this registry. That is registry-scoped: a custodian issuing two receipts for one lot is not detectable from here."
            : "This document already carries a lien in this registry."}
        </p>
      </Card>

      {/* ── posted terms ── */}
      <section className="mt-5">
        <Card>
          <div className="flex items-center gap-2">
            <Layers size={15} style={{ color: "var(--accent)" }} />
            <h2 className="text-sm font-semibold">The borrower&rsquo;s terms</h2>
          </div>
          {c.terms ? (
            <>
              <Why>
                The obligor fixed these and the settlement engine reads them back from the registry,
                so racing decides who takes a rank — never what that rank pays. Senior is repaid
                first and sits behind the tranches below it, which is why it is the cheapest.
              </Why>
              {/* min-w-[420px] forced a horizontal scroll on a 360px screen for a four-column
                  table whose content is short — the scroll hid the "first loss" column, which is
                  the single most important thing a lender needs to read. Dropped the floor so the
                  table fits; the scroll container stays for genuinely narrow cases. */}
              <div className="mt-3 -mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[300px] text-left text-[11.5px]">
                  <thead>
                    <tr style={{ color: "var(--text-faint)" }}>
                      <th className="pb-1.5 font-normal">Repayment tier</th>
                      <th className="pb-1.5 font-normal">Max amount</th>
                      <th className="pb-1.5 font-normal">Interest</th>
                      <th className="pb-1.5 font-normal">Repaid</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(
                      [
                        ["SENIOR", c.terms.seniorCapUsd, c.terms.seniorRatePct, "first"],
                        ["JUNIOR", c.terms.juniorCapUsd, c.terms.juniorRatePct, "second"],
                        ["SUBORDINATE", c.terms.subordinateCapUsd, c.terms.subordinateRatePct, "last — first loss"],
                      ] as [Tranche, number, number, string][]
                    ).map(([name, cap, rate, order]) => (
                      <tr key={name} style={{ borderTop: "1px solid var(--border)" }}>
                        <td className="py-2 font-semibold" style={{ color: trancheColor(name) }}>{name}</td>
                        <td className="mono py-2">{usd(cap)}</td>
                        <td className="mono py-2">{pct(rate)}</td>
                        <td className="py-2 leading-tight" style={{ color: "var(--text-muted)" }}>{order}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="mt-2.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
                Facility {usd(c.terms.seniorCapUsd + c.terms.juniorCapUsd + c.terms.subordinateCapUsd)} of a{" "}
                {usd(maxAdvance)} advance · posted{" "}
                {c.terms.postedAt ? new Date(c.terms.postedAt).toISOString().slice(0, 10) : "—"}
              </p>
            </>
          ) : (
            <p className="mt-2 flex items-start gap-1.5 text-[11.5px]" style={{ color: "var(--warn)" }}>
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              No terms posted yet. Until the obligor publishes caps and coupons there is nothing to
              bid into.
            </p>
          )}
        </Card>
      </section>

      {/* ── actions, whichever side of the book you are on ── */}
      {/* Shown only to the wallet that can act, and only while there is no race open — so the
          obligor sees the one step that was previously CLI-only, and a lender never sees it. */}
      <section className="mt-5">
        <OpenRace collateral={c as CollateralAsset} />
      </section>

      <section className="mt-5">
        <LockCapital collateral={c as CollateralAsset} />
      </section>

      {/* Renders nothing unless the connected wallet is the vault's obligor or holds a
          reclaimable lock — role comes from chain state, not from a profile. */}
      <section className="mt-5 mb-10">
        <ServiceFacility collateral={c as CollateralAsset} />
      </section>
    </div>
  );
}
