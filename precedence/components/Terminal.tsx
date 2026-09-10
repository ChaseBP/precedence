"use client";

import { useEffect, useRef } from "react";
import { motion } from "motion/react";
import type { LifecycleEvent } from "@precedence/sdk/types";
import { levelColor, timeOf } from "@/lib/client/format";
import { LogLine } from "@/components/LogLine";

/** Forensic live log of hashes, blocks, and state transitions (Verification log). */
export function Terminal({ events }: { events: LifecycleEvent[] }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [events.length]);

  return (
    <div className="glass-heavy relative overflow-hidden rounded-2xl">
      <div className="flex items-center gap-2 border-b px-4 py-2.5" style={{ borderColor: "var(--border)" }}>
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--danger)" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--warn)" }} />
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: "var(--success)" }} />
        <span className="mono ml-2 text-xs" style={{ color: "var(--text-faint)" }}>
          precedence-orchestrator · attestcoin-0x0FD2 · cc3-settlement
        </span>
      </div>
      {events.length > 0 ? <span className="scan-line" /> : null}
      <div
        ref={ref}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        className="mono max-h-[420px] min-h-[260px] overflow-y-auto px-4 py-3 text-[0.72rem] leading-relaxed"
      >
        {events.length === 0 ? (
          <div style={{ color: "var(--text-faint)" }}>$ awaiting settlement…</div>
        ) : (
          events.map((e) => (
            <motion.div
              key={e.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="flex gap-2 py-0.5"
            >
              <span style={{ color: "var(--text-faint)" }}>{timeOf(e.at)}</span>
              <span style={{ color: levelColor(e.level) }}>
                {e.level === "success" ? "✓" : e.level === "warn" ? "▲" : e.level === "error" ? "✗" : "›"}
              </span>
              <span
                style={{ color: e.level === "error" ? "var(--danger)" : e.level === "warn" ? "var(--warn)" : "var(--text)" }}
                className="break-words"
              >
                {e.level === "error" || e.level === "warn" ? e.message : <LogLine text={e.message} />}
              </span>
            </motion.div>
          ))
        )}
      </div>
    </div>
  );
}
