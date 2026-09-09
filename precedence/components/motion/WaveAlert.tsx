"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Radar, Award, ShieldAlert, Sparkles, X } from "lucide-react";

export type WaveVariant = "settle" | "breach" | "refinance" | "detected";

interface WaveAlertProps {
  show: boolean;
  label: string;
  variant?: WaveVariant;
}

/**
 * Dismissal is remembered PER WAVE, not as a boolean.
 *
 * @remarks This used to be `dismissed: boolean` kept in step with an effect —
 * `useEffect(() => { if (show) setDismissed(false) }, [show, label])` — so that a fresh wave
 * re-opened a banner the viewer had closed. That is state synchronised to a prop, which React 19
 * flags as a cascading render: the effect fires after paint and schedules a second render pass to
 * fix up state the first pass already had enough information to compute.
 *
 * Recording WHICH wave was dismissed removes the need to reset anything. A new wave has a
 * different label, so `dismissedFor !== label` is true again on the very first render, with no
 * effect and no second pass.
 *
 * It also lets the banner stay mounted, which is what makes its exit animation possible. The
 * previous call site rendered it conditionally, so a cleared wave unmounted the component
 * instantly and `AnimatePresence` — which lives inside it — never got to play the exit it defines.
 */

const CONFIG: Record<WaveVariant, { title: string; color: string; icon: typeof Radar }> = {
  settle: { title: "Priority Settled", color: "var(--proof-verified)", icon: Award },
  breach: { title: "Breach Detected", color: "var(--state-breached)", icon: ShieldAlert },
  refinance: { title: "Refinance Discovered", color: "var(--event-refinance)", icon: Sparkles },
  detected: { title: "Collateral Detected", color: "var(--accent)", icon: Radar },
};

export function WaveAlert({ show, label, variant = "detected" }: WaveAlertProps) {
  const cfg = CONFIG[variant] ?? CONFIG.detected;
  const Icon = cfg.icon;
  const [dismissedFor, setDismissedFor] = useState<string | null>(null);
  const open = show && dismissedFor !== label;

  /**
   * Tell the document a wave is up so the toast lane can move.
   *
   * @remarks Both live at the bottom of the viewport, and at 360px they overlapped into an
   * unreadable stack that also covered the cards underneath. Nudging one of them by a few rem does
   * not fix it — at 640px a 360px toast at right-5 and a 420px centred banner still intersect. The
   * only arrangement that cannot collide at any width is a single lane, so the banner claims the
   * bottom and the toasts stack above it.
   */
  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("wave-open", open);
    return () => root.classList.remove("wave-open");
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
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
          className="fixed bottom-4 left-1/2 z-[9990] flex max-w-[min(420px,calc(100vw-2rem))] -translate-x-1/2 items-center gap-2.5 rounded-xl px-4 py-2.5 shadow-2xl"
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
          <div className="min-w-0">
            <div className="eyebrow" style={{ color: cfg.color }}>
              {cfg.title}
            </div>
            <div className="text-sm font-medium">{label}</div>
          </div>
          <button
            onClick={() => setDismissedFor(label)}
            aria-label="Dismiss notification"
            className="btn-ghost ml-1 shrink-0 rounded-md p-1"
          >
            <X size={12} />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
