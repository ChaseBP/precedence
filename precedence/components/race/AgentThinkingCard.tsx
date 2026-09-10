"use client";

import { AnimatePresence, motion } from "motion/react";
import { Loader2, ShieldCheck, TrendingUp, AlertTriangle } from "lucide-react";
import { AgentGlyph, Badge } from "@/components/ui";
import type { AgentDecision, DecisionVerb } from "@precedence/sdk/types";
import { trancheColor } from "@/lib/client/format";

const VERB_ICON: Record<string, typeof ShieldCheck> = {
  "bid-senior": ShieldCheck,
  "bid-junior": TrendingUp,
  "bid-subordinate": AlertTriangle,
  "join-smaller": TrendingUp,
  decline: AlertTriangle,
};

export function AgentThinkingCard({
  name,
  decision,
  thinking,
}: {
  name: string;
  decision?: AgentDecision;
  thinking: boolean;
}) {
  const tranche = decision?.tranche ?? (name.toLowerCase() === "meridian" ? "SENIOR" : name.toLowerCase() === "vector" ? "JUNIOR" : "SUBORDINATE");
  const color = decision?.verb === "decline" ? "var(--danger)" : trancheColor(tranche);
  const Icon = decision ? VERB_ICON[decision.verb] ?? ShieldCheck : ShieldCheck;

  return (
    <motion.div layout className="glass rounded-xl p-3.5" style={{ borderLeft: `3px solid ${color}` }}>
      <div className="flex items-start gap-2.5">
        <AgentGlyph name={name} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="shrink-0 text-sm font-semibold capitalize">{name}</span>
            {decision ? (
              <span className="min-w-0">
                <Badge color={color}>
                  {decision.verb.toUpperCase()} {decision.amountUsd > 0 ? `$${decision.amountUsd.toLocaleString()}` : ""}
                </Badge>
              </span>
            ) : thinking ? (
              <Loader2 size={14} className="shrink-0 animate-spin" color="var(--accent)" />
            ) : null}
          </div>
          <div className="eyebrow mt-0.5 flex flex-wrap items-center gap-1">
            {decision ? (
              <>
                <Icon size={10} style={{ color }} />
                <span>{tranche} Mandate · {decision.source === "agent_runtime" ? "AI Agent" : "Policy Engine"}</span>
              </>
            ) : thinking ? (
              "evaluating risk & tranche…"
            ) : (
              "awaiting race broadcast"
            )}
          </div>
        </div>
      </div>
      <AnimatePresence>
        {decision && (
          <motion.p
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="mt-2.5 overflow-hidden text-xs leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            {decision.reasoning}
          </motion.p>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
