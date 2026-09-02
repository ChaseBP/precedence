"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion, MotionConfig } from "motion/react";
import { CheckCircle2, AlertTriangle, XCircle, Info } from "lucide-react";

type Level = "info" | "success" | "warn" | "error";
interface Toast { id: number; title: string; body?: string; level: Level }

const COLOR: Record<Level, string> = { info: "var(--silver)", success: "var(--success)", warn: "var(--warn)", error: "var(--danger)" };
const ICON = { info: Info, success: CheckCircle2, warn: AlertTriangle, error: XCircle };

const Ctx = createContext<{ toast: (t: { title: string; body?: string; level?: Level }) => void }>({ toast: () => {} });
export const useToast = () => useContext(Ctx);

export function Toaster({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [mounted, setMounted] = useState(false);
  // Deferred: setting state straight from an effect body is a cascading render under React 19.
  // The flag exists only to gate createPortal until after hydration, so a tick's delay is free.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setMounted(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const toast = useCallback(({ title, body, level = "info" }: { title: string; body?: string; level?: Level }) => {
    const id = Date.now() + Math.random();
    setToasts((s) => [...s, { id, title, body, level }]);
    setTimeout(() => setToasts((s) => s.filter((t) => t.id !== id)), 5200);
  }, []);

  return (
    <Ctx.Provider value={{ toast }}>
      <MotionConfig reducedMotion="user">{children}</MotionConfig>
      {mounted &&
        createPortal(
          <div className="pointer-events-none fixed bottom-5 right-5 z-[9999] flex w-[min(360px,90vw)] flex-col gap-2">
            <AnimatePresence>
              {toasts.map((t) => {
                const Icon = ICON[t.level];
                return (
                  <motion.div
                    key={t.id}
                    layout
                    initial={{ opacity: 0, x: 40, scale: 0.96 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 40, scale: 0.96 }}
                    transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                    className="glass-heavy pointer-events-auto flex items-start gap-2.5 rounded-xl p-3"
                    style={{ borderLeft: `2px solid ${COLOR[t.level]}` }}
                  >
                    <Icon size={16} color={COLOR[t.level]} className="mt-0.5 shrink-0" />
                    <div className="min-w-0">
                      <div className="text-sm font-medium">{t.title}</div>
                      {t.body ? <div className="hash mt-0.5" style={{ color: "var(--text-muted)" }}>{t.body}</div> : null}
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>,
          document.body,
        )}
    </Ctx.Provider>
  );
}
