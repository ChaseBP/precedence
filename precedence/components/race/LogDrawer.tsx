"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Terminal as TerminalIcon, X, Scale } from "lucide-react";
import type { LifecycleEvent } from "@precedence/sdk/types";
import { Terminal } from "@/components/Terminal";
import { Eyebrow } from "@/components/ui";
import { levelColor } from "@/lib/client/format";
import { LogLine } from "@/components/LogLine";

export function LogDrawer({ events }: { events: LifecycleEvent[] }) {
  const [open, setOpen] = useState(false);
  const latest = events[events.length - 1];

  return (
    <>
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <Eyebrow>Verification log · Live Trace</Eyebrow>
          <span className="mono text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
            {events.length} events
          </span>
        </div>
        <div
          role="status"
          aria-live="polite"
          className="mono text-xs leading-relaxed break-words"
          style={{
            color: !latest
              ? "var(--text-faint)"
              : latest.level === "error" || latest.level === "warn"
                ? levelColor(latest.level)
                : "var(--text)",
            minHeight: 32,
            overflowWrap: "anywhere",
          }}
        >
          {!latest ? (
            "awaiting settlement events…"
          ) : latest.level === "error" || latest.level === "warn" ? (
            latest.message
          ) : (
            <LogLine text={latest.message} />
          )}
        </div>
        <button
          onClick={() => setOpen(true)}
          className="btn-ghost flex items-center justify-center gap-2 rounded-lg px-3 py-1.5 text-xs"
        >
          <Scale size={13} style={{ color: "var(--accent)" }} />
          Inspect verification log ({events.length})
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/55"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="panel-solid fixed inset-y-0 right-0 z-[9996] flex w-full flex-col gap-3 p-4 sm:w-[min(640px,94vw)]"
              style={{ borderColor: "var(--border)" }}
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Scale size={16} color="var(--accent)" />
                  <span className="font-[family-name:var(--font-display)] font-semibold">
                    Verification log
                  </span>
                </div>
                <button
                  onClick={() => setOpen(false)}
                  aria-label="Close"
                  style={{ color: "var(--text-muted)" }}
                >
                  <X size={18} />
                </button>
              </div>
              <div className="min-h-0 flex-1 overflow-hidden">
                <Terminal events={events} />
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
