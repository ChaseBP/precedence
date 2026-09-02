"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { Radar, TrendingUp, Clock, Loader2, ShieldCheck, Warehouse, FileText, Landmark, Sparkles } from "lucide-react";
import type { Agent, CollateralAsset, RefinanceOpportunity } from "@/lib/precedence/types";
import { api } from "@/lib/client/api";
import { usd, pct, riskColor, timeOf } from "@/lib/client/format";
import { Badge, Card, Dot, Eyebrow } from "@/components/ui";
import { Redacted } from "@/components/Redacted";
import { Stagger, Item, FadeUp } from "@/components/motion/Reveal";
import { WaveAlert } from "@/components/motion/WaveAlert";

const SHOWN = 6;

function CapitalTrancheBar({ col, agents }: { col: CollateralAsset; agents: Agent[] }) {
  if (!agents.length) return null;
  const req = col.financingRequestedUsd;
  const seniorReq = Math.round(req * 0.6);
  const juniorReq = Math.round(req * 0.3);
  const subReq = Math.max(0, req - seniorReq - juniorReq);

  return (
    <div>
      <div className="flex items-center justify-between text-[0.68rem]">
        <span className="eyebrow">Tranche Structure · Senior / Junior / Subordinate</span>
        <span className="mono" style={{ color: "var(--text)" }}>
          {usd(req)} Total Funding
        </span>
      </div>
      <div className="relative mt-1.5 flex h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
        <div className="h-full" style={{ width: "60%", background: "var(--rank-senior)" }} title={`Senior: $${seniorReq}`} />
        <div className="h-full" style={{ width: "30%", background: "var(--rank-junior)" }} title={`Junior: $${juniorReq}`} />
        <div className="h-full" style={{ width: "10%", background: "var(--rank-subordinate)" }} title={`Subordinate: $${subReq}`} />
      </div>
      <div className="mt-1 flex items-center justify-between text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
        <span>Senior {usd(seniorReq)} · Junior {usd(juniorReq)} · Subordinate {usd(subReq)}</span>
        <span style={{ color: "var(--success)" }}>Competing financiers lock on Sepolia</span>
      </div>
    </div>
  );
}

function RefinanceArbitragePreview({ collateralId }: { collateralId: string }) {
  const [refi, setRefi] = useState<RefinanceOpportunity | null | undefined>(undefined);

  useEffect(() => {
    let on = true;
    api.refinance(collateralId).then((r) => on && setRefi(r.opportunity)).catch(() => on && setRefi(null));
    return () => {
      on = false;
    };
  }, [collateralId]);

  if (refi === undefined) {
    return <div className="h-5 w-72 max-w-full animate-pulse rounded" style={{ background: "var(--track)" }} />;
  }
  if (!refi) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
      <Badge color="var(--event-refinance)">
        <Sparkles size={11} /> 1-block refinance
      </Badge>
      <span>
        Priority Agent target: replace senior rate at {refi.currentSeniorRatePct}% with {refi.proposedSeniorRatePct}% — save ${refi.annualSavingsUsd}/yr
      </span>
    </div>
  );
}

export default function CollateralPage() {
  const router = useRouter();
  const [collateralList, setCollateralList] = useState<CollateralAsset[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [launching, setLaunching] = useState<string | null>(null);
  const [wave, setWave] = useState<string | null>(null);

  useEffect(() => {
    api.agents().then((r) => setAgents(r.agents)).catch(() => {});
    api.collateral()
      .then((r) => {
        setCollateralList(r.collateral.slice(0, SHOWN));
        const hot = r.collateral.find((c) => c.status === "CLEAR");
        if (hot) {
          setWave(`${hot.title} · Clear Title`);
          setTimeout(() => setWave(null), 3800);
        }
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  }, []);

  async function openRace(col: CollateralAsset) {
    setLaunching(col.id);
    try {
      const r = await api.createRace({
        initiatorId: "meridian",
        collateral: col,
        requestedTotalUsd: col.financingRequestedUsd,
        mode: "auto",
      });
      router.push(`/race?id=${r.id}`);
    } catch (e) {
      setErr(String(e));
      setLaunching(null);
    }
  }

  const [hero, ...rest] = collateralList;

  return (
    <div>
      <WaveAlert show={!!wave} label={wave ?? ""} />
      <FadeUp>
        <header className="mb-6">
          <Eyebrow>Live · Encumbrance Registry · Creditcoin CC3</Eyebrow>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
            Collateral <span className="text-gradient">Scanner</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--text-muted)" }}>
            Real-world collateral assets financed by proof-ordered priority claims. The financing mechanism itself populates the registry.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs" style={{ color: "var(--text-muted)" }}>
            <span className="flex items-center gap-1.5">
              <Radar size={14} color="var(--accent)" />
              Scanning warehouse receipts, trade receivables &amp; commodity pledges.
            </span>
            <span className="mono" style={{ color: "var(--text-faint)" }}>
              Attestcoin precompile 0x0FD2 ready
            </span>
          </div>
        </header>
      </FadeUp>

      {err ? (
        <Card className="mb-4 p-4 text-sm">
          <span style={{ color: "var(--danger)" }}>{err}</span>
        </Card>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-20 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="animate-spin" size={16} /> Reading Creditcoin encumbrance registry…
        </div>
      ) : collateralList.length === 0 ? (
        <Card className="p-8 text-center">
          <Eyebrow>Collateral Scanner</Eyebrow>
          <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold">
            No registered collateral assets
          </h2>
          <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--text-muted)" }}>
            No registered assets at this moment. Register collateral via CLI: precedence collateral register.
          </p>
        </Card>
      ) : (
        <Stagger className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {/* Protagonist Hero Card: Atlas Coffee Receipt #8802 */}
          <Item className="h-full sm:col-span-2">
            <Card glow className="flex h-full flex-col gap-4 p-6">
              {/* Wraps as a whole at narrow widths: two nowrap badges plus a long title cannot
                  share a 360px row, and `shrink-0` on the badge group only guaranteed the overflow
                  by preventing the wrap from ever triggering. */}
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                <div className="min-w-0 flex-1">
                  <div className="font-[family-name:var(--font-display)] text-2xl font-bold leading-tight">
                    {hero.title}
                  </div>
                  <div className="eyebrow mt-0.5">
                    Obligor: {hero.obligor} · Custodian: {hero.custodian} ({hero.custodianLocation})
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  <Badge color={hero.verifiedClearTitle ? "var(--state-clear)" : "var(--state-encumbered)"}>
                    {hero.verifiedClearTitle ? "CLEAR TITLE" : hero.status}
                  </Badge>
                  <Badge color={riskColor(hero.riskLabel)}>{hero.riskLabel} risk</Badge>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <div>
                  <Eyebrow>Target Clearing Rate</Eyebrow>
                  <div className="num text-5xl font-bold text-gradient leading-[1.15] pb-0.5">{pct(hero.targetRatePct)}</div>
                </div>
                <div className="flex gap-6 pb-1 text-sm">
                  <div>
                    <Eyebrow>Face Value</Eyebrow>
                    <div className="mono mt-0.5 font-semibold">{usd(hero.faceValueUsd)}</div>
                  </div>
                  <div>
                    <Eyebrow>Requested</Eyebrow>
                    <div className="mono mt-0.5 font-semibold">{usd(hero.financingRequestedUsd)}</div>
                  </div>
                  <div>
                    <Eyebrow>Haircut</Eyebrow>
                    <div className="mono mt-0.5 font-semibold">{hero.haircutPct}% buffer</div>
                  </div>
                </div>
              </div>

              <CapitalTrancheBar col={hero} agents={agents} />
              <RefinanceArbitragePreview collateralId={hero.id} />

              <div
                className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t pt-3"
                style={{ borderColor: "var(--border)" }}
              >
                <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--text-muted)" }}>
                  <ShieldCheck size={14} style={{ color: "var(--success)" }} />
                  Doc hash: <span className="mono">{hero.docHash.slice(0, 14)}…</span> · Hash-unique on Creditcoin CC3
                </span>
                <button
                  onClick={() => openRace(hero)}
                  disabled={launching !== null}
                  className="btn-accent flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold disabled:opacity-50"
                >
                  {launching === hero.id ? <Loader2 className="animate-spin" size={15} /> : <TrendingUp size={15} />}
                  Open Priority Race
                </button>
              </div>

              <div className="flex items-center justify-between gap-3 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                <span className="mono min-w-0 truncate" title={hero.id}>
                  NFT Token #{hero.nftTokenId} · Registry {hero.registryAddress?.slice(0, 16)}…
                </span>
                <span className="mono shrink-0">verified {timeOf(hero.fetchedAt)}</span>
              </div>
            </Card>
          </Item>

          {/* Additional Collateral Cards */}
          {rest.map((c) => (
            <Item key={c.id}>
              <Card className="flex h-full flex-col justify-between gap-3 p-5">
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-[family-name:var(--font-display)] font-semibold">{c.title}</div>
                    <Badge color={c.verifiedClearTitle ? "var(--state-clear)" : "var(--state-encumbered)"}>
                      {c.status}
                    </Badge>
                  </div>
                  <div className="eyebrow mt-1">{c.obligor}</div>
                  <div className="mt-3 flex items-baseline justify-between">
                    <div>
                      <Eyebrow>Rate</Eyebrow>
                      <div className="mono text-xl font-bold">{pct(c.targetRatePct)}</div>
                    </div>
                    <div className="text-right">
                      <Eyebrow>Funding</Eyebrow>
                      <div className="mono font-semibold">{usd(c.financingRequestedUsd)}</div>
                    </div>
                  </div>
                </div>

                <div className="border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  <button
                    onClick={() => openRace(c)}
                    disabled={launching !== null}
                    className="btn-ghost flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold"
                  >
                    {launching === c.id ? <Loader2 className="animate-spin" size={13} /> : <TrendingUp size={13} />}
                    Enter Priority Race
                  </button>
                </div>
              </Card>
            </Item>
          ))}
        </Stagger>
      )}
    </div>
  );
}
