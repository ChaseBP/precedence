"use client";

/**
 * What a live settlement is doing right now, and what it is waiting for.
 *
 * @remarks The page had no answer to the only question a viewer actually has, which is whether
 * anything is still happening. A live settlement rendered a static `PENDING_EVIDENCE` badge and a
 * measured 6.5–9.3 minute range, both correct and neither of them changing, so a settlement making
 * normal progress and one with nothing left to progress it looked exactly alike. Those two need
 * completely different actions from the person watching.
 *
 * Everything here is read from a chain each poll — the vault's own race state and Attestcoin's
 * attestation frontier — so the progress bar measures real distance, not elapsed wall clock. A bar
 * driven by a timer would be a guess dressed as a measurement, and would keep moving after the
 * thing it depicts had stopped.
 *
 * Two facts this panel exists to make impossible to miss:
 *
 *  - **The deadline does not close a race.** It only makes the vault reject new locks. `closeRace`
 *    is a transaction someone has to send, and until it lands nothing downstream can begin. A
 *    borrower who sets a five-minute window and watches ten minutes pass is looking at a correct
 *    contract and a missing button, which is the worst thing a demo can look like.
 *  - **Filling the facility does not close it either.** There is no quorum and no auto-close.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "motion/react";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Radio,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { useAccount } from "wagmi";
import type { Address, Hex } from "viem";
import type { PriorityRace } from "@/lib/precedence/types";
import { api, type SettlementStatus } from "@/lib/client/api";
import { closeRaceOnVault } from "@/lib/client/vault";
import { usd } from "@/lib/client/format";
import { Badge, Card, Eyebrow } from "@/components/ui";
import { CopyHash } from "@/components/CopyHash";

const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";
/** Attestation advances ten blocks at a time. Measured, not documented. */
const BATCH_BLOCKS = 10;
/** Observed spacing between batches, in seconds. A range, because it is a sawtooth. */
const BATCH_SECONDS = [59, 147] as const;

const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s % 60)).padStart(2, "0")}`;

/**
 * How long the remaining blocks should take, as a range.
 *
 * @remarks A range and never a midpoint. Batches land every 59–147 seconds and a single figure
 * would be wrong in one direction the whole time — and a countdown that runs out while the thing
 * is still going is worse than no countdown at all.
 */
function etaRange(blocksToGo: number): string | null {
  if (blocksToGo <= 0) return null;
  const batches = Math.ceil(blocksToGo / BATCH_BLOCKS);
  const lo = Math.round((batches * BATCH_SECONDS[0]) / 60);
  const hi = Math.round((batches * BATCH_SECONDS[1]) / 60);
  if (hi < 1) return "under a minute";
  return lo === hi ? `about ${hi} min` : `${Math.max(1, lo)}–${hi} min`;
}

export function SettlementActivity({
  race,
  onChanged,
  onStatus,
  hero = false,
}: {
  race: PriorityRace;
  /** Called when a chain read shows the settlement has moved, so the page can refetch. */
  onChanged?: () => void;
  /**
   * Every poll's result, so the rest of the page can agree with this panel.
   *
   * @remarks The header and the stage timeline were reading the STORED phase, which for a live
   * settlement stops at RACE_OPEN and never moves — nothing advances it, by design, because the
   * scripted engine is refused on a live race. So the header announced "Financing window open ·
   * competing financiers locking on Sepolia" directly above this panel reading "Attested · the
   * proof can be submitted". Two contradictory claims about the same settlement, one screen apart,
   * is worse for trust than either of them being merely stale.
   */
  onStatus?: (s: SettlementStatus) => void;
  /**
   * Render full width, above the two columns, rather than as one card in a rail.
   *
   * @remarks Not a cosmetic setting. In a rail this panel is 306px tall and its five attestation
   * metrics stack as a five-row list; across the full width the same five lay out as one strip and
   * the card is *shorter* as well as more prominent. Full width is also the only arrangement that
   * cannot put it below the fold at some viewport, which is the failure it exists to prevent —
   * a viewer who cannot see this panel cannot tell a settlement that is progressing from one that
   * has stopped.
   */
  hero?: boolean;
}) {
  const { address } = useAccount();
  const [s, setS] = useState<SettlementStatus | null>(null);
  const [err, setErr] = useState<string | null>(null);
  /**
   * Wall clock, advanced by an effect once a second.
   *
   * @remarks Held in state rather than read as `Date.now()` where it is used. A clock read during
   * render is an impure call — the same render produces a different tree each time it runs, which
   * React is entitled to do freely — so the countdown has to be driven by a value that changes
   * only between renders. Zero until the first tick, and every consumer falls back to the figure
   * the server sent with the poll.
   */
  const [nowMs, setNowMs] = useState(0);
  const [checkedAt, setCheckedAt] = useState<number>(0);
  const [polling, setPolling] = useState(false);
  const [closing, setClosing] = useState(false);
  const [closeTx, setCloseTx] = useState<Hex | null>(null);
  const [closeErr, setCloseErr] = useState<string | null>(null);
  /** Set when the frontier moves, so a batch landing is visible rather than a silent number swap. */
  const [advanced, setAdvanced] = useState<number | null>(null);
  const [proving, setProving] = useState(false);
  const [proveErr, setProveErr] = useState<string | null>(null);
  /**
   * The gap this panel first saw, so the attestation bar has a fixed origin.
   *
   * @remarks There is no absolute one to use: `targetHeight - attestedHeight` IS `blocksToGo`, so
   * a bar derived from those two is `x - x` and pins at zero forever, which is exactly what it did.
   * The honest denominator is the distance measured when watching began. Held at the largest value
   * seen, so a later poll cannot shrink it and send the bar backwards — and held in state rather
   * than a ref, because the bar has to re-render when it is first established.
   */
  const [originGap, setOriginGap] = useState(0);

  const lastFrontier = useRef<number | null>(null);
  const lastStage = useRef<string | null>(null);

  /**
   * The callbacks, held in refs so `poll` does not depend on their identity.
   *
   * @remarks This is not a micro-optimisation, it is the fix for a request storm. `poll` is a
   * `useCallback`; the interval effect depends on it and calls it once immediately when it runs.
   * With the callbacks in the dependency array, a caller passing an inline arrow —
   * `onChanged={() => refetch(id)}`, which is ordinary React and cannot be forbidden — produced a
   * new `poll` on every render, so the effect tore down and rebuilt the interval and polled again;
   * that poll set state, which re-rendered, which made another arrow. An unbounded loop, and each
   * turn of it costs four chain reads on the server. The one-second clock tick alone guaranteed a
   * poll per second even without it.
   *
   * A polling component has to be immune to how its props are written, so the identity is dropped
   * here rather than pushed onto every caller to remember.
   */
  const onChangedRef = useRef(onChanged);
  const onStatusRef = useRef(onStatus);
  /**
   * Set once the settlement can no longer change, so the interval stops asking.
   *
   * @remarks `PROVEN` is derived from a settlement existing, and a settlement never un-exists.
   * Without this the panel kept polling for the life of the tab: 180 requests an hour, five chain
   * reads each, to redisplay five numbers that were fixed hours earlier. A judge who opens a
   * settled settlement and walks away should cost nothing.
   */
  const doneRef = useRef(false);
  useEffect(() => {
    onChangedRef.current = onChanged;
    onStatusRef.current = onStatus;
  });


  const poll = useCallback(async () => {
    setPolling(true);
    try {
      const r = await api.settlementStatus(race.id);
      if (!r.ok) {
        setErr(r.error ?? "could not read the chains");
        return;
      }
      setErr(null);
      const prev = lastFrontier.current;
      if (prev !== null && r.attestation.attestedHeight > prev) {
        setAdvanced(r.attestation.attestedHeight - prev);
        // Long enough to notice at a glance, short enough not to be there at the next batch.
        setTimeout(() => setAdvanced(null), 6000);
      }
      lastFrontier.current = r.attestation.attestedHeight;
      setOriginGap((g) => Math.max(g, r.attestation.blocksToGo));
      if (lastStage.current !== null && lastStage.current !== r.stage) onChangedRef.current?.();
      lastStage.current = r.stage;
      if (r.stage === "PROVEN") doneRef.current = true;
      setS(r);
      onStatusRef.current?.(r);
      setCheckedAt(performance.timeOrigin + performance.now());
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    } finally {
      setPolling(false);
    }
  }, [race.id]);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void poll();
    });
    // 20s. The frontier advances no faster than once a minute, so a tighter interval would be
    // requests spent to show the same number, and a looser one makes the panel feel dead.
    //
    // Two conditions skip a tick rather than shortening the interval. `doneRef` is permanent: a
    // proven settlement cannot change again. `document.hidden` is not — a backgrounded tab is the
    // normal way to wait out an eight-minute attestation, and polling one nobody is looking at is
    // the purest waste on this page. The `visibilitychange` listener catches up on return, so the
    // panel is current by the time it is seen rather than up to twenty seconds stale.
    const tick = () => {
      if (doneRef.current || document.hidden) return;
      void poll();
    };
    const t = setInterval(tick, 20_000);
    const onVisible = () => {
      if (!document.hidden && !doneRef.current) void poll();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(t);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [poll]);

  useEffect(() => {
    // Deferred like every other first-paint setState in this app: React 19 treats a synchronous
    // one inside an effect as a cascading render.
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setNowMs(Date.now());
    });
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  /**
   * Start the prover.
   *
   * @remarks Returns as soon as the job has started, not when it finishes. Progress arrives on the
   * poll this panel already makes, which is also what eventually flips the stage to PROVEN — so
   * there is nothing to await here and no second source of truth to keep in step.
   */
  async function prove() {
    setProveErr(null);
    setProving(true);
    try {
      const r = await api.proveSettlement(race.id);
      if (!r.ok) setProveErr(r.error ?? "the prover could not be started");
      await poll();
    } catch (e) {
      setProveErr(e instanceof Error ? e.message : String(e));
    } finally {
      setProving(false);
    }
  }

  async function close() {
    if (!race.onchain) return;
    setCloseErr(null);
    setClosing(true);
    try {
      const h = await closeRaceOnVault(
        race.onchain.vaultAddress as Address,
        race.onchain.collateralId as Hex,
      );
      setCloseTx(h);
      await poll();
      onChanged?.();
    } catch (e) {
      setCloseErr(e instanceof Error ? e.message : String(e));
    } finally {
      setClosing(false);
    }
  }

  if (!race.onchain) return null;

  if (err && !s) {
    return (
      <Card>
        <Eyebrow>Settlement activity</Eyebrow>
        <p className="mt-1.5 flex items-start gap-1.5 text-[11.5px]" style={{ color: "var(--warn)" }}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">
            Could not read the chains: {err}. The settlement is unaffected — this panel is a reader.
          </span>
        </p>
      </Card>
    );
  }

  if (!s) {
    return (
      <Card>
        <Eyebrow>Settlement activity</Eyebrow>
        <p className="mt-1.5 flex items-center gap-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={12} className="animate-spin" /> reading the vault and the attestation
          frontier…
        </p>
      </Card>
    );
  }

  // Recomputed locally between polls so the countdown is a clock rather than a number that jumps
  // twenty seconds at a time. Before the first tick, the server's own figure stands in.
  const nowS = nowMs ? Math.floor(nowMs / 1000) : 0;
  const secondsLeft = nowS ? Math.max(0, s.vault.raceDeadline - nowS) : s.vault.secondsLeft;
  const secondsSinceDeadline = nowS ? Math.max(0, nowS - s.vault.raceDeadline) : 0;
  const isObligor = !!address && address.toLowerCase() === s.vault.obligor.toLowerCase();
  const mayClose = s.vault.raceOpen && (isObligor || s.vault.closableByAnyone);
  const a = s.attestation;
  const job = s.prover?.job;
  const secsSinceCheck = checkedAt && nowMs ? Math.max(0, Math.floor((nowMs - checkedAt) / 1000)) : 0;

  const HEAD: Record<SettlementStatus["stage"], { title: string; tone: string }> = {
    WINDOW_OPEN: { title: "Financing window open", tone: "var(--accent)" },
    AWAITING_CLOSE: { title: "Window elapsed · the race is still open on the vault", tone: "var(--warn)" },
    AWAITING_ATTESTATION: { title: "Attestcoin is attesting the source block", tone: "var(--proof-pending)" },
    PROOF_READY: { title: "Attested · the proof can be submitted", tone: "var(--proof-available)" },
    PROVEN: { title: "Verified at 0x0FD2", tone: "var(--proof-verified)" },
  };
  const head = HEAD[s.stage];

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Radio size={14} style={{ color: head.tone }} />
          <Eyebrow>Settlement activity</Eyebrow>
        </div>
        {/* The heartbeat. A viewer needs to know the panel is still asking, not just that it once
            asked — the difference between "waiting" and "hung" is entirely whether anything is
            still checking. */}
        <span className="flex items-center gap-1.5 text-[10px]" style={{ color: "var(--text-faint)" }}>
          <motion.span
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: polling ? "var(--accent)" : "var(--proof-verified)" }}
            animate={polling ? { scale: [1, 1.6, 1], opacity: [1, 0.5, 1] } : { scale: 1, opacity: 1 }}
            transition={polling ? { duration: 0.9, repeat: Infinity } : { duration: 0.2 }}
          />
          {polling ? "reading both chains…" : `checked ${secsSinceCheck}s ago`}
        </span>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <h3
          className={hero ? "text-base font-semibold sm:text-lg" : "text-sm font-semibold"}
          style={{ color: head.tone }}
        >
          {head.title}
        </h3>
        {s.stage === "WINDOW_OPEN" ? (
          <Badge color="var(--accent)">
            <span className="mono">{mmss(secondsLeft)} left</span>
          </Badge>
        ) : null}
        {advanced ? (
          <motion.span
            initial={{ opacity: 0, y: -3 }}
            animate={{ opacity: 1, y: 0 }}
            className="mono rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider"
            style={{
              color: "var(--proof-verified)",
              border: "1px solid color-mix(in srgb, var(--proof-verified) 40%, transparent)",
            }}
          >
            frontier advanced +{advanced}
          </motion.span>
        ) : null}
      </div>

      {/* ── stage bodies ── */}

      {s.stage === "WINDOW_OPEN" ? (
        <>
          <Bar value={s.vault.totalLockedUsd} max={s.vault.facilitySizeUsd} tone="var(--accent)" />
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            {s.vault.lockCount} {s.vault.lockCount === 1 ? "lock" : "locks"} ·{" "}
            {usd(s.vault.totalLockedUsd)} of {usd(s.vault.facilitySizeUsd)} committed. Locks are
            accepted until the deadline; the amount raised does not end the window.
          </p>
          <Note>
            Nothing closes the race by itself. When the deadline passes the vault stops accepting
            locks, but the race stays open until someone sends <span className="mono">closeRace</span>{" "}
            — and no allocation is final and no proof can be built before that.
            {isObligor ? " As the obligor you can close it early." : ""}
          </Note>
        </>
      ) : null}

      {s.stage === "AWAITING_CLOSE" ? (
        <>
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            The deadline passed {mmss(secondsSinceDeadline)} ago and
            the vault is refusing new locks — but the race is still marked open, because closing it
            is a transaction and nobody has sent one. This is the step people expect to be
            automatic. It is not, deliberately: an auto-close would need a trusted timer, and a
            permissionless close means settlement never waits on the borrower staying online.
          </p>
          <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            {s.vault.lockCount} {s.vault.lockCount === 1 ? "lock" : "locks"} ·{" "}
            {usd(s.vault.totalLockedUsd)} committed of {usd(s.vault.facilitySizeUsd)}. A facility
            that filled short still settles — allocation stops at what arrived.
          </p>
        </>
      ) : null}

      {s.stage === "AWAITING_ATTESTATION" ? (
        <>
          <Bar
            value={Math.max(0, originGap - a.blocksToGo)}
            max={Math.max(originGap, 1)}
            tone="var(--proof-pending)"
          />
          <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            <span className="mono">{a.blocksToGo}</span>{" "}
            {a.blocksToGo === 1 ? "block" : "blocks"} to go
            {etaRange(a.blocksToGo) ? ` — ${etaRange(a.blocksToGo)}` : ""}
            {originGap > a.blocksToGo ? `, down from ${originGap} since this page opened` : ""}
            . Attestation advances in ten-block batches, so this moves in steps rather than
            smoothly.
          </p>
          <Grid
            hero={hero}
            rows={[
              ["source block to attest", a.targetHeight.toLocaleString()],
              ["attestation frontier", a.attestedHeight.toLocaleString()],
              ["checkpoint frontier", a.checkpointHeight.toLocaleString()],
              ["Sepolia head", a.sepoliaHead.toLocaleString()],
              ["frontier trails head by", `${a.lagBlocks} blocks`],
            ]}
          />
          <Note>
            Creditcoin is idle throughout — this is Attestcoin&rsquo;s own cadence on chainKey{" "}
            {a.chainKey}, and nothing in this app can shorten it. Measured at 6.5&ndash;9.3 minutes
            end to end.
          </Note>
        </>
      ) : null}

      {s.stage === "PROOF_READY" ? (
        <>
          <p className="mt-2 flex items-start gap-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            <CheckCircle2 size={13} className="mt-0.5 shrink-0" style={{ color: "var(--proof-verified)" }} />
            <span>
              Block <span className="mono">{a.targetHeight.toLocaleString()}</span> is inside the
              attestation frontier, so every input the proof needs now exists. What remains is one
              Creditcoin transaction: build the Merkle and continuity proofs, verify every lock at{" "}
              <span className="mono">0x0FD2</span>, and fix priority in a single block.
            </span>
          </p>

          {job?.state === "running" ? (
            <div className="mt-2.5 rounded-lg border p-2.5" style={{ borderColor: "var(--proof-available)" }}>
              <span className="flex items-center gap-2 text-[11.5px] font-semibold" style={{ color: "var(--proof-available)" }}>
                <Loader2 size={13} className="animate-spin" /> Proving on Creditcoin…
              </span>
              <p className="mono mt-1 break-words text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                {job.stage}
              </p>
            </div>
          ) : (
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <button
                onClick={prove}
                disabled={proving || !s.prover?.available}
                className="btn-primary inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold disabled:opacity-50"
              >
                {proving ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                {proving ? "Starting…" : "Submit the proof"}
              </button>
              <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
                {s.prover?.available
                  ? "Runs the prover and pays the Creditcoin fee. Anyone may prove a race — this is a convenience, not a permission."
                  : (s.prover?.unavailableReason ?? "This deployment cannot run the prover.")}
              </span>
            </div>
          )}

          {/* The fresher message wins. A pre-flight refusal explains the same failure better than
              the prover's own revert does — showing both stacked two error blocks saying
              overlapping things, and the older one is the less useful of the two. */}
          {job?.state === "failed" && !proveErr ? (
            <div className="mt-2 rounded-lg border p-2.5" style={{ borderColor: "var(--danger)" }}>
              <span className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--danger)" }}>
                <AlertTriangle size={12} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">The prover failed: {job.error}</span>
              </span>
              {job.log.length ? (
                <pre
                  className="mono mt-1.5 max-h-24 overflow-auto whitespace-pre-wrap break-words text-[10px]"
                  style={{ color: "var(--text-faint)" }}
                >
                  {job.log.join("\n")}
                </pre>
              ) : null}
            </div>
          ) : null}

          {proveErr ? (
            <p className="mt-2 flex items-start gap-1.5 text-[11px]" style={{ color: "var(--danger)" }}>
              <AlertTriangle size={12} className="mt-0.5 shrink-0" />
              <span className="min-w-0 break-words">{proveErr}</span>
            </p>
          ) : null}

          {/* The command stays, demoted. It is not an instruction to the reader — it is the
              evidence that proving is permissionless, which the button alone would obscure. */}
          <details className="mt-2.5 group">
            <summary className="cursor-pointer list-none text-[10.5px] [&::-webkit-details-marker]:hidden" style={{ color: "var(--text-faint)" }}>
              <span className="underline decoration-dotted underline-offset-4">
                or prove it yourself from a terminal
              </span>
            </summary>
            <div className="mt-1.5 rounded-lg border p-2.5" style={{ borderColor: "var(--border)" }}>
              <CopyHash value={s.proverCommand} />
            </div>
          </details>

          <Note>
            Prove promptly. Verification cost grows with proof age because continuity hashes
            accumulate — about 10× more after a day than after ten minutes.
          </Note>
        </>
      ) : null}

      {s.stage === "PROVEN" ? (
        <p className="mt-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          Every lock in this race was verified in one Creditcoin transaction at{" "}
          <span className="mono">0x0FD2</span>, and the ranking above is proven rather than
          observed.
        </p>
      ) : null}

      {/* ── the one action this panel offers ── */}
      {mayClose ? (
        <div className="mt-3 flex flex-wrap items-center gap-3 border-t pt-3" style={{ borderColor: "var(--border)" }}>
          <button
            onClick={close}
            disabled={closing}
            className="btn-primary inline-flex items-center gap-2 rounded-lg px-3.5 py-2 text-xs font-semibold disabled:opacity-50"
          >
            {closing ? <Loader2 size={13} className="animate-spin" /> : <Timer size={13} />}
            {closing ? "Closing…" : "Close the race"}
          </button>
          <span className="text-[11px]" style={{ color: "var(--text-faint)" }}>
            {s.vault.closableByAnyone
              ? "Permissionless now that the deadline has passed — anyone can send this."
              : "Obligor only, until the deadline passes."}
          </span>
        </div>
      ) : null}

      {closeTx ? (
        <a
          href={`${SEPOLIA_EXPLORER}/tx/${closeTx}`}
          target="_blank"
          rel="noreferrer"
          className="mono mt-2 inline-flex items-start gap-1 break-all text-[10.5px] underline decoration-dotted underline-offset-4"
          style={{ color: "var(--accent)" }}
        >
          closeRace · {closeTx}
          <ExternalLink size={9} className="mt-0.5 shrink-0" />
        </a>
      ) : null}

      {closeErr ? (
        <p className="mt-2 flex items-start gap-1.5 text-[11px]" style={{ color: "var(--danger)" }}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{closeErr}</span>
        </p>
      ) : null}

      {err ? (
        <p className="mt-2 text-[10.5px]" style={{ color: "var(--warn)" }}>
          last read failed ({err}) — retrying
        </p>
      ) : null}
    </Card>
  );
}

/** A bar that measures a real distance. Never a timer. */
function Bar({ value, max, tone }: { value: number; max: number; tone: string }) {
  const pctFilled = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div
      className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
      style={{ background: "var(--bg-2)" }}
      role="progressbar"
      aria-valuenow={Math.round(pctFilled)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <motion.div
        className="h-full rounded-full"
        style={{ background: tone }}
        initial={false}
        animate={{ width: `${pctFilled}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 24 }}
      />
    </div>
  );
}

/**
 * The attestation figures.
 *
 * @remarks Two shapes for the same data. In a rail there is no horizontal room, so it is a
 * label-and-value list. Across the full width the five become tiles on one line, which reads as
 * instrumentation rather than as a table and costs a third of the height.
 */
function Grid({ rows, hero }: { rows: [string, string][]; hero: boolean }) {
  if (hero) {
    return (
      <dl className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
        {rows.map(([k, v]) => (
          <div
            key={k}
            className="min-w-0 rounded-lg px-2.5 py-2"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            <dt className="text-[10.5px] leading-tight" style={{ color: "var(--text-faint)" }}>
              {k}
            </dt>
            <dd className="mono mt-0.5 truncate text-[13px] font-semibold" title={v}>
              {v}
            </dd>
          </div>
        ))}
      </dl>
    );
  }
  return (
    <dl className="mt-2.5 grid grid-cols-[1fr_auto] gap-x-3 gap-y-1 text-[11px]">
      {rows.map(([k, v]) => (
        <div key={k} className="contents">
          <dt style={{ color: "var(--text-faint)" }}>{k}</dt>
          <dd className="mono text-right">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2.5 text-[10.5px] leading-snug" style={{ color: "var(--text-faint)" }}>
      {children}
    </p>
  );
}
