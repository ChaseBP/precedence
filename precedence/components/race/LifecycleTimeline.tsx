"use client";

import { Check } from "lucide-react";
import type { LifecyclePhase } from "@/lib/precedence/types";
import { isTerminal } from "@/lib/precedence/orchestrator/lifecycle";

export interface LifecycleStage {
  id: string;
  title: string;
  phases: LifecyclePhase[];
}

export function LifecycleTimeline({
  stages,
  status,
}: {
  stages: LifecycleStage[];
  status: LifecyclePhase;
}) {
  const aborted = status === "ABORTED";
  const done = status === "SETTLED_CLOSED" || status === "TERMINATED_DEFAULT";
  const found = stages.findIndex((s) => s.phases.includes(status));
  const activeIdx = found >= 0 ? found : isTerminal(status) ? stages.length : -1;

  return (
    <div className="flex items-stretch gap-1.5 overflow-x-auto pb-1">
      {stages.map((s, i) => {
        const isDone = done || (activeIdx >= 0 && i < activeIdx);
        const isActive = !done && !aborted && i === activeIdx;
        const color = isActive ? "var(--accent)" : isDone ? "var(--success)" : "var(--border-strong)";

        return (
          <div key={s.id} className="flex min-w-[64px] flex-1 flex-col gap-1.5" title={`${i + 1}. ${s.title}`}>
            <div
              className="h-1 rounded-full transition-all duration-300"
              style={{
                background: color,
                opacity: isDone || isActive ? 1 : 0.45,
                boxShadow: isActive ? "0 0 8px var(--accent-glow)" : undefined,
              }}
            />
            <div
              className="flex items-center gap-1 truncate text-[0.68rem]"
              style={{
                color: isActive ? "var(--text)" : isDone ? "var(--text-muted)" : "var(--text-faint)",
                fontWeight: isActive ? 600 : 400,
              }}
            >
              {isDone ? (
                <Check size={9} className="shrink-0" style={{ color: "var(--success)" }} />
              ) : (
                <span className="mono shrink-0">{i + 1}</span>
              )}
              <span className="truncate">{s.title}</span>
            </div>
          </div>
        );
      })}
    </div>
  );
}
