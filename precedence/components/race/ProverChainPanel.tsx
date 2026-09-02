"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ShieldCheck } from "lucide-react";
import type { ProverCallRecord, SkillCallRecord } from "@/lib/precedence/types";
import { Eyebrow } from "@/components/ui";
import { ProverCall } from "./ProverCall";

export function ProverChainPanel({
  calls,
}: {
  calls: (ProverCallRecord | SkillCallRecord)[];
}) {
  const [open, setOpen] = useState(true);
  if (!calls || !calls.length) return null;

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="mb-2 flex w-full items-center justify-between"
      >
        <span className="flex items-center gap-2">
          <ShieldCheck size={13} style={{ color: "var(--accent)" }} />
          <Eyebrow>Prover &amp; Precompile Pipeline ({calls.length})</Eyebrow>
        </span>
        <ChevronDown
          size={14}
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "var(--text-faint)" }}
        />
      </button>
      <AnimatePresence initial={false}>
        {open ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-1.5">
              {calls.map((c) => (
                <ProverCall key={c.id} call={c} dense />
              ))}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}

// Backward compatibility alias
export const SkillChainPanel = ProverChainPanel;
