"use client";

import { motion, useReducedMotion } from "motion/react";

const BLOCK = "█";

/** Sealed value — a blurred haze field with drifting particles (see .redacted).
 *  The blocks are transparent; they only size the field. */
export function Redacted({ chars = 10, className = "" }: { chars?: number; className?: string }) {
  return <span className={`redacted text-xs ${className}`} aria-label="sealed">{BLOCK.repeat(chars)}</span>;
}

/** At reveal, the haze burns off and the real value sharpens into place (~600ms). */
export function RedactedReveal({ text, className = "", style }: { text: string; className?: string; style?: React.CSSProperties }) {
  const reduced = useReducedMotion();
  if (reduced) return <span className={`mono break-all ${className}`} style={style}>{text}</span>;
  return (
    <span className="relative inline-block max-w-full align-middle">
      <motion.span
        className={`mono break-all ${className}`}
        style={style}
        initial={{ filter: "blur(7px)", opacity: 0.3 }}
        animate={{ filter: "blur(0px)", opacity: 1 }}
        transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      >
        {text}
      </motion.span>
      <motion.span
        aria-hidden
        className="redacted"
        style={{ position: "absolute", inset: 0, padding: 0, pointerEvents: "none" }}
        initial={{ opacity: 1 }}
        animate={{ opacity: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      />
    </span>
  );
}
