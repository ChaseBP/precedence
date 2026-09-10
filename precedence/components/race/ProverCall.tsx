"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, Check, X, Terminal, Cpu } from "lucide-react";
import type { ProverCallRecord, SkillCallRecord } from "@precedence/sdk/types";
import { shortenPrecompiles } from "@/lib/client/format";
import { Badge } from "@/components/ui";
import { CopyHash } from "@/components/CopyHash";

export function ProverCall({
  call,
  dense = false,
}: {
  call: ProverCallRecord | SkillCallRecord;
  dense?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(call.detail ?? {});

  const kindColor =
    call.kind === "verify"
      ? "var(--proof-verified)"
      : call.kind === "proof"
        ? "var(--proof-available)"
        : call.kind === "settle"
          ? "var(--event-refinance)"
          : "var(--silver)";

  return (
    <div className="rounded-lg border" style={{ borderColor: "var(--border)" }}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-2.5 pt-2 text-left"
      >
        <Cpu size={12} className="shrink-0" style={{ color: "var(--accent)" }} />
        <span className="mono min-w-0 flex-1 truncate text-[0.68rem]" title={call.command} style={{ color: "var(--text-muted)" }}>
          {shortenPrecompiles(call.command)}
        </span>
        <Badge color={kindColor}>{call.kind}</Badge>
        {!dense ? (
          <span className="mono shrink-0 text-[0.68rem]" style={{ color: "var(--text-faint)" }}>
            {call.durationMs}ms
          </span>
        ) : null}
        {call.ok ? (
          <Check size={12} className="shrink-0" style={{ color: "var(--success)" }} />
        ) : (
          <X size={12} className="shrink-0" style={{ color: "var(--danger)" }} />
        )}
        <ChevronDown
          size={13}
          className="shrink-0"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "var(--text-faint)" }}
        />
      </button>
      <div className="px-2.5 pb-2 pt-0.5 text-xs" style={{ color: "var(--text)" }}>
        {call.summary}
      </div>
      <AnimatePresence initial={false}>
        {open && entries.length ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5 border-t px-2.5 py-2" style={{ borderColor: "var(--border)" }}>
              {entries.map(([k, v]) => {
                const isHash = /tx|hash|proof/i.test(k);
                return (
                  <div key={k} className={isHash ? "col-span-2 flex flex-col" : "flex flex-col"}>
                    <span className="eyebrow" style={{ fontSize: "0.54rem" }}>
                      {k}
                    </span>
                    {isHash ? (
                      <CopyHash value={String(v)} className="mt-0.5" />
                    ) : (
                      <span className="mono text-[0.7rem]" style={{ color: "var(--text-muted)" }}>
                        {String(v)}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// Backward compatibility alias
export const SkillCall = ProverCall;
