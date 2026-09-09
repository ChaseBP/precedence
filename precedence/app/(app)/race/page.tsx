"use client";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  Loader2,
  Play,
  Pause,
  ShieldCheck,
  Lock,
  RotateCcw,
  Sparkles,
  TrendingUp,
  ChevronLeft,
  ChevronRight,
  FastForward,
  Scale,
  Award,
  Layers,
  FileText,
  Maximize2,
} from "lucide-react";
import type { Agent, AgentDecision, PriorityRace, LifecyclePhase, ProverCallRecord } from "@/lib/precedence/types";
import { api, streamRace, type SettlementStatus } from "@/lib/client/api";
import type { LifecycleEvent } from "@/lib/precedence/types";
import { usd, pct, trancheColor } from "@/lib/client/format";
import { Badge, Card, Dot, Eyebrow, SectionTitle, Why } from "@/components/ui";
import { CopyHash } from "@/components/CopyHash";
import { PhaseStepper } from "@/components/PhaseStepper";
import { FadeUp } from "@/components/motion/Reveal";
import { useToast } from "@/components/motion/Toaster";
import { PriorityCore } from "@/components/race/PriorityCore";
import { AgentThinkingCard } from "@/components/race/AgentThinkingCard";
import { CapitalFlowGraph } from "@/components/race/CapitalFlowGraph";
import { StageSection } from "@/components/race/StageSection";
import { SummaryHeader } from "@/components/race/SummaryHeader";
import { LifecycleTimeline } from "@/components/race/LifecycleTimeline";
import { LogDrawer } from "@/components/race/LogDrawer";
import { ProverCall } from "@/components/race/ProverCall";
import { ProverChainPanel } from "@/components/race/ProverChainPanel";
import { ProofRail } from "@/components/race/ProofRail";
import { OnChainReceipts } from "@/components/race/OnChainReceipts";
import { SettlementActivity } from "@/components/race/SettlementActivity";
import { Fold } from "@/components/race/Fold";
import { ProvenOrder } from "@/components/race/ProvenOrder";
import { WaveAlert } from "@/components/motion/WaveAlert";

export default function RacePage() {
  return (
    <Suspense fallback={<div className="py-20 text-sm" style={{ color: "var(--text-muted)" }}>Loading…</div>}>
      <RaceInner />
    </Suspense>
  );
}

/**
 * The lane, and the only source of truth for it.
 *
 * @remarks Previously the seven cards were hand-written in the JSX while a separate `STAGES` array
 * fed the timeline, so the two drifted: the timeline advertised stages the lane never rendered and
 * the lane showed cards the timeline had no segment for. One array now drives the lane, the
 * timeline, the spotlight's mini-stepper and the dwell pacing, so a stage cannot exist in one and
 * not the others.
 *
 * `sid` keys into {@link hasData} and {@link stageSummary}; two cards can share one (the broadcast
 * and the bids both describe RACE_OPEN).
 */
const LANE: { id: string; sid: string; phases: LifecyclePhase[]; kicker: string; title: string }[] = [
  { id: "registered", sid: "registered", phases: ["COLLATERAL_REGISTERED"], kicker: "COLLATERAL", title: "Asset Registered & Safety Margin Set" },
  { id: "broadcast", sid: "race", phases: ["RACE_OPEN"], kicker: "RACE", title: "Race Open & Sepolia Locks" },
  { id: "bids", sid: "race", phases: ["RACE_OPEN"], kicker: "FINANCIERS", title: "Competing Financier Bids & Tranches" },
  { id: "proof", sid: "settled", phases: ["PRIORITY_SETTLED", "CAPITAL_DRAWN", "ENCUMBERED"], kicker: "PROOF", title: "Attestcoin 0x0FD2 & Proof-Ordered Priority" },
  { id: "refi", sid: "refi", phases: ["REFI_DISCOVERED", "ATOMIC_REFINANCE"], kicker: "REFINANCE", title: "Atomic Refinance" },
  { id: "waterfall", sid: "repaid", phases: ["REPAYMENT_PROOF", "LIEN_RELEASED"], kicker: "PAYOUT", title: "Proven Repayment & Payout Order" },
  { id: "record", sid: "distress", phases: ["SETTLED_CLOSED", "FROZEN_DRAW", "PCR_STABILIZATION", "GRACE_PERIOD", "DUTCH_LIQUIDATION", "TERMINATED_DEFAULT", "BREACHED"], kicker: "RECORD", title: "Settlement Record" },
];

/**
 * The heading a stage carries, which is not always the one in {@link LANE}.
 *
 * @remarks Two stages earn a different name. Only a distressed race gets the harder wording for
 * stage 7. And on a live race stage 3 is not "bids" at all — nobody declared anything, capital
 * simply arrived — so the scripted title would be describing something that did not happen.
 */
const laneTitle = (id: string, r: PriorityRace) => {
  if (id === "record" && r.track === "DISTRESSED") return "Deterministic Failure Branch";
  if (id === "bids" && r.onchain) return "Locked Capital & Proven Positions";
  return LANE.find((x) => x.id === id)?.title ?? "";
};

/** How long the spotlight holds each stage before it advances itself. Keyed by lane id. */
const DWELL_MS: Record<string, number> = {
  registered: 4000,
  broadcast: 3500,
  bids: 6000,
  proof: 7000,
  refi: 4500,
  waterfall: 5500,
  record: 5000,
};

/** One line per protocol state, mirroring PHASE_STATUS_LINE on the server. */
const STATUS_LINE: Record<string, string> = {
  COLLATERAL_REGISTERED: "Hash-unique collateral NFT minted · verifying clear title…",
  RACE_OPEN: "Financing window open · competing financiers locking on Sepolia…",
  PRIORITY_SETTLED: "Ordering fixed by (height, txIndex) · awaiting attestation of the source block",
  CAPITAL_DRAWN: "Obligor drawing capital from the Sepolia vault…",
  ENCUMBERED: "Facility active · lien recorded on Creditcoin CC3",
  REFI_DISCOVERED: "Priority Agent scanning the registry for rate arbitrage…",
  ATOMIC_REFINANCE: "One block: old lien released + new lien created · no gap",
  REPAYMENT_PROOF: "Repayment proven on Sepolia · amount decoded from the verified tx",
  LIEN_RELEASED: "Strict seniority waterfall paid · claims burned",
  SETTLED_CLOSED: "Facility resolved · collateral returned to CLEAR",
  FROZEN_DRAW: "Draws frozen by permissionless keeper poke · capital protected",
  PCR_STABILIZATION: "Coverage below threshold · collateral top-up window open…",
  GRACE_PERIOD: "Repayment overdue · cure window running before liquidation",
  DUTCH_LIQUIDATION: "Descending-price auction of the collateral NFT…",
  TERMINATED_DEFAULT: "Unwind complete · loss allocated · obligor flagged DEFAULT",
  BREACHED: "Collateral movement proven · claims frozen · legal escalation",
  AUTO_REFUND: "Outpaced capital returned · no lien created",
  ABORTED: "Priority settlement aborted",
};

const TERMINAL: LifecyclePhase[] = ["SETTLED_CLOSED", "TERMINATED_DEFAULT", "AUTO_REFUND", "ABORTED"];
const isTerminalPhase = (p?: LifecyclePhase) => !!p && TERMINAL.includes(p);

function hasData(id: string, r: PriorityRace): boolean {
  switch (id) {
    case "registered":
      return !!r.analysis;
    case "race":
      return r.decisions.length > 0 || r.locks.length > 0;
    case "settled":
      return !!r.proofRecord || !!r.settlement;
    case "drawn":
      return !!r.draw;
    case "refi":
      return !!r.refinanceOpportunity || !!r.refinance;
    case "repaid":
      return !!r.repayment || !!r.waterfall;
    case "distress":
      return (
        !!r.attestation ||
        !!r.freeze ||
        !!r.pcr ||
        !!r.gracePeriod ||
        !!r.liquidation ||
        !!r.defaulted ||
        !!r.breach
      );
    default:
      return false;
  }
}

function stageSummary(id: string, r: PriorityRace): string {
  // Locks first, bids as the fallback. A `bid` is a scripted financier's stated intention; a lock
  // is capital in the vault. A live race has locks and no bids at all, so summing only bids
  // printed "1 lock on Sepolia · $0 committed" next to two thousand real dollars.
  const committed = r.locks.length
    ? r.locks.reduce((s, l) => s + (l.refunded ? 0 : l.amountUsd), 0)
    : r.bids.reduce((s, b) => s + b.committedUsd, 0);
  switch (id) {
    case "registered":
      return r.analysis
        ? `Safety margin ${usd(r.analysis.haircutUsd)} · max loan ${usd(r.analysis.maxDrawUsd)}`
        : "analyzing…";
    case "race":
      return r.locks.length
        ? `${r.locks.length} ${r.locks.length === 1 ? "lock" : "locks"} on Sepolia · ${usd(committed)} committed`
        : r.bids.length
          ? `${r.bids.length} bids · ${usd(committed)}`
          : "evaluating…";
    case "settled": {
      if (!r.settlement) return "verifying at 0x0FD2…";
      const s = r.settlement;
      const parts = [
        s.seniorFinancier ? `Senior ${s.seniorFinancier.toUpperCase()}` : null,
        s.juniorFinancier ? `Junior ${s.juniorFinancier.toUpperCase()}` : null,
        s.subordinateFinancier ? `Sub ${s.subordinateFinancier.toUpperCase()}` : null,
      ].filter(Boolean);
      return parts.join(" / ") || "settled";
    }
    case "drawn":
      return r.draw ? `Drew ${usd(r.draw.amountUsd)} of ${usd(r.draw.maxDrawUsd)}` : "—";
    case "refi":
      return r.refinance
        ? `Refinanced ${r.refinance.oldRatePct}% → ${r.refinance.newRatePct}% · saves ${usd(r.refinance.annualSavingsUsd)}/yr`
        : r.refinanceOpportunity
          ? `${r.refinanceOpportunity.spreadSavingsBps} bps opportunity found`
          : "facility optimal";
    case "repaid":
      return r.waterfall
        ? `${r.waterfall.kind === "LIQUIDATION" ? "Recovered" : "Repaid"} ${usd(r.waterfall.realizedRepaymentUsd)} · senior paid first`
        : "—";
    case "distress": {
      if (r.defaulted) return `Default · first loss ${usd(r.defaulted.subordinateLossUsd + r.defaulted.juniorLossUsd)}`;
      if (r.liquidation) return `Dutch auction cleared at ${usd(r.liquidation.clearingPriceUsd ?? 0)}`;
      if (r.gracePeriod) return `${r.gracePeriod.durationDays}-day cure window`;
      if (r.pcr) return `PCR ${r.pcr.pcrPct.toFixed(1)}% vs ${r.pcr.thresholdPct}%`;
      if (r.breach) return `Breach proven · ${r.breach.claimsFrozen} claims frozen`;
      if (r.freeze) return `Draw frozen · ${usd(r.freeze.frozenDrawUsd)} protected`;
      return "—";
    }
    default:
      return "";
  }
}

function RaceInner() {
  const router = useRouter();
  const params = useSearchParams();
  const id = params.get("id");
  const { toast } = useToast();

  const [race, setRace] = useState<PriorityRace | null>(null);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [events, setEvents] = useState<LifecycleEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState(false);
  // The nav links to bare /race; resolve it to the live race rather than an error.
  const [resolving, setResolving] = useState(!id);
  // Presentation playhead: what the page shows, decoupled from how fast the race settles.
  // Seven stages land in well under a minute; nobody can read that, so the lane replays them at
  // reading speed and says so rather than pretending the clock is the demo.
  const [playhead, setPlayhead] = useState(0);
  const [paused, setPaused] = useState(false);
  // Spotlight: the playhead stage pops as a centered overlay, then docks back into the lane.
  const [spot, setSpot] = useState(false);
  const [hovering, setHovering] = useState(false); // hover = reading, so the dwell bar holds
  /**
   * The banner's content and whether it is up, kept together.
   *
   * @remarks `open` is separate from the wave existing so that clearing the banner does not also
   * erase the text it is still displaying on its way out. The obvious alternative — remembering the
   * last label in a ref — reads that ref during render, which is not reactive and is flagged for
   * exactly that reason.
   */
  const [wave, setWave] = useState<{
    label: string;
    variant: "settle" | "breach" | "refinance" | "detected";
    open: boolean;
  } | null>(null);
  const reduced = useReducedMotion();
  /**
   * The live settlement's stage, as the chains report it.
   *
   * @remarks Held here rather than only inside the activity panel because the header and the stage
   * timeline have to agree with it. A live race's STORED phase stops at RACE_OPEN and never moves —
   * nothing advances it, deliberately, since the scripted engine is refused on a live race — so
   * anything reading the stored phase eventually contradicts the panel.
   */
  const [liveStatus, setLiveStatus] = useState<SettlementStatus | null>(null);

  /**
   * A settlement that exists on chain, rather than a scripted walkthrough of one.
   *
   * @remarks Changes three things on this page, and each one would be a lie if it did not. The
   * transport controls disappear, because "Step" and "Auto Run" drive the *simulated* orchestrator
   * and pushing a live race through it would fabricate the settlement it is waiting to prove. The
   * replay spotlight does not arm, because there is no scripted story to replay — the page is
   * showing a present state, not narrating a past one. And the receipts card appears, because for
   * the first time there is something real to link to.
   */
  const live = !!race?.onchain;

  const lastPhase = useRef<string>("");
  const notified = useRef<string>("");

  useEffect(() => {
    api.agents()
      .then((r) => setAgents(r.agents))
      .catch(() => {});
  }, []);

  const refetch = useCallback(async (rid: string) => {
    const r = await api.race(rid).catch(() => null);
    if (r?.race) setRace(r.race);
  }, []);

  // No ?id= — send the visitor to the race that is actually running (falling back
  // to the most recent), so "Priority settlement" in the nav is never a dead end.
  useEffect(() => {
    let cancelled = false;
    if (id) {
      // Deferred rather than set inline: React 19 treats a synchronous setState in an effect body
      // as a cascading render.
      void Promise.resolve().then(() => {
        if (!cancelled) setResolving(false);
      });
      return () => {
        cancelled = true;
      };
    }
    api.races()
      .then((r) => {
        if (cancelled) return;
        const all = r?.races ?? [];
        const live = all.find((x) => x.outcome === "in-progress") ?? all[0];
        if (live) router.replace(`/race?id=${live.id}`);
        else setResolving(false);
      })
      .catch(() => { if (!cancelled) setResolving(false); });
    return () => { cancelled = true; };
  }, [id, router]);

  useEffect(() => {
    if (!id) return;
    lastPhase.current = "";
    // Resetting per-race view state. Batched into one deferred call so the reset is a single
    // update after the effect body, not five synchronous ones inside it.
    void Promise.resolve().then(() => {
      setEvents([]);
      setLoadError(false);
      setPlayhead(0);
      setPaused(false);
      setSpot(false);
    });

    api.race(id)
      .then((r) => {
        if (r?.race) {
          setRace(r.race);
          if (r?.events) setEvents(r.events);
          if (isTerminalPhase(r.race.status) || r.race.onchain) {
            // Already settled, or live on chain: open at the current state.
            //
            // The playhead is a REPLAY device. A scripted race completes in seconds, which nobody
            // can read, so the lane walks its stages at reading speed and says so. A live race has
            // no story to replay — it is showing a present state that changes when the chains do.
            // Left at zero it held a real settlement behind "the race is ahead — showing stages at
            // reading speed", so the page reported its own animation as the reason a lender could
            // not see the lock they had just signed.
            setPlayhead(Number.MAX_SAFE_INTEGER);
          } else {
            setSpot(true); // in flight: each stage spotlights as it lands
          }
        } else {
          setLoadError(true);
        }
      })
      .catch(() => setLoadError(true));

    const stop = streamRace(
      id,
      (ev) => {
        setEvents((prev) => (prev.some((p) => p.seq === ev.seq) ? prev : [...prev, ev]));
        if (ev.phase !== lastPhase.current) {
          lastPhase.current = ev.phase;
          refetch(id);
        }
        if (ev.phase === "PRIORITY_SETTLED" && ev.level === "success" && ev.message.includes("PRIORITY SETTLED")) {
          setWave({
            label: "Priority settled by proven ordering · Claims minted",
            variant: "settle",
            open: true,
          });
          // Closes it rather than deleting it, so the exit animation has something to render.
          setTimeout(() => setWave((w) => (w ? { ...w, open: false } : null)), 4000);
        }
      },
      () => refetch(id),
    );
    return stop;
  }, [id, refetch, reduced]);

  /**
   * Who actually holds the senior lien — or nobody.
   *
   * @remarks A NAME alone is not a position. `settlement.seniorFinancier` can be set while
   * `seniorAmountUsd` is zero (the refinance step used to do exactly that), so the amount is what
   * decides whether a senior holder exists. Reading the name alone credited the senior lien to an
   * agent that had declined to bid.
   */
  const seniorHolder =
    race?.settlement?.seniorFinancier && (race.settlement.seniorAmountUsd ?? 0) > 0
      ? race.settlement.seniorFinancier
      : null;

  useEffect(() => {
    if (!race || notified.current === race.id + race.status) return;
    if (race.status === "SETTLED_CLOSED") {
      notified.current = race.id + race.status;
      toast({
        level: "success",
        title: "Priority Settled",
        // A hardcoded "MERIDIAN" fallback used to fire whenever no senior position was won,
        // crediting the senior lien to an agent that had declined to bid. Say what is true.
        body: seniorHolder
          ? `Senior Lien: ${seniorHolder.toUpperCase()} · Encumbrance registered on Creditcoin CC3`
          : `No senior lien taken — the senior tranche went unfilled. Encumbrance registered on Creditcoin CC3`,
      });
    } else if (race.status === "ABORTED") {
      notified.current = race.id + race.status;
      toast({ level: "warn", title: "Priority settlement aborted", body: race.aborted?.reason });
    }
  }, [race, toast]);

  const liveDecisions = useMemo(() => {
    const m = new Map<string, AgentDecision>();
    for (const e of events) {
      const d = (e.data as { decision?: AgentDecision } | undefined)?.decision;
      if (d?.agentId) m.set(d.agentId, d);
    }
    for (const d of race?.decisions ?? []) m.set(d.agentId, d);
    return m;
  }, [events, race?.decisions]);

  const liveProverCalls = useMemo(() => {
    const m = new Map<string, ProverCallRecord>();
    for (const e of events) {
      const s = (e.data as { proverCall?: ProverCallRecord } | undefined)?.proverCall;
      if (s?.id) m.set(s.id, s);
    }
    for (const s of race?.proverCalls ?? []) m.set(s.id, s);
    return Array.from(m.values()).sort((a, b) => a.at.localeCompare(b.at));
  }, [events, race?.proverCalls]);

  // Stages that have happened or are happening, in chronological order. A stage the race never
  // reached is not shown at all — an empty card is worse than no card.
  const stagesShown = useMemo(() => {
    if (!race) return [] as (typeof LANE[number] & { active: boolean })[];
    // A terminal phase marks nothing active. `record` lists SETTLED_CLOSED among its phases, so
    // without this the final stage would start spinning at the exact moment the race finished —
    // the one moment a viewer most needs to see a check.
    const running = !isTerminalPhase(race.status);
    return LANE.map((st) => ({ ...st, active: running && st.phases.includes(race.status) })).filter(
      (st) => st.active || hasData(st.sid, race),
    );
  }, [race]);

  const lastIdx = stagesShown.length - 1;
  const ph = Math.max(0, Math.min(playhead, lastIdx));
  const heroStage = stagesShown[ph];
  const lagging = ph < lastIdx;

  // Fallback pacing for when the overlay is off (reduced motion, or dismissed): advance at most
  // one stage every 4.5s. While the overlay is up its dwell bar drives the advance instead, so
  // the two never fight over the playhead.
  useEffect(() => {
    const last = stagesShown.length - 1;
    // `live` is excluded rather than relying on the playhead already being pinned: a stage
    // gaining data raises `last`, and without this the pacing timer would start walking a live
    // race forward one card at a time as its locks arrived.
    if (live || spot || paused || playhead >= last) return;
    const t = setTimeout(() => setPlayhead((i) => Math.min(i + 1, last)), 4500);
    return () => clearTimeout(t);
  }, [live, playhead, paused, spot, stagesShown.length]);

  // The spotlight is a modal, so the page behind it must not scroll.
  useEffect(() => {
    document.body.style.overflow = spot ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [spot]);

  // Presenter-remote keys.
  //
  // The guard used to be `e.target !== document.body`, which sounds safe and is nearly useless:
  // clicking any transport button leaves it focused, so every subsequent arrow and Escape was
  // swallowed and the remote appeared dead right after you used it. Only a text field has a real
  // claim on these keys, so only a text field is excluded.
  useEffect(() => {
    if (!id) return;
    // Nothing to step through on a live race: there is one present state, and stepping "back"
    // from it would show a viewer a past the chain never had.
    if (race?.onchain) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
      const last = stagesShown.length - 1;
      if (e.key === "ArrowRight") {
        setPaused(true);
        setSpot(true);
        setPlayhead((i) => Math.min(Math.min(i, last) + 1, last));
      } else if (e.key === "ArrowLeft") {
        setPaused(true);
        setSpot(true);
        setPlayhead((i) => Math.max(0, Math.min(i, last) - 1));
      } else if (e.key === " ") {
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "Escape") {
        setSpot(false);
        setPaused(false);
        setPlayhead(Number.MAX_SAFE_INTEGER);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [id, race?.onchain, stagesShown.length, reduced]);

  const settled = isTerminalPhase(race?.status);
  // Whether the PROOF exists, which is a different question from which phase the race is in.
  const proven = !!race?.proofRecord || !!race?.settlement;
  /** One line per live stage, mirroring the panel's own headline rather than restating the phase. */
  const LIVE_STATUS_LINE: Record<SettlementStatus["stage"], string> = {
    WINDOW_OPEN: "Financing window open on the vault · locks accepted until the deadline",
    AWAITING_CLOSE: "Window elapsed · the race is still open until someone sends closeRace",
    AWAITING_ATTESTATION: "Attestcoin is attesting the source block · ordering already fixed",
    PROOF_READY: "Source block attested · the proof can be submitted on Creditcoin",
    PROVEN: "Priority proven at 0x0FD2 · the obligor can now draw",
    ENCUMBERED: "Facility drawn and running · lien recorded on Creditcoin",
    REPAID_AWAITING_PROOF: "Repaid on Sepolia · the repayment needs proving before the waterfall pays",
  };
  const statusLine =
    (liveStatus ? LIVE_STATUS_LINE[liveStatus.stage] : undefined) ??
    STATUS_LINE[race?.status ?? "COLLATERAL_REGISTERED"] ??
    "Settling priority…";
  /**
   * Which of the seven lane stages a LIVE settlement is in.
   *
   * @remarks Everything from attestation onwards is the PROOF stage: the ordering is fixed the
   * moment the locks land, and what remains is proving it. `SummaryHeader` renders that as
   * "Attesting" rather than "Priority Settled" while `proven` is false, so the boldest claim on
   * the screen still waits for the proof that earns it.
   */
  const LIVE_PHASE: Record<SettlementStatus["stage"], LifecyclePhase> = {
    WINDOW_OPEN: "RACE_OPEN",
    AWAITING_CLOSE: "RACE_OPEN",
    AWAITING_ATTESTATION: "PRIORITY_SETTLED",
    PROOF_READY: "PRIORITY_SETTLED",
    PROVEN: "PRIORITY_SETTLED",
    // Stage 4 covers PRIORITY_SETTLED through ENCUMBERED, so a drawn facility lights the same
    // segment — correctly. The lane only moves past it when the loan does.
    ENCUMBERED: "ENCUMBERED",
    REPAID_AWAITING_PROOF: "REPAYMENT_PROOF",
  };

  const advanceStep = async () => {
    if (!id || busy) return;
    setBusy(true);
    try {
      await api.advanceRace(id, "step");
      await refetch(id);
    } finally {
      setBusy(false);
    }
  };

  const advanceAuto = async () => {
    if (!id || busy) return;
    setBusy(true);
    try {
      await api.advanceRace(id, "auto");
    } finally {
      setBusy(false);
    }
  };

  if (resolving) {
    return (
      <Card className="p-8 text-center">
        <Eyebrow>Priority settlement</Eyebrow>
        <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>Loading the live settlement…</p>
      </Card>
    );
  }

  if (loadError || (!race && !id)) {
    return (
      <Card className="p-8 text-center">
        <Eyebrow>Priority settlement</Eyebrow>
        <h2 className="mt-1 font-[family-name:var(--font-display)] text-xl font-semibold">Settlement Not Found</h2>
        <p className="mx-auto mt-2 max-w-md text-sm" style={{ color: "var(--text-muted)" }}>
          The requested settlement does not exist. Open one from Facilities.
        </p>
        <div className="mt-5">
          <button onClick={() => router.push("/collateral")} className="btn-accent rounded-lg px-4 py-2 text-sm font-semibold">
            View Collateral
          </button>
        </div>
      </Card>
    );
  }

  if (!race) {
    return (
      <div className="flex items-center justify-center py-20 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="animate-spin" size={16} /> Loading the settlement…
      </div>
    );
  }

  /**
   * The body of one lane stage.
   *
   * @remarks Split out of the JSX so the spotlight overlay and the docked lane card render the
   * exact same content. Two copies of a stage body is how the overlay and the lane end up
   * disagreeing about what a stage showed.
   */
  const renderStage = (sid: string) => {
    switch (sid) {
      case "registered":
        return (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <Eyebrow>Collateral Type</Eyebrow>
              <div className="mt-0.5 font-semibold capitalize">{race.collateral.assetType.replace("-", " ")}</div>
            </div>
            <div>
              <Eyebrow>Face Value</Eyebrow>
              <div className="mono mt-0.5 font-semibold">{usd(race.collateral.faceValueUsd)}</div>
            </div>
            <div>
              <Eyebrow>Safety Margin</Eyebrow>
              {/* The asset's own haircut. This read "15%" and multiplied by 0.15 whatever the
                  borrower had actually posted, so a 20% facility was described as 15% three lines
                  under a header stating 20% — and the dollar figure was wrong to match. */}
              <div className="mono mt-0.5 font-semibold" style={{ color: "var(--success)" }}>
                {race.collateral.haircutPct}% (
                {usd(race.analysis?.haircutUsd ?? race.collateral.faceValueUsd * (race.collateral.haircutPct / 100))})
              </div>
            </div>
          </div>
          {/* Was "Custodian & Title Verification" behind a green shield. We verify neither.
              What we actually check is this registry's own lien records, so the heading now
              says that and the caveat is stated inline rather than left to be inferred. */}
          <div className="rounded-lg border p-3 text-xs" style={{ borderColor: "var(--border)" }}>
            <div className="flex items-center gap-2 font-semibold">
              <FileText size={14} style={{ color: "var(--text-muted)" }} />
              <span>Custodian As Declared · Registry Lien Check</span>
            </div>
            <div className="mt-1.5 flex flex-col gap-1" style={{ color: "var(--text-muted)" }}>
              <div>Custodian (declared, unverified): {race.collateral.custodian} ({race.collateral.custodianLocation})</div>
              <div className="break-all">Doc Hash: <span className="mono">{race.collateral.docHash}</span></div>
              <div>Prior liens in THIS registry: {race.collateral.verifiedClearTitle ? "none found" : "ENCUMBERED"}</div>
              <div style={{ color: "var(--text-faint)" }}>
                Registry-scoped. A custodian issuing two receipts for one physical lot is not
                detectable from here.
              </div>
            </div>
          </div>
        </div>
        );
      case "broadcast":
        return (
        <div className="flex flex-col gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
          <p>
            Obligor <span className="font-semibold" style={{ color: "var(--text)" }}>{race.collateral.obligor}</span> has broadcast a financing request of <span className="font-semibold" style={{ color: "var(--text)" }}>${race.requestedTotalUsd.toLocaleString()}</span> at a target rate of <span className="font-semibold" style={{ color: "var(--text)" }}>{race.collateral.targetRatePct}%</span>.
          </p>
          <div className="flex items-center gap-2 rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
            <Layers size={14} style={{ color: "var(--accent)" }} />
            <span>PriorityVault contract deployed on Sepolia (chainKey 1). Race window open for bids.</span>
          </div>
        </div>
        );
      case "bids":
        // Two different things share this stage, and showing the wrong one is a fabrication.
        //
        // A scripted race is contested by three house financiers with distinct mandates, and
        // watching them reason is the point of the walkthrough. A live race has none: it is
        // contested by whoever holds a wallet, and nobody has told us what they intend. Rendering
        // Meridian, Vector and Novum "EVALUATING RISK & TRANCHE…" over a real facility invented
        // three institutions that were not there — under a heading claiming they were bidding.
        return live ? (
          <div className="flex flex-col gap-3">
            {race.locks.length > 0 ? (
              <div className="flex flex-col gap-2">
                {race.locks.map((l) => (
                  <div
                    key={l.sepoliaTxHash}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="min-w-0">
                      <div
                        className="text-[10.5px] font-semibold uppercase tracking-wider"
                        style={{ color: trancheColor(l.tranche) }}
                      >
                        {l.tranche}
                      </div>
                      <div className="mono mt-0.5 truncate text-[11px]" style={{ color: "var(--text-muted)" }}>
                        {l.financierAddress}
                      </div>
                    </div>
                    <div className="mono shrink-0 text-right text-[11px]">
                      <div className="font-semibold">{usd(l.amountUsd)}</div>
                      <div style={{ color: "var(--text-faint)" }}>
                        block {l.lockBlockNumber.toLocaleString()} · index {l.lockTxIndex}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--text-muted)" }}>
                No capital has been locked yet. The window is open on the vault; the first
                transaction to land takes the first position.
              </p>
            )}
            <Why>
              These are wallets, not house agents. A live race has no declared intentions to show —
              only transactions that landed, and the block and index each one landed at.
            </Why>
          </div>
        ) : (
        <div className="flex flex-col gap-3">
          <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
            {["meridian", "vector", "novum"].map((id) => (
              <AgentThinkingCard
                key={id}
                name={id}
                decision={liveDecisions.get(id)}
                thinking={race.status === "RACE_OPEN" && !liveDecisions.has(id)}
              />
            ))}
          </div>
          <Why>
            Financiers reason with independent risk mandates: Meridian demands Senior priority, Vector takes Junior for yield, and Novum bids Subordinate with 2× capital bonding.
          </Why>
        </div>
        );
      case "proof":
        return (
        <div className="flex flex-col gap-3.5">
          {race.locks.length > 0 ? (
            <div className="flex flex-col gap-2">
              <Eyebrow>Sepolia Source Locks (Priority Roots)</Eyebrow>
              <div className="grid grid-cols-1 gap-2">
                {race.locks.map((lock, idx) => (
                  <div
                    key={lock.sepoliaTxHash}
                    className="flex items-center justify-between rounded-lg border p-2.5 text-xs"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center gap-2.5">
                      {/* The circle is the PROVEN POSITION, which is genuinely ordinal — first
                          proven lock, second, third. The tranche badge on the right is a
                          separate fact and must not be inferred from it. */}
                      <span
                        className="mono flex h-5 w-5 items-center justify-center rounded-full text-[0.65rem] font-bold"
                        style={{
                          background: "var(--rank-senior-soft)",
                          color: "var(--rank-senior)",
                          border: "1px solid var(--rank-senior)",
                        }}
                        title={`proven position ${idx + 1} in this race`}
                      >
                        #{idx + 1}
                      </span>
                      <div>
                        <div className="font-semibold capitalize">
                          {lock.financier} · ${lock.amountUsd.toLocaleString()} ({lock.tranche})
                        </div>
                        <div className="mono text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                          Sepolia Block #{lock.lockBlockNumber} · {lock.sepoliaTxHash.slice(0, 18)}…
                        </div>
                      </div>
                    </div>
                    {/* Was `idx === 0 ? "SENIOR" : "JUNIOR"`, which labelled every lock by its
                        POSITION rather than its tranche. It could never say SUBORDINATE, and it
                        contradicted the tranche printed immediately to its left — a junior lock
                        sat under a SENIOR badge, which reads as a settlement bug to anyone
                        looking. The tranche is a property of the lock; only the position is
                        ordinal. */}
                    <Badge color={lock.refunded ? "var(--event-refund)" : trancheColor(lock.tranche)}>
                      {lock.refunded ? `${lock.tranche} · AUTO-REFUNDED` : lock.tranche}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {/* Prover Pipeline Chain */}
          <ProverChainPanel calls={liveProverCalls} />

          <Why>
            Ordering is established by Attestcoin precompile at 0x0FD2 from canonical source-chain block numbers. First lock = Senior; redundant locks are auto-refunded to block duplicate claims.
          </Why>
        </div>
        );
      case "refi":
        return (
        <div className="flex flex-col gap-3 text-xs">
          {race.refinance ? (
            <div className="rounded-lg border p-3" style={{ borderColor: "var(--event-refinance)" }}>
              <div className="flex items-center gap-2 font-semibold" style={{ color: "var(--event-refinance)" }}>
                <Sparkles size={14} />
                <span>Atomic Refinance Executed (1 Creditcoin Block)</span>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-2" style={{ color: "var(--text-muted)" }}>
                <div>Old Senior Rate: {race.refinance.oldRatePct}% ({race.refinance.oldFinancier})</div>
                <div>New Senior Rate: {race.refinance.newRatePct}% ({race.refinance.newFinancier})</div>
                <div>Annual Savings: ${race.refinance.annualSavingsUsd}/yr</div>
                <div>Creditcoin Tx: <span className="mono">{race.refinance.creditcoinTxHash.slice(0, 14)}…</span></div>
              </div>
            </div>
          ) : (
            <div style={{ color: "var(--text-muted)" }}>
              Priority Agent scanned the Creditcoin encumbrance graph. Facility pricing remains optimal.
            </div>
          )}
        </div>
        );
      case "waterfall":
        return (
        <div className="flex flex-col gap-3">
          {race.waterfall ? (
            <div className="flex flex-col gap-2 text-xs">
              <div className="flex items-center justify-between">
                <Eyebrow>Repayment &amp; Yield Payouts</Eyebrow>
                <span className="mono" style={{ color: "var(--success)" }}>
                  Total Repaid: {usd(race.waterfall.realizedRepaymentUsd)}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2">
                {race.waterfall.lines.map((line) => (
                  <div
                    key={line.agentId}
                    className="flex items-center justify-between rounded-lg border p-2.5"
                    style={{ borderColor: "var(--border)" }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="font-semibold capitalize">{line.agentId}</span>
                      <Badge color={trancheColor(line.tranche)}>{line.tranche}</Badge>
                    </div>
                    <div className="mono font-semibold" style={{ color: "var(--success)" }}>
                      +{usd(line.payoutUsd)} ({usd(line.interestEarnedUsd)} yield)
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>
        );
      case "record":
        return (
        <div className="flex flex-col gap-3 text-xs" style={{ color: "var(--text-muted)" }}>
          {race.attestation ? (
            <div className="flex flex-col gap-2 rounded-lg border p-3" style={{ borderColor: "var(--border)" }}>
              <div className="flex items-center justify-between">
                <span className="font-semibold" style={{ color: "var(--text)" }}>
                  Attestation Gate Record
                </span>
                <Badge color="var(--success)">CONFIRMED</Badge>
              </div>
              <div className="break-all">Proof Hash: <span className="mono">{race.attestation.creditcoinTxHash}</span></div>
              <div>Claim Token: <span className="mono">{race.attestation.claimTokenId} (ERC-1155)</span></div>
              <div>Settlement Score: <span className="mono">{race.attestation.score} / 100</span></div>
            </div>
          ) : (
            <div>Awaiting final Creditcoin CC3 state transition confirmation…</div>
          )}
        </div>
        );
      default:
        return null;
    }
  };

  const elapsedS = settled ? (new Date(race.updatedAt).getTime() - new Date(race.createdAt).getTime()) / 1000 : null;
  // The timeline follows the PLAYHEAD, not the race. Fed the race's own status it read
  // "Stage 7 of 7 · Settlement Record" with all seven segments already checked while the card
  // below it showed stage 1 — the orientation strip pointing somewhere other than the thing it
  // was orienting you to. Once the playhead catches up the two are the same value again.
  // Which lane position the proof actually lands at, so the rank badge can follow the replay.
  const proofStageIndex = Math.max(0, stagesShown.findIndex((st) => st.sid === "settled"));
  const tlStatus: LifecyclePhase = liveStatus
    ? LIVE_PHASE[liveStatus.stage]
    : lagging
      ? stagesShown[ph]?.phases[0] ?? race.status
      : race.status;
  const shown = stagesShown.slice(0, ph + 1);
  // Space activates whatever button has focus, so a transport control left focused would fire
  // twice on one keypress — once as the button, once as "pause". Releasing focus after a click
  // hands the keys back to the presenter remote.
  const drop = () => (document.activeElement as HTMLElement | null)?.blur();
  const stepPrev = () => { drop(); setPaused(true); setSpot(true); setPlayhead(Math.max(0, ph - 1)); };
  const stepNext = () => { drop(); setPaused(true); setSpot(true); setPlayhead(Math.min(lastIdx, ph + 1)); };
  const skipAll = () => { drop(); setSpot(false); setPaused(false); setPlayhead(Number.MAX_SAFE_INTEGER); };
  const replayAll = () => { drop(); setSpot(true); setPaused(false); setPlayhead(0); };
  /**
   * Put the spotlight back.
   *
   * @remarks Escape dismisses the overlay and there was no way to bring it back — a keypress, and
   * the walkthrough's whole presentation was gone for the rest of the visit. It reopens at the
   * current stage rather than restarting, unless the playhead has already run out, in which case
   * there is nothing ahead to spotlight and it starts over.
   */
  const reopenSpot = () => { drop(); setPaused(false); setSpot(true); if (ph >= lastIdx) setPlayhead(0); };
  // Catch-up: opening a race mid-run leaves a deep backlog, which skims rather than dwelling.
  const dwellMs = lastIdx - ph >= 3 ? 1200 : DWELL_MS[heroStage?.id ?? ""] ?? 4500;
  const advance = () => {
    if (ph < lastIdx) setPlayhead((i) => (i === ph ? ph + 1 : i)); // no-op if skipped meanwhile
    else if (settled) setSpot(false);
  };
  // The dwell bar finished. Hold if someone is mid-selection — that is a hash being copied, and
  // yanking the card away under the cursor is the rudest thing this screen can do.
  const dwellEnd = () => {
    if (window.getSelection()?.toString()) {
      setTimeout(dwellEnd, 1500);
      return;
    }
    advance();
  };

  return (
    <div className="flex flex-col gap-5">
      {/* Always mounted, so `show` going false plays the exit animation the banner defines.
          Rendering it conditionally unmounted the component the instant a wave cleared, and
          `AnimatePresence` lives inside it, so the exit never ran. */}
      <WaveAlert show={!!wave?.open} label={wave?.label ?? ""} variant={wave?.variant} />

      {/* Summary Header & Timeline */}
      <FadeUp>
        <SummaryHeader
          race={race}
          statusLine={statusLine}
          proven={proven}
          chainStatus={liveStatus}
          phase={liveStatus ? LIVE_PHASE[liveStatus.stage] : undefined}
        />
      </FadeUp>

      <FadeUp delay={0.08}>
        <Card>
          <LifecycleTimeline stages={LANE} status={tlStatus} />
        </Card>
      </FadeUp>

      {/* Honesty layer. The playhead can lag reality by a wide margin, and the right response is
          to say so and brag about the real number — not to let a viewer believe the replay speed
          is the settlement speed. */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {lagging ? (
          <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
            {settled && elapsedS !== null
              ? `settled in ${elapsedS.toFixed(1)}s — replaying at reading speed`
              : "the race is ahead — showing stages at reading speed"}
            <button onClick={skipAll} className="btn-ghost inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.68rem]">
              <FastForward size={11} /> {settled ? "Skip to result" : "Skip to live"}
            </button>
          </span>
        ) : (
          <span />
        )}

        {/* The transport. Hidden on a live settlement, which has no stages to step through, and
            otherwise always reachable — it used to appear only when the race was settled or
            already paused, so dismissing the spotlight with Escape mid-run left no control on the
            page at all and no way to get the walkthrough back. */}
        {live ? null : settled || paused ? (
          <span className="flex items-center gap-1.5">
            <button onClick={stepPrev} disabled={ph === 0} aria-label="Previous stage" className="btn-ghost rounded-lg px-2 py-1.5 text-xs disabled:opacity-40"><ChevronLeft size={13} /></button>
            <button onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play" : "Pause"} className="btn-ghost rounded-lg px-2 py-1.5 text-xs">{paused ? <Play size={13} /> : <Pause size={13} />}</button>
            <button onClick={stepNext} disabled={ph >= lastIdx} aria-label="Next stage" className="btn-ghost rounded-lg px-2 py-1.5 text-xs disabled:opacity-40"><ChevronRight size={13} /></button>
            {!spot ? (
              <button onClick={reopenSpot} className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs" title="Reopen the stage spotlight (Escape closes it)">
                <Maximize2 size={12} /> Focus stages
              </button>
            ) : null}
            {settled ? (
              <button onClick={replayAll} className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs">
                <RotateCcw size={12} /> Replay settlement
              </button>
            ) : null}
          </span>
        ) : !spot ? (
          <button onClick={reopenSpot} className="btn-ghost inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs" title="Reopen the stage spotlight (Escape closes it)">
            <Maximize2 size={12} /> Focus stages
          </button>
        ) : null}
      </div>

      {/* ── Two compositions, because this page serves two different things ──
          A scripted walkthrough is a NARRATIVE: seven stages, complete in seconds, replayed at
          reading speed with a spotlight. A lane plus a rail of supporting panels is right for it.
          A live settlement is a MONITOR: one value changing over minutes and everything else
          fixed. Given the narrative's layout it produced a lane holding three cards above 2,078px
          of nothing, and a rail where the only element that moves sat 928px down — below the fold
          at 1440x900. A viewer waiting out the attestation had to scroll to find the one thing
          that would tell them the app was not hung, and lost sight of it when they scrolled back.
          Measurements and the rejected alternatives are in analysis/live-settlement-layout.md. */}
      {live ? (
        <div className="flex flex-col gap-5">
          {/* Full width, and that is load-bearing rather than cosmetic. It cannot fall below the
              fold at any viewport, and across the full width its five attestation figures lay out
              as one strip instead of a five-row list — so the panel is SHORTER here than it was in
              the rail as well as more prominent. */}
          <SettlementActivity
            race={race}
            hero
            onStatus={setLiveStatus}
            onChanged={() => void refetch(race.id)}
          />

          {/* Two balanced columns, plain breakpoint grid flow. No sticky: sticky does not pull an
              element up, it only holds one after it has been scrolled past, so it fixes nothing on
              load — and its containing block is its own column, so it unpins where that column
              ends. No nested scroll container either: overflow-y-auto clips the cards' outer glow
              and hijacks touch scrolling. The fix for a page that is too long is to make it
              shorter. */}
          <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-4">
              <ProvenOrder race={race} settled={proven} />
            </div>
            <div className="flex min-w-0 flex-col gap-4">
              <ProofRail race={race} />
              {/* Folded, not removed. Six 66-character hashes are 286px of the most valuable
                  space on the page spent on audit artifacts, and every one stays complete,
                  copyable and one click away. */}
              <OnChainReceipts race={race} folded />
              <Fold title="Collateral & title record" count={race.collateral.symbol}>
                {renderStage("registered")}
              </Fold>
            </div>
          </div>
        </div>
      ) : (
        // The scripted walkthrough's own layout, unchanged.
        //
        // minmax(0, …) rather than bare fr: a grid track's default min-width is `auto`, so the
        // long unbreakable mono strings in the prover pipeline forced their track wider than its
        // share and pushed the page to 2326px at a 1280 viewport — about 1000px of horizontal
        // overflow. `min-w-0` on each column is the same fix from the child side, and both are
        // needed because either alone can be defeated by content.
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.55fr)_minmax(0,1fr)]">
          {/* Left: the lane. One playhead, forward-chronological, driven by LANE. */}
          <div className="flex min-w-0 flex-col gap-3.5">
            {shown.map((st) => (
              // While the spotlight is up the lane shows collapsed rows only — otherwise the same
              // stage is expanded in two places at once and the eye has nowhere to land.
              <StageSection
                key={st.id}
                kicker={st.kicker}
                title={laneTitle(st.id, race)}
                statusLine={stageSummary(st.sid, race)}
                active={st.active && st.id === heroStage?.id && !spot}
                defaultOpen={st.id === heroStage?.id && !spot}
              >
                {renderStage(st.id)}
              </StageSection>
            ))}
          </div>

          {/* Right Sidebar: Visual telemetry & Verification log */}
          <div className="flex min-w-0 flex-col gap-4">
            {/* The per-phase stepper. `PhaseStepper` existed and was imported here but never
                rendered, so the console showed only a compressed horizontal rail — a viewer could
                see WHERE the race was but not the shape of the sequence it moves through, and it
                runs fast enough that the rail alone is easy to miss. Vertical, with the active phase
                highlighted and spinning, is what makes each step legible as it passes. */}
            <Card>
              <Eyebrow>Protocol Phase</Eyebrow>
              <div className="mt-2.5">
                <PhaseStepper status={race.status} />
              </div>
            </Card>

            <Card>
              <Eyebrow>Priority Engine Core</Eyebrow>
              <PriorityCore active={!settled} label={race.status.toUpperCase()} />
            </Card>

            <Card>
              <Eyebrow>Capital Waterfall Flow</Eyebrow>
              <CapitalFlowGraph bids={race.bids} active={!settled} />
            </Card>

            {/* Above the proof pipeline on purpose. The pipeline explains what is still happening;
                this says the answer is already known, which is what a viewer staring at
                PENDING_EVIDENCE for seven minutes actually needs to be told. */}
            {/* Follows the replay playhead. Stepping back to stage 1 kept showing PROVEN, which
                is the one badge on this screen that must never be shown early — the proof does not
                exist at that point in the story being replayed. */}
            {/* Above the rank card and the rail on purpose. Both of those describe the shape of the
                settlement; this one answers "is anything still happening", which is the question a
                viewer has first and the one the page previously could not answer at all. */}
            <ProvenOrder race={race} settled={proven && ph >= proofStageIndex} />
            <ProofRail race={race} />
            <OnChainReceipts race={race} />

            <Card>
              <LogDrawer events={events} />
            </Card>

            {/* Transport controls.
                These call the orchestrator, which runs the SCRIPTED lifecycle against simulated
                adapters — which is why they exist only here. A live settlement is refused by
                `POST /api/races/[id]/advance` with a 409 and gets the activity panel instead. */}
            {!settled ? (
              <Card className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <button
                    onClick={advanceStep}
                    disabled={busy}
                    className="btn-ghost flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    <FastForward size={13} />
                    Step
                  </button>
                  <button
                    onClick={advanceAuto}
                    disabled={busy}
                    className="btn-accent flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold"
                  >
                    <Play size={13} />
                    Auto Run
                  </button>
                </div>
                <span className="mono text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
                  {busy ? "advancing…" : "ready"}
                </span>
              </Card>
            ) : (
              <Card className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs" style={{ color: "var(--success)" }}>
                  <Award size={14} />
                  <span>Priority settlement finalized</span>
                </div>
                <button
                  onClick={() => router.push("/collateral")}
                  className="btn-ghost rounded-lg px-3 py-1 text-xs"
                >
                  Next facility
                </button>
              </Card>
            )}
          </div>
        </div>
      )}

      {/* ── Spotlight: the playhead stage pops center, then docks into the lane ── */}
      <AnimatePresence>
        {spot && heroStage ? (
          <motion.div
            className="fixed inset-0 z-[9995] flex items-end justify-center sm:items-center sm:p-6"
            style={{ background: "rgba(0,0,0,0.55)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div
              className="w-full sm:w-[840px] sm:max-w-[94vw]"
              onMouseEnter={() => setHovering(true)}
              onMouseLeave={() => setHovering(false)}
            >
              {/* mode="wait" so the outgoing card docks before the next pops. Two cards moving at
                  once reads as a glitch rather than a handoff. */}
              <AnimatePresence mode="wait">
                <motion.div
                  key={heroStage.id}
                  // Reduced motion means do not ANIMATE, not do not show. The card still pops and
                  // docks; it simply arrives without the spring and the travel.
                  initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.92, y: 36 }}
                  animate={reduced ? { opacity: 1 } : { opacity: 1, scale: 1, y: 0 }}
                  exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6, x: -320, y: -80 }}
                  transition={reduced ? { duration: 0.12 } : { type: "spring", stiffness: 350, damping: 28 }}
                >
                  {/* Solid, not glass: a translucent panel lets the page bleed through and the
                      mono hashes stop being readable, which is the whole point of the card. */}
                  <div className="relative overflow-hidden rounded-t-2xl border sm:rounded-2xl" style={{ borderColor: "var(--accent)", background: "var(--bg-1)" }}>
                    {/* Dwell bar. It drives the advance, and it pauses while hovered (someone is
                        reading) or paused — so the pacing is visible instead of a mystery. */}
                    <div className="h-0.5 w-full" style={{ background: "var(--track)" }}>
                      {ph < lastIdx || settled ? (
                        <div
                          key={heroStage.id}
                          className="spot-progress"
                          style={{ animationDuration: `${dwellMs}ms`, animationPlayState: paused || hovering ? "paused" : "running" }}
                          onAnimationEnd={dwellEnd}
                        />
                      ) : null}
                    </div>

                    <div className="flex items-center justify-between gap-3 border-b px-5 py-3" style={{ borderColor: "var(--border)" }}>
                      <div className="flex min-w-0 items-center gap-3">
                        {heroStage.active ? (
                          <Loader2 size={16} className="shrink-0 animate-spin" style={{ color: "var(--accent)" }} />
                        ) : (
                          <ShieldCheck size={16} className="shrink-0" style={{ color: "var(--success)" }} />
                        )}
                        <div className="min-w-0">
                          <Eyebrow>{heroStage.kicker}</Eyebrow>
                          <div className="truncate font-[family-name:var(--font-display)] text-base font-semibold">
                            {laneTitle(heroStage.id, race)}
                          </div>
                        </div>
                      </div>
                      <span className="hidden max-w-[36ch] truncate text-xs sm:block" style={{ color: "var(--text-muted)" }}>
                        {stageSummary(heroStage.sid, race)}
                      </span>
                    </div>

                    {/* Orientation: which of the seven this is, and the honest clock. On mobile it
                        only earns its height when the clock has something to say. */}
                    <div className={`border-b px-5 py-2 ${lagging && settled && elapsedS !== null ? "" : "hidden sm:block"}`} style={{ borderColor: "var(--border)" }}>
                      <div className="hidden sm:block">
                        <LifecycleTimeline stages={LANE} status={tlStatus} />
                      </div>
                      {lagging && settled && elapsedS !== null ? (
                        <div className="mt-1 text-center text-[0.62rem]" style={{ color: "var(--text-faint)" }}>
                          settled in {elapsedS.toFixed(1)}s — replaying at reading speed
                        </div>
                      ) : null}
                    </div>

                    <div className="max-h-[52vh] overflow-y-auto p-5">{renderStage(heroStage.id)}</div>

                    {/* Centered on mobile, where the key hints do not exist to balance it. */}
                    <div className="flex items-center justify-center border-t px-4 py-2.5 sm:justify-between" style={{ borderColor: "var(--border)" }}>
                      <span className="mono hidden text-[0.6rem] sm:block" style={{ color: "var(--text-faint)" }}>
                        ← → step · space pause · esc skip
                      </span>
                      <span className="flex items-center gap-1.5">
                        {ph >= lastIdx && !settled ? (
                          <span className="mr-1 flex items-center gap-1.5 text-[0.62rem]" style={{ color: "var(--accent)" }}>
                            <Dot color="var(--accent)" pulse /> live
                          </span>
                        ) : null}
                        <button onClick={stepPrev} disabled={ph === 0} aria-label="Previous stage" className="btn-ghost rounded-lg px-2 py-1.5 text-xs disabled:opacity-40"><ChevronLeft size={13} /></button>
                        <button onClick={() => setPaused((p) => !p)} aria-label={paused ? "Play" : "Pause"} className="btn-ghost rounded-lg px-2 py-1.5 text-xs">{paused ? <Play size={13} /> : <Pause size={13} />}</button>
                        <button onClick={stepNext} disabled={ph >= lastIdx} aria-label="Next stage" className="btn-ghost rounded-lg px-2 py-1.5 text-xs disabled:opacity-40"><ChevronRight size={13} /></button>
                        <button onClick={skipAll} className="btn-ghost inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs"><FastForward size={12} /> {settled ? "Result" : "Live"}</button>
                      </span>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
