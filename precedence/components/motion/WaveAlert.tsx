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
          // Bottom-centre and OPAQUE. It has been in two wrong places: at `top-20` it landed on
          // the comprehension strip beneath the header, and at bottom-left it sat over card
          // content while the Toaster stack held bottom-right. Being translucent glass made
          // either position worse, because it blended into whatever was underneath and left both
          // unreadable. A transient overlay has to read as sitting above the page.
          className="fixed bottom-4 left-1/2 z-[9998] flex max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-2.5 rounded-xl px-4 py-2.5 shadow-2xl"
          style={{
            background: "var(--bg-2)",
            border: `1px solid color-mix(in srgb, ${cfg.color} 45%, var(--border-strong))`,
          }}
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
