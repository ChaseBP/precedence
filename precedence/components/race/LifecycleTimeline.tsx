"use client";

import { Check } from "lucide-react";
import type { LifecyclePhase } from "@/lib/precedence/types";
import { isTerminal } from "@/lib/precedence/orchestrator/lifecycle";

export interface LifecycleStage {
  id: string;
  title: string;
  /** Short rail label, e.g. "PROOF". The full `title` becomes the tooltip. */
  kicker?: string;
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

  const position = activeIdx >= 0 && activeIdx < stages.length ? activeIdx + 1 : done ? stages.length : null;

  return (
    <div>
      {position ? (
        <div className="eyebrow mb-1.5">
          Stage {position} of {stages.length} · {stages[Math.min(position - 1, stages.length - 1)].title}
        </div>
      ) : null}
      {/* Labels used to `truncate` inside this `overflow-x-auto` rail, so five of seven stages
          read a truncated stage title instead of the rail simply scrolling — the exact
          pattern the project's own rules forbid. The short `kicker` fits without truncation, the
          full title is the tooltip, and the line above carries the position. */}
      <div className="no-scrollbar flex items-stretch gap-1.5 overflow-x-auto pb-1">
      {stages.map((s, i) => {
        const isDone = done || (activeIdx >= 0 && i < activeIdx);
        const isActive = !done && !aborted && i === activeIdx;
        const color = isActive ? "var(--accent)" : isDone ? "var(--success)" : "var(--border-strong)";

        return (
          <div
            key={s.id}
            className="flex min-w-[5.5rem] flex-1 flex-col gap-1.5"
            title={`${i + 1}. ${s.title}`}
          >
            <div
              className="h-1 rounded-full transition-all duration-300"
              style={{
                background: color,
                opacity: isDone || isActive ? 1 : 0.45,
                boxShadow: isActive ? "0 0 8px var(--accent-glow)" : undefined,
              }}
            />
            <div
              className="flex items-center gap-1 whitespace-nowrap text-[0.68rem]"
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
              <span>{s.kicker ?? s.title}</span>
            </div>
          </div>
        );
      })}
      </div>
    </div>
  );
}
