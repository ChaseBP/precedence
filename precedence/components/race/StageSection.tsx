"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, ChevronDown, Loader2 } from "lucide-react";
import { Card, Eyebrow } from "@/components/ui";

export function StageSection({
  kicker,
  title,
  statusLine,
  active,
  defaultOpen = false,
  children,
}: {
  kicker: string;
  title: string;
  statusLine: string;
  active: boolean;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const hero = active || defaultOpen;
  // `open` mirrors `hero` but must stay independently togglable once the user clicks. Deriving it
  // from a render-time comparison rather than syncing it in an effect avoids both the cascading
  // render React 19 flags and the extra paint an effect-sync causes.
  const [open, setOpen] = useState(hero);
  const [syncedTo, setSyncedTo] = useState(hero);
  if (syncedTo !== hero) {
    setSyncedTo(hero);
    setOpen(hero);
  }
  const expanded = active || open;

  // Bring the running stage into view when it becomes active.
  //
  // The race advances every ~600ms, which is paced enough to watch but only if the viewer is
  // looking at the right part of a page taller than the window. Without this the sequence
  // completes somewhere off-screen and the whole run reads as "something happened". Honours
  // prefers-reduced-motion, and never fights a user who has scrolled elsewhere deliberately —
  // it fires once per activation, not continuously.
  const ref = useRef<HTMLDivElement>(null);
  const announced = useRef(false);
  useEffect(() => {
    if (!active || announced.current) return;
    announced.current = true;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    ref.current?.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  }, [active]);

  return (
    <div
      ref={ref}
      aria-current={active ? "step" : undefined}
      className="rounded-2xl transition-shadow duration-300"
      // The active stage is the one thing on this page a viewer should be able to find without
      // reading. The ring goes on the wrapper rather than the card because Card owns its own
      // surface.
      style={
        active
          ? { boxShadow: "0 0 0 2px var(--accent), 0 0 30px -8px var(--accent-glow)" }
          : undefined
      }
    >
    <Card glow={hero} className="overflow-hidden p-0">
      <button
        type="button"
        onClick={() => (active ? undefined : setOpen((o) => !o))}
        aria-expanded={expanded}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        style={{ cursor: active ? "default" : "pointer" }}
      >
        <div className="flex min-w-0 items-center gap-3">
          <span
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full"
            style={{ background: active ? "var(--accent)" : "var(--success)", color: "var(--bg-0)" }}
          >
            {active ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
          </span>
          <div className="min-w-0">
            <Eyebrow>{kicker}</Eyebrow>
            <div className="font-[family-name:var(--font-display)] text-sm font-semibold">{title}</div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {!expanded ? (
            <span className="hidden max-w-[40ch] truncate text-xs sm:block" style={{ color: "var(--text-muted)" }}>
              {statusLine}
            </span>
          ) : null}
          {!active ? (
            <ChevronDown
              size={16}
              style={{ transform: expanded ? "rotate(180deg)" : "none", transition: "transform 0.2s", color: "var(--text-faint)" }}
            />
          ) : null}
        </div>
      </button>
      <AnimatePresence initial={false}>
        {expanded ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t px-4 pb-4 pt-4" style={{ borderColor: "var(--border)" }}>
              {children}
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </Card>
    </div>
  );
}
