"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import Link from "next/link";
import { Clock, FileText, Landmark, Layers, Loader2, Radar, ShieldCheck, Sparkles, TrendingUp, Warehouse } from "lucide-react";
import type { Agent, CollateralAsset, RefinanceOpportunity } from "@/lib/precedence/types";
import { api } from "@/lib/client/api";
import { usd, pct, riskColor, timeOf, encumbranceColor } from "@/lib/client/format";
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
        <Stagger className="flex flex-col gap-4">
          {/* The hero used to live INSIDE the card grid, spanning two columns. Being much taller
              than a normal card, it stretched whatever sat beside it to match, leaving a tall card
              with a large empty gap in the middle — the grid was equalising heights across two
              things that are not the same kind of thing. The hero is now its own block and the
              grid below holds only comparable cards. */}
          <Item>
            <Card glow className="flex h-full flex-col gap-4 p-6">
              {/* Wraps as a whole at narrow widths: two nowrap badges plus a long title cannot
                  share a 360px row, and `shrink-0` on the badge group only guaranteed the overflow
                  by preventing the wrap from ever triggering. */}
              {/* Stacked below 640px. `flex-wrap` alone was not enough: the badges are
                  whitespace-nowrap and demanded ~150px, so `min-w-0 flex-1` let the title column
                  collapse to a few characters — the headline wrapped to six lines BEHIND the
                  badges and the obligor line broke one word per line. Stacking gives the title the
                  full width it needs. */}
              <div className="flex flex-col items-start gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-x-3">
                <div className="min-w-0 sm:flex-1">
                  <div className="font-[family-name:var(--font-display)] text-xl font-bold leading-tight sm:text-2xl">
                    {hero.title}
                  </div>
                  <div className="eyebrow mt-0.5">
                    Obligor: {hero.obligor} · Custodian: {hero.custodian} ({hero.custodianLocation})
                  </div>
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {/* The hero said "CLEAR TITLE" while sibling cards with the same state said
                      "CLEAR", which looked like two different states. They are also two different
                      FACTS: `status` is the encumbrance state, `verifiedClearTitle` is whether this
                      registry holds a prior lien. Showing the status consistently keeps them
                      distinct — the title claim, with its registry-scoped caveat, lives on the
                      facility page where there is room to qualify it. */}
                  <Badge color={encumbranceColor(hero.status)}>{hero.status}</Badge>
                  <Badge color={riskColor(hero.riskLabel)}>{hero.riskLabel} risk</Badge>
                </div>
              </div>

              <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
                <div>
                  <Eyebrow>Target Clearing Rate</Eyebrow>
                  <div className="num text-4xl font-bold text-gradient leading-[1.15] pb-0.5 sm:text-5xl">{pct(hero.targetRatePct)}</div>
                </div>
                {/* Was a non-wrapping 3-across row that ran off a 360px card. */}
                <div className="flex flex-wrap gap-x-6 gap-y-2 pb-1 text-sm">
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
                <div className="flex flex-wrap items-center gap-2">
                  {/* The facility page is where a lender actually bids; the scripted race is the
                      guided walkthrough. Both are reachable so neither is the only way in. */}
                  <Link
                    href={`/collateral/${hero.id}`}
                    className="btn-ghost flex items-center gap-1.5 rounded-lg px-3.5 py-2.5 text-sm font-semibold"
                  >
                    <Layers size={14} />
                    {/^0x[0-9a-fA-F]{64}$/.test(hero.docHash) ? "View facility & bid" : "View sample facility"}
                  </Link>
                  <button
                    onClick={() => openRace(hero)}
                    disabled={launching !== null}
                    className="btn-accent flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-bold disabled:opacity-50"
                  >
                    {launching === hero.id ? <Loader2 className="animate-spin" size={15} /> : <TrendingUp size={15} />}
                    Open Priority Race
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                <span className="mono min-w-0 truncate" title={hero.id}>
                  {/* A store-only facility has no registry address, and slicing the zero address
                      printed "Registry 0x00000000000000…" as though it meant something. Say what
                      is true instead. */}
                  NFT Token #{hero.nftTokenId} ·{" "}
                  {hero.registryAddress && !/^0x0+$/.test(hero.registryAddress)
                    ? `Registry ${hero.registryAddress.slice(0, 16)}…`
                    : "not yet on the Creditcoin registry"}
                </span>
                <span className="mono shrink-0">verified {timeOf(hero.fetchedAt)}</span>
              </div>
            </Card>
          </Item>

          {/* Additional Collateral Cards — all the same shape, so equal heights read as alignment
              rather than as padding. */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {rest.map((c) => (
            <Item key={c.id}>
              <Card className="flex h-full flex-col justify-between gap-3 p-5">
                <div>
                  {/* Stacked below 640px. Side by side, a long title wrapped to six lines and ran
                      underneath the badges, printing one over the other. */}
                  <div className="flex flex-col items-start gap-1.5 sm:flex-row sm:items-start sm:justify-between sm:gap-2">
                    <div className="min-w-0 font-[family-name:var(--font-display)] text-[15px] font-semibold leading-tight sm:text-base">
                      {c.title}
                    </div>
                    <Badge color={c.verifiedClearTitle ? "var(--state-clear)" : "var(--state-encumbered)"}>
                      {c.status}
                    </Badge>
                  </div>
                  <div className="eyebrow mt-1">{c.obligor}</div>
                  {/* A lender choosing between facilities needs more than a headline rate: the
                      senior coupon they would actually receive, the term they are committing for,
                      and whether the facility can be bid into at all. Without those, comparing two
                      cards meant opening both. */}
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5">
                    <div>
                      <Eyebrow>Senior coupon</Eyebrow>
                      <div className="mono text-xl font-bold" style={{ color: "var(--rank-senior)" }}>
                        {c.terms ? pct(c.terms.seniorRatePct) : pct(c.targetRatePct)}
                      </div>
                    </div>
                    <div className="text-right">
                      <Eyebrow>Facility</Eyebrow>
                      <div className="mono font-semibold">{usd(c.financingRequestedUsd)}</div>
                    </div>
                    <div>
                      <Eyebrow>Term</Eyebrow>
                      <div className="mono text-[12px]">{c.termDays}d</div>
                    </div>
                    <div className="text-right">
                      <Eyebrow>Open to bids</Eyebrow>
                      <div className="text-[12px] font-semibold" style={{
                        color: c.status === "CLEAR" && c.terms ? "var(--proof-verified)" : "var(--text-faint)",
                      }}>
                        {c.status !== "CLEAR" ? "no · " + c.status.toLowerCase() : c.terms ? "yes" : "no terms yet"}
                      </div>
                    </div>
                  </div>
                  {c.terms ? (
                    <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                      <span>Senior {usd(c.terms.seniorCapUsd)}</span>
                      <span>Junior {usd(c.terms.juniorCapUsd)} @ {pct(c.terms.juniorRatePct)}</span>
                      <span>Sub {usd(c.terms.subordinateCapUsd)} @ {pct(c.terms.subordinateRatePct)}</span>
                    </div>
                  ) : null}
                </div>

                <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                  {/* A sample facility's document hash is a visible placeholder, so no vault
                      position exists and no bid is possible. Promising "& bid" and then refusing
                      inside is the kind of small dishonesty that costs trust in everything else on
                      the page. */}
                  <Link
                    href={`/collateral/${c.id}`}
                    className="btn-ghost flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold"
                  >
                    <Layers size={13} />
                    {/^0x[0-9a-fA-F]{64}$/.test(c.docHash) ? "View facility & bid" : "View sample facility"}
                  </Link>
                  <button
                    onClick={() => openRace(c)}
                    disabled={launching !== null}
                    className="flex w-full items-center justify-center gap-2 rounded-lg py-2 text-xs font-semibold disabled:opacity-50"
                    style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
                  >
                    {launching === c.id ? <Loader2 className="animate-spin" size={13} /> : <TrendingUp size={13} />}
                    Scripted race
                  </button>
                </div>
              </Card>
            </Item>
          ))}
          </div>
        </Stagger>
      )}
    </div>
  );
}
