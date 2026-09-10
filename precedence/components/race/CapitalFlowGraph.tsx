"use client";

import { motion } from "motion/react";
import type { FinancierBid, Tranche } from "@precedence/sdk/types";
import { trancheColor } from "@/lib/client/format";

/** Competing bidders. Rivals racing for a tranche, so there is no initiator. */
interface Bidder {
  agentId: string;
  committedUsd: number;
  tranche?: Tranche;
}

/**
 * Senior / Junior / Subordinate Priority Waterfall Graph.
 *
 * Uses the semantic ordinal ramp tokens:
 *  - Senior: var(--rank-senior) (#E2E8F0)
 *  - Junior: var(--rank-junior) (#94A3B8)
 *  - Subordinate: var(--rank-subordinate) (#5E6E87)
 */
export function CapitalFlowGraph({
  bids,
  active,
}: {
  bids: Bidder[] | FinancierBid[];
  active: boolean;
}) {
  const members = bids;
  const W = 380,
    H = 210,
    cx = W / 2,
    cy = H / 2 + 10;

  // Derive tranches.
  //
  // No positional fallback. `?? members[0]` used to fill an empty SENIOR slot with whoever
  // happened to be first, so a JUNIOR bidder appeared in BOTH the senior and junior nodes of the
  // waterfall — the diagram showed one financier holding two ranks it did not hold. A tranche
  // nobody took is a real outcome and the diagram should say so.
  const holderOf = (t: Tranche) =>
    members.find((m) => ("tranche" in m ? m.tranche === t : false));
  const senior = holderOf("SENIOR");
  const junior = holderOf("JUNIOR");
  const subordinate = holderOf("SUBORDINATE");

  const tiers = [
    { label: "SENIOR · 1st", member: senior, color: "var(--rank-senior)", x: 70, y: 50, rank: 1 },
    { label: "JUNIOR · 2nd", member: junior, color: "var(--rank-junior)", x: 190, y: 40, rank: 2 },
    { label: "SUB · 3rd", member: subordinate, color: "var(--rank-subordinate)", x: 310, y: 50, rank: 3 },
  ];

  return (
    <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: "block" }}>
      {/* Waterfall connectors */}
      {tiers.map((t, idx) => {
        // An unfilled tranche is drawn dimmed rather than omitted. Omitting it left a gap that
        // read as a rendering failure, when "nobody took this rank" is a real settlement outcome.
        if (!t.member) {
          return (
            <g key={t.rank} opacity={0.4}>
              <rect
                x={t.x - 54}
                y={t.y - 18}
                width={108}
                height={38}
                rx={8}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
              <text x={t.x} y={t.y - 4} textAnchor="middle" fontSize="9" fill="var(--text-faint)"
                fontFamily="var(--font-mono)" fontWeight="bold">
                {t.label}
              </text>
              <text x={t.x} y={t.y + 8} textAnchor="middle" fontSize="9" fill="var(--text-faint)"
                fontFamily="var(--font-mono)">
                unfilled
              </text>
            </g>
          );
        }
        return (
          <g key={t.rank}>
            <path
              d={`M ${t.x} ${t.y + 24} Q ${t.x} ${cy - 10}, ${cx} ${cy - 16}`}
              stroke={t.color}
              strokeWidth={t.rank === 1 ? 2.5 : t.rank === 2 ? 1.8 : 1.2}
              strokeDasharray={active ? undefined : "3 3"}
              fill="none"
              opacity={0.7}
            />
            {active && (
              <motion.circle
                r={t.rank === 1 ? 3.5 : 2.5}
                fill={t.color}
                initial={{ cx: t.x, cy: t.y + 24, opacity: 0 }}
                animate={{ cx, cy: cy - 16, opacity: [0, 1, 0] }}
                transition={{ duration: 1.6, delay: idx * 0.35, repeat: Infinity, ease: "easeInOut" }}
              />
            )}

            {/* Financier Node */}
            <rect
              x={t.x - 54}
              y={t.y - 18}
              width={108}
              height={38}
              rx={8}
              fill="var(--panel-heavy)"
              stroke={t.color}
              strokeWidth={t.rank === 1 ? 1.8 : 1.2}
            />
            <text
              x={t.x}
              y={t.y - 4}
              textAnchor="middle"
              fontSize="10"
              fill={t.color}
              fontFamily="var(--font-mono)"
              fontWeight="bold"
            >
              {t.label}
            </text>
            <text
              x={t.x}
              y={t.y + 8}
              textAnchor="middle"
              fontSize="11"
              fill="var(--text)"
              fontFamily="var(--font-mono)"
              className="capitalize"
            >
              {t.member.agentId} · ${t.member.committedUsd.toLocaleString()}
            </text>
          </g>
        );
      })}

      {/* Central Collateral / Facility Hub */}
      <circle cx={cx} cy={cy} r={28} fill="var(--panel-heavy)" stroke="var(--accent)" strokeWidth={2} />
      {active && (
        <motion.circle
          cx={cx}
          cy={cy}
          r={28}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={1}
          initial={{ scale: 1, opacity: 0.8 }}
          animate={{ scale: 1.4, opacity: 0 }}
          transition={{ duration: 1.8, repeat: Infinity, ease: "easeOut" }}
        />
      )}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill="var(--accent)" fontFamily="var(--font-mono)" fontWeight="bold">
        PRIORITY
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="9.5" fill="var(--text)" fontFamily="var(--font-mono)">
        VAULT
      </text>

      {/* Seniority Legend note */}
      <text x={cx} y={H - 6} textAnchor="middle" fontSize="9" fill="var(--text-faint)" fontFamily="var(--font-mono)">
        Waterfall: Senior paid 100% first → Junior → Subordinate
      </text>
    </svg>
  );
}
