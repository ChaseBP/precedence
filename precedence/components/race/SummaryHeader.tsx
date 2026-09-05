"use client";

import { motion } from "motion/react";
import { Badge, Eyebrow } from "@/components/ui";
import { usd, pct } from "@/lib/client/format";
import type { PriorityRace } from "@/lib/precedence/types";
import { PHASE_LABELS } from "@/lib/precedence/orchestrator/lifecycle";

export function SummaryHeader({
  race,
  statusLine,
  proven = true,
}: {
  race?: PriorityRace;
  statusLine: string;
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

  const totalLocked =
    currentRace.bids.reduce((s, b) => s + b.committedUsd, 0) || currentRace.requestedTotalUsd;
  // A name with a zero amount is not a senior holder. The refinance step could set the name
  // while no senior position existed, and reading the name alone put a financier who had DECLINED
  // to bid under a "SENIOR CLAIM" heading.
  const senior =
    currentRace.settlement?.seniorFinancier && (currentRace.settlement.seniorAmountUsd ?? 0) > 0
      ? currentRace.settlement.seniorFinancier
      : null;
  const stage =
    currentRace.status === "PRIORITY_SETTLED" && !proven
      ? "Attesting"
      : PHASE_LABELS[currentRace.status];

  // Distress and default read as danger; a clean close reads as success.
  const stageColor =
    currentRace.status === "SETTLED_CLOSED"
      ? "var(--success)"
      : currentRace.status === "ABORTED" ||
          currentRace.status === "TERMINATED_DEFAULT" ||
          currentRace.status === "BREACHED"
        ? "var(--danger)"
        : currentRace.track === "DISTRESSED"
          ? "var(--warn)"
          : "var(--accent)";

  return (
    <div className="glass rounded-2xl p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs" style={{ color: "var(--text-faint)" }}>
        <span className="mono">Priority Race</span>
        <span>/</span>
        <span className="mono" style={{ color: "var(--text-muted)" }}>
          {currentRace.collateral.symbol}
        </span>
        <span>/</span>
        <span className="mono">{currentRace.id}</span>
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
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <KPI label="Capital Committed" value={usd(totalLocked)} />
        <KPI label="Financiers" value={currentRace.bids.length ? String(currentRace.bids.length) : "—"} />
        <KPI
          label="Senior Claim"
          value={senior ? senior.toUpperCase() : currentRace.settlement ? "Unfilled" : "Pending Proof"}
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
}: {
  label: string;
  value: string;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div>
      <Eyebrow>{label}</Eyebrow>
      <div
        className={`num mt-0.5 text-lg font-semibold ${accent && !color ? "text-gradient" : ""}`}
        style={color ? { color } : undefined}
      >
        {value}
      </div>
    </div>
  );
}
