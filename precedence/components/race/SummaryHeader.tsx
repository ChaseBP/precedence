"use client";

import { motion } from "motion/react";
import { Badge, Eyebrow } from "@/components/ui";
import { usd, pct } from "@/lib/client/format";
import type { LifecyclePhase, PriorityRace } from "@precedence/sdk/types";
import type { SettlementStatus } from "@/lib/client/api";
import { PHASE_LABELS } from "@/lib/precedence/orchestrator/lifecycle";

export function SummaryHeader({
  race,
  statusLine,
  proven = true,
  chainStatus = null,
  phase,
}: {
  race?: PriorityRace;
  statusLine: string;
  /**
   * The chain's own view of a live settlement, when there is one.
   *
   * @remarks The KPIs below were computed from `bids`, which a live race never has — capital
   * arrives as `locks`. So "Capital Committed" fell through to the facility SIZE and reported
   * $10,000 committed when $6,000 was locked, and "Financiers" showed an em dash beside a funded
   * position. Both figures come from the vault when it can be asked.
   */
  chainStatus?: SettlementStatus | null;
  /**
   * The phase to label, when it is not the one stored on the race.
   *
   * @remarks A live settlement's stored phase stops at RACE_OPEN forever, so the badge read "Race
   * Open" beside a stage strip already showing stage 4 and a panel saying the block was attested.
   * The page derives the effective phase from the chain and hands it down, so one value labels the
   * badge, the strip and the status line.
   */
  phase?: LifecyclePhase;
  /**
   * Does the on-chain proof exist yet?
   *
   * @remarks `PRIORITY_SETTLED` is the phase reached when the ordering is determined, which is
   * minutes before the attestation that proves it. Labelling that window "Priority Settled" put
   * the boldest claim on the screen next to a proof rail still reading PENDING_EVIDENCE.
   */
  proven?: boolean;
}) {
  const currentRace = race;
  if (!currentRace) return null;

  // Set only after the server fetched a receipt for the opening transaction. See `live-race.ts`.
  const live = !!currentRace.onchain;
  /**
   * A scripted race names its financiers ("meridian"); a live one can only name a wallet.
   *
   * @remarks This KPI was sized for a one-word agent id, so a settled live race put 42 characters
   * of address through it and overran the next column. Shortened for the tile, full on hover and
   * in the rank card below — which is where a hash actually gets cross-checked.
   */
  const isAddress = (v: string) => /^0x[0-9a-fA-F]{40}$/.test(v);

  // The vault first, then the race's own locks, then bids. The last fallback exists only for a
  // scripted walkthrough, where bids are the whole story and no vault has been asked.
  const totalLocked =
    chainStatus?.vault.totalLockedUsd ??
    (currentRace.locks.length
      ? currentRace.locks.reduce((s, l) => s + (l.refunded ? 0 : l.amountUsd), 0)
      : currentRace.bids.reduce((s, b) => s + b.committedUsd, 0) || currentRace.requestedTotalUsd);
  // Distinct wallets, not lock count: one lender placing two locks is one financier.
  const financierCount = currentRace.locks.length
    ? new Set(currentRace.locks.map((l) => l.financierAddress.toLowerCase())).size
    : currentRace.bids.length;
  const committedLabel =
    chainStatus || currentRace.locks.length ? "Capital Locked" : "Capital Committed";
  // A name with a zero amount is not a senior holder. The refinance step could set the name
  // while no senior position existed, and reading the name alone put a financier who had DECLINED
  // to bid under a "SENIOR CLAIM" heading.
  const senior =
    currentRace.settlement?.seniorFinancier && (currentRace.settlement.seniorAmountUsd ?? 0) > 0
      ? currentRace.settlement.seniorFinancier
      : null;
  const shownPhase = phase ?? currentRace.status;
  const stage = shownPhase === "PRIORITY_SETTLED" && !proven ? "Attesting" : PHASE_LABELS[shownPhase];

  // Distress and default read as danger; a clean close reads as success.
  const stageColor =
    shownPhase === "SETTLED_CLOSED"
      ? "var(--success)"
      : shownPhase === "ABORTED" ||
          shownPhase === "TERMINATED_DEFAULT" ||
          shownPhase === "BREACHED"
        ? "var(--danger)"
        : currentRace.track === "DISTRESSED"
          ? "var(--warn)"
          : "var(--accent)";

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: "var(--text-faint)" }}>
        <span className="mono">Priority settlement</span>
        <span>/</span>
        <span className="mono" style={{ color: "var(--text-muted)" }}>
          {currentRace.collateral.symbol}
        </span>
        <span>/</span>
        <span className="mono">{currentRace.id}</span>
        {/* Provenance in the breadcrumb, where it is read before anything below it. A viewer
            asking "is this real" was previously answered only by scattered `sample` markers deep
            in the proof rail, which is the wrong place and the wrong tone: the answer belongs at
            the top, and when it is yes it should say so. */}
        {live ? (
          <>
            <span>/</span>
            <span
              className="mono rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider"
              style={{
                color: "var(--proof-verified)",
                border: "1px solid color-mix(in srgb, var(--proof-verified) 40%, transparent)",
              }}
              title={`Race ${currentRace.onchain?.raceNonce} on the vault at ${currentRace.onchain?.vaultAddress}`}
            >
              live on sepolia
            </span>
          </>
        ) : (
          <>
            <span>/</span>
            <span
              className="mono rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider"
              style={{
                color: "var(--warn)",
                border: "1px solid color-mix(in srgb, var(--warn) 35%, transparent)",
              }}
              title="A scripted walkthrough of the protocol. Its hashes are simulated, so they do not open on a block explorer."
            >
              scripted walkthrough
            </span>
          </>
        )}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <h1 className="font-[family-name:var(--font-display)] text-xl font-bold tracking-tight">
            {currentRace.collateral.title} <span style={{ color: "var(--text-muted)" }}>· {pct(currentRace.collateral.targetRatePct)} Target</span>
          </h1>
          <Badge color={stageColor}>{stage}</Badge>
        </div>
        <motion.span
          key={statusLine}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-sm"
          style={{ color: "var(--text-muted)" }}
        >
          {statusLine}
        </motion.span>
      </div>
      <div className="mt-4 grid grid-cols-[repeat(2,minmax(0,1fr))] gap-3 sm:grid-cols-[repeat(4,minmax(0,1fr))]">
        <KPI
          label={committedLabel}
          value={usd(totalLocked)}
          hint={chainStatus ? `of ${usd(chainStatus.vault.facilitySizeUsd)} facility` : undefined}
        />
        <KPI label="Financiers" value={financierCount ? String(financierCount) : "—"} />
        <KPI
          label="Senior Claim"
          value={
            senior
              ? isAddress(senior)
                ? `${senior.slice(0, 6)}…${senior.slice(-4)}`
                : senior.toUpperCase()
              : currentRace.settlement
                ? "Unfilled"
                : "Pending Proof"
          }
          // The full value, since the shortened one is not something a judge can cross-check.
          title={senior && isAddress(senior) ? senior : undefined}
          // "Unfilled" beside a funded facility reads as a failure. It is an outcome: nobody
          // locked into the senior tranche, so the facility filled from the ones beneath it.
          hint={
            !senior && currentRace.settlement
              ? "No lock landed in the senior tranche. The facility filled from junior and subordinate capital."
              : undefined
          }
          accent={!!senior}
          color={senior ? "var(--rank-senior)" : undefined}
        />
        <KPI label="Safety Margin" value={pct(currentRace.collateral.haircutPct, 0)} />
      </div>
    </div>
  );
}

function KPI({
  label,
  value,
  accent,
  color,
  hint,
  title,
}: {
  label: string;
  value: string;
  /** Native tooltip carrying the untruncated value. Supplementary only, never the sole carrier. */
  title?: string;
  accent?: boolean;
  color?: string;
  /**
   * One line under the figure, for a value that reads worse than it is.
   *
   * @remarks Rendered, not a `title`. A tooltip is invisible in a screenshot, unreachable by
   * keyboard and absent on touch, so it cannot carry an explanation a reader needs in order not to
   * misread the number above it.
   */
  hint?: string;
}) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div
        className={`num mt-0.5 truncate text-lg font-semibold ${accent && !color ? "text-gradient" : ""}`}
        style={color ? { color } : undefined}
        title={title}
      >
        {value}
      </div>
      {hint ? (
        <div className="mt-0.5 max-w-[24ch] text-[10.5px] leading-snug" style={{ color: "var(--text-faint)" }}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
