"use client";

import { motion, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";

const container: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.16, 1, 0.3, 1] } },
};
const itemStill: Variants = { hidden: { opacity: 1, y: 0 }, show: { opacity: 1, y: 0 } };

/** Stagger container — wrap a card grid; direct <Item> children fade+rise in sequence. */
export function Stagger({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} variants={container} initial="hidden" animate="show">
      {children}
    </motion.div>
  );
}

/** A single staggered item (used inside <Stagger>). */
export function Item({ children, className }: { children: ReactNode; className?: string }) {
  const reduced = useReducedMotion();
  return (
    <motion.div className={className} variants={reduced ? itemStill : item}>
      {children}
    </motion.div>
  );
}

/** One-shot entrance for standalone blocks (headers, panels). */
export function FadeUp({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduced = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduced ? false : { opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1], delay }}
    >
      {children}
    </motion.div>
  );
}
