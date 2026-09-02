"use client";

import { Check, Loader2 } from "lucide-react";
import type { LifecyclePhase } from "@/lib/precedence/types";
import {
  DISTRESSED_SEQUENCE,
  isTerminal,
  PERFORMING_SEQUENCE,
  PHASE_LABELS,
  trackOf,
} from "@/lib/precedence/orchestrator/lifecycle";

export function PhaseStepper({ status }: { status: LifecyclePhase }) {
  // Show whichever track the race is actually on — a distressed facility should not be rendered
  // against the performing sequence it has already left.
  const distressed = trackOf(status) === "DISTRESSED";
  const steps = distressed ? DISTRESSED_SEQUENCE : PERFORMING_SEQUENCE;
  const aborted = status === "ABORTED";
  const idx = steps.indexOf(status);
  const currentIdx = idx >= 0 ? idx : isTerminal(status) ? steps.length : -1;

  return (
    <div className="flex flex-col gap-1">
      {steps.map((p, i) => {
        const done = i < currentIdx;
        const active = i === currentIdx && !aborted && !isTerminal(status);
        return (
          <div
            key={p}
            className="flex items-center gap-3 rounded-lg px-2 py-1.5"
            style={{ background: active ? "var(--grad-soft)" : "transparent" }}
          >
            <span
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.68rem]"
              style={{
                background: done ? "var(--success)" : active ? "var(--accent)" : "var(--track)",
                color: done || active ? "var(--bg-0)" : "var(--text-faint)",
                border: "1px solid var(--border)",
              }}
            >
              {done ? <Check size={12} /> : active ? <Loader2 size={12} className="animate-spin" /> : i + 1}
            </span>
            <span
              className="text-sm whitespace-nowrap"
              style={{
                color: done ? "var(--text-muted)" : active ? "var(--text)" : "var(--text-faint)",
                fontWeight: active ? 600 : 400,
              }}
            >
              {PHASE_LABELS[p]}
            </span>
          </div>
        );
      })}
      {aborted ? (
        <div
          className="mt-1 rounded-lg px-2 py-1.5 text-sm"
          style={{ background: "color-mix(in srgb, var(--danger) 14%, transparent)", color: "var(--danger)" }}
        >
          ✗ {PHASE_LABELS.ABORTED}
        </div>
      ) : null}
    </div>
  );
}
