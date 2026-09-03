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
import { AlertTriangle, ArrowLeft, ArrowUpRight, Layers, Loader2, ShieldCheck } from "lucide-react";
import { api } from "@/lib/client/api";
import { usd, pct, encumbranceColor, riskColor, trancheColor } from "@/lib/client/format";
import { Badge, Card, Eyebrow, Stat, Why } from "@/components/ui";
import { FadeUp } from "@/components/motion/Reveal";
import { LoadError } from "@/components/LoadError";
import { LockCapital } from "@/components/LockCapital";
import { ServiceFacility } from "@/components/ServiceFacility";
import type { CollateralAsset, Tranche } from "@/lib/precedence/types";

export default function FacilityPage() {
  const params = useParams<{ id: string }>();
  const id = params?.id;
  const [data, setData] = useState<Awaited<ReturnType<typeof api.facility>> | null>(null);
  const [err, setErr] = useState<string | null>(null);

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
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (err) return <LoadError what="this facility" detail={err} onRetry={load} />;
  if (!data) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 size={14} className="animate-spin" /> reading the facility…
      </div>
    );
  }

  const c = data.collateral;
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
          <Stat label="Face value" value={usd(c.faceValueUsd)} />
          <Stat label={`Haircut ${c.haircutPct}%`} value={usd(maxAdvance)} sub="maximum advance" />
          <Stat label="Term" value={`${c.termDays}d`} />
          <Stat label="Blended coupon" value={pct(c.currentRatePct)} />
        </div>
        <div className="mt-4 flex flex-col gap-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          <div>Obligor: {c.obligor}</div>
          <div>Custodian, as declared and unverified: {c.custodian}</div>
          <div className="break-all">
            Document hash: <span className="mono">{c.docHash}</span>
          </div>
        </div>
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
            <h2 className="text-sm font-semibold">Terms the borrower posted</h2>
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
                      <th className="pb-1.5 font-normal">Tranche</th>
                      <th className="pb-1.5 font-normal">Cap</th>
                      <th className="pb-1.5 font-normal">Coupon</th>
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
