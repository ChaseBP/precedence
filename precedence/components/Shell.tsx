"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import type { ReactNode } from "react";
import { api } from "@/lib/client/api";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConnectWallet } from "@/components/ConnectWallet";

const NAV = [
  { href: "/collateral", label: "Collateral" },
  { href: "/race", label: "Priority Race" },
  { href: "/financiers", label: "Financiers" },
  { href: "/dashboard", label: "Telemetry" },
  { href: "/registry", label: "Registry" },
];

function Wordmark({ size = "text-lg" }: { size?: string }) {
  return (
    <span className={`shimmer-text font-[family-name:var(--font-display)] ${size} font-bold tracking-tight`}>
      PRECEDENCE
    </span>
  );
}

function useAdapterTruth() {
  const [chip, setChip] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((c) =>
        setChip(
          [
            c.sepolia === "viem" ? "Sepolia live" : "Sepolia locks",
            c.creditcoin === "viem" ? "Creditcoin CC3 live" : "Attestcoin 0x0FD2",
            c.runtime === "agent" ? "Financier AI" : "Policy Engine",
          ].join(" · "),
        ),
      )
      .catch(() => setChip(null));
  }, []);
  return chip;
}

function StatusCluster({ agents }: { agents: number | null }) {
  return (
    <span className="flex items-center gap-2 text-xs" style={{ color: "var(--text-muted)" }}>
      <span
        className="pulse-dot inline-block h-2 w-2 rounded-full"
        style={{ background: "var(--success)", boxShadow: "0 0 8px var(--success)" }}
      />
      Creditcoin CC3 · live{agents !== null ? <span className="mono" style={{ color: "var(--text-faint)" }}>· {agents} financiers</span> : null}
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<number | null>(null);
  const [strip, setStrip] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const chip = useAdapterTruth();

  useEffect(() => {
    api.agents().then((r) => setAgents(r.agents.length)).catch(() => {});
  }, []);

  // Magic link: ?admin=<token> unlocks the reset control
  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const t = url.searchParams.get("admin");
      if (t) {
        localStorage.setItem("precedence-admin", t);
        url.searchParams.delete("admin");
        window.history.replaceState(null, "", url.pathname + url.search + url.hash);
      }
      setAdminUnlocked(!!localStorage.getItem("precedence-admin"));
    } catch {}
  }, []);

  // One-time judge strip on the first /collateral visit
  useEffect(() => {
    if (pathname === "/collateral" && !localStorage.getItem("precedence-strip-seen")) {
      setStrip(true);
    }
  }, [pathname]);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const reset = async () => {
    if (!window.confirm("Reset demo state for EVERYONE viewing the app? This wipes all priority races and reseeds.")) {
      return;
    }
    const r = await api.reset();
    if (r.ok) location.reload();
    else window.alert("Reset failed — the admin link is missing or invalid. Re-open your /?admin=… link.");
  };

  return (
    <div className="min-h-screen">
      {/* ── Desktop: persistent top navbar ── */}
      <header
        className="glass-heavy sticky top-0 z-30 hidden h-16 items-center gap-6 border-b px-6 md:flex"
        style={{ borderColor: "var(--border)" }}
      >
        <Link href="/collateral" className="flex shrink-0 items-center gap-2.5">
          <Logo size={28} />
          <div className="leading-tight">
            <Wordmark />
            <div className="eyebrow hidden xl:block" style={{ fontSize: "0.66rem" }}>
              Priority Settlement Layer
            </div>
          </div>
        </Link>

        <nav className="mx-auto flex items-center gap-1">
          {NAV.map(({ href, label }) => {
            const active = pathname === href || (href !== "/collateral" && pathname.startsWith(href));
            return (
              <Link
                key={href}
                href={href}
                className="relative px-3 py-2 text-sm transition-colors"
                style={{ color: active ? "var(--text)" : "var(--text-muted)" }}
              >
                {label}
                {active ? (
                  <motion.span
                    layoutId="nav-active"
                    className="absolute inset-x-2 -bottom-[1px] h-[2px] rounded-full"
                    style={{ background: "var(--accent)", boxShadow: "0 0 8px var(--accent-glow)" }}
                  />
                ) : null}
              </Link>
            );
          })}
        </nav>

        <div className="flex shrink-0 items-center gap-4">
          {chip ? (
            <span
              className="mono hidden rounded-full border px-2.5 py-1 text-[0.66rem] uppercase tracking-wider 2xl:inline"
              style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
            >
              {chip}
            </span>
          ) : null}
          <div className="hidden min-w-0 lg:flex lg:items-center">
            <StatusCluster agents={agents} />
          </div>
          <ConnectWallet />
          <ThemeToggle />
          {adminUnlocked ? (
            <button onClick={reset} className="btn-ghost rounded-lg px-3 py-1.5 text-xs">
              Reset state
            </button>
          ) : null}
        </div>
      </header>

      {/* ── Mobile: top bar with hamburger ── */}
      <header
        className="glass-heavy sticky top-0 z-30 flex items-center gap-3 border-b px-4 py-3 md:hidden"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="btn-ghost flex h-9 w-9 items-center justify-center rounded-lg"
        >
          <Menu size={18} />
        </button>
        <Link href="/collateral" className="flex items-center gap-2.5">
          <Logo size={26} />
          <Wordmark />
        </Link>
        <div className="ml-auto">
          <StatusCluster agents={agents} />
        </div>
      </header>

      {/* Drawer (mobile) */}
      <AnimatePresence>
        {open && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-black/55"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              onClick={() => setOpen(false)}
            />
            <motion.aside
              className="glass-heavy fixed inset-y-0 left-0 z-50 flex w-[260px] flex-col justify-between border-r p-5"
              style={{ borderColor: "var(--border)" }}
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            >
              <div>
                <div className="mb-8 flex items-center justify-between">
                  <Link href="/collateral" className="flex items-center gap-2.5" onClick={() => setOpen(false)}>
                    <Logo size={30} />
                    <div className="leading-tight">
                      <Wordmark />
                      <div className="eyebrow" style={{ fontSize: "0.56rem" }}>
                        Priority Settlement Layer
                      </div>
                    </div>
                  </Link>
                  <button onClick={() => setOpen(false)} aria-label="Close menu" style={{ color: "var(--text-muted)" }}>
                    <X size={18} />
                  </button>
                </div>

                <nav className="flex flex-col gap-1">
                  {NAV.map(({ href, label }) => {
                    const active = pathname === href || (href !== "/collateral" && pathname.startsWith(href));
                    return (
                      <Link
                        key={href}
                        href={href}
                        className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors"
                        style={{
                          background: active ? "var(--grad-soft)" : "transparent",
                          color: active ? "var(--text)" : "var(--text-muted)",
                          border: active ? "1px solid var(--border-strong)" : "1px solid transparent",
                        }}
                      >
                        <span className="font-medium">{label}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div className="flex flex-col gap-3">
                <StatusCluster agents={agents} />
                <div className="flex items-center gap-2">
                  <ThemeToggle />
                  {adminUnlocked ? (
                    <button onClick={reset} className="btn-ghost flex-1 rounded-lg px-3 py-1.5 text-xs">
                      Reset demo state
                    </button>
                  ) : null}
                </div>
                <div className="eyebrow" style={{ fontSize: "0.54rem" }}>
                  v1.0 · Creditcoin CC3 × Attestcoin 0x0FD2
                </div>
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      {/* Judge strip — 15-second comprehension */}
      <AnimatePresence>
        {strip ? (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b"
            style={{ borderColor: "var(--border)", background: "rgba(83, 109, 254, 0.06)" }}
          >
            <div
              className="mx-auto flex max-w-7xl items-center justify-between gap-3 px-5 py-2 text-xs"
              style={{ color: "var(--text-muted)" }}
            >
              <span>
                3 competing financiers · lock capital on Sepolia · prove ordering via Attestcoin (0x0FD2) · settle priority on Creditcoin CC3 (ERC-1155)
              </span>
              <button
                aria-label="Dismiss"
                onClick={() => {
                  localStorage.setItem("precedence-strip-seen", "1");
                  setStrip(false);
                }}
                className="shrink-0"
                style={{ color: "var(--text-faint)" }}
              >
                <X size={14} />
              </button>
            </div>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <main className="mx-auto w-full max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}
