"use client";

import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { LOGO_PATHS } from "@/components/Logo";

/**
 * The PRECEDENCE Priority Engine Core — animated state of ordered claims verification.
 * Loops and emits proof waves when `active` (during bidding / proof verification).
 */
export function PriorityCore({ active, label }: { active: boolean; label: string }) {
  const [step, setStep] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (!active || reduced) return;
    const t = setInterval(() => setStep((s) => (s + 1) % 3), 400);
    return () => clearInterval(t);
  }, [active, reduced]);

  return (
    <div className="relative mt-2 flex h-24 items-center justify-center">
      {active &&
        [0, 1, 2].map((i) => (
          <motion.span
            key={i}
            className="absolute h-16 w-16 rounded-full"
            style={{ border: "1px solid var(--accent)" }}
            initial={{ scale: 0.4, opacity: 0.5 }}
            animate={{ scale: 2.2, opacity: 0 }}
            transition={{ duration: 2, delay: i * 0.6, repeat: Infinity, ease: "easeOut" }}
          />
        ))}
      {active &&
        Array.from({ length: 8 }).map((_, i) => {
          const a = (i / 8) * Math.PI * 2;
          return (
            <motion.span
              key={`o${i}`}
              className="absolute h-1.5 w-1.5 rounded-full"
              style={{ background: "var(--accent)" }}
              animate={{ x: [0, Math.cos(a) * 46], y: [0, Math.sin(a) * 46], opacity: [1, 0] }}
              transition={{ duration: 1.3, delay: i * 0.12, repeat: Infinity, ease: "easeOut" }}
            />
          );
        })}
      <motion.div
        className="relative"
        animate={active ? { scale: [1, 1.08, 1] } : { scale: 1 }}
        transition={{ duration: 1.2, repeat: active ? Infinity : 0, ease: "easeInOut" }}
      >
        <svg width={54} height={54} viewBox="0 0 32 32" fill="none" aria-hidden>
          {LOGO_PATHS.map((p, i) => (
            <path
              key={i}
              d={p.d}
              stroke={active && i === step ? "var(--accent)" : p.color}
              strokeWidth={p.width}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: "stroke 0.2s" }}
            />
          ))}
        </svg>
      </motion.div>
      <div className="eyebrow absolute -bottom-2 whitespace-nowrap" style={{ color: active ? "var(--accent)" : "var(--text-faint)" }}>
        {label}
      </div>
    </div>
  );
}
