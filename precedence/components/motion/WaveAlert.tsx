"use client";

import { AnimatePresence, motion } from "motion/react";
import { Radar, Award, ShieldAlert, Sparkles } from "lucide-react";

export type WaveVariant = "settle" | "breach" | "refinance" | "detected";

interface WaveAlertProps {
  show: boolean;
  label: string;
  variant?: WaveVariant;
}

const CONFIG: Record<WaveVariant, { title: string; color: string; icon: typeof Radar }> = {
  settle: { title: "Priority Settled", color: "var(--proof-verified)", icon: Award },
  breach: { title: "Breach Detected", color: "var(--state-breached)", icon: ShieldAlert },
  refinance: { title: "Refinance Discovered", color: "var(--event-refinance)", icon: Sparkles },
  detected: { title: "Collateral Detected", color: "var(--accent)", icon: Radar },
};

export function WaveAlert({ show, label, variant = "detected" }: WaveAlertProps) {
  const cfg = CONFIG[variant] ?? CONFIG.detected;
  const Icon = cfg.icon;

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          initial={{ opacity: 0, y: -16, x: 16 }}
          animate={{ opacity: 1, y: 0, x: 0 }}
          exit={{ opacity: 0, y: -16, x: 16 }}
          transition={{ duration: 0.35 }}
          // top-20 (80px) sat directly on the comprehension strip below the 64px header and made both
        // unreadable. Bottom-left keeps it clear of the strip AND of the Toaster stack at bottom-right.
        className="glass-heavy fixed bottom-5 left-5 z-[9998] flex max-w-[min(360px,calc(100vw-2.5rem))] items-center gap-2.5 rounded-xl px-4 py-2.5"
          style={{ border: `1px solid color-mix(in srgb, ${cfg.color} 40%, transparent)` }}
        >
          <span className="relative flex h-6 w-6 items-center justify-center">
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className="absolute h-6 w-6 rounded-full"
                style={{
                  border: `1.5px solid ${cfg.color}`,
                  animation: `precedence-ripple 1.8s ease-out ${i * 0.5}s infinite`,
                }}
              />
            ))}
            <Icon size={14} style={{ color: cfg.color }} />
          </span>
          <div>
            <div className="eyebrow" style={{ color: cfg.color }}>
              {cfg.title}
            </div>
            <div className="text-sm font-medium">{label}</div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
