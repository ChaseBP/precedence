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

/**
 * @remarks "Borrow" earns a top-level slot because without it the borrower half of the product was
 * unreachable: no nav entry, and /registry listed past races with no way to start one. Half the
 * app could only be found by typing a URL. The nav rail scrolls, so the extra item cannot reopen
 * the header-overflow problem.
 */
/**
 * Ordered by the sequence the protocol actually runs in, not by when each page was built.
 *
 * @remarks A borrower registers an asset, lenders see it and race for a rank, priority settles,
 * and the outcome lands in the registry. The old order opened with the marketplace and buried
 * registration in the middle, so the nav read as a list of screens rather than a description of
 * how the thing works. "My positions" and "Lenders" sit at the end because they are lookups, not
 * steps.
 */
const NAV = [
  { href: "/registry/new", label: "Register asset" },
  { href: "/collateral", label: "Facilities" },
  { href: "/race", label: "Priority race" },
  { href: "/registry", label: "Liens" },
  { href: "/portfolio", label: "Positions" },
  { href: "/financiers", label: "Lenders" },
  { href: "/dashboard", label: "Telemetry" },
];

function Wordmark({ size = "text-lg" }: { size?: string }) {
  return (
    <span className={`shimmer-text font-[family-name:var(--font-display)] ${size} font-bold tracking-tight`}>
      PRECEDENCE
    </span>
  );
}

interface AdapterTruth {
  sepoliaLive: boolean;
  creditcoinLive: boolean;
  agentRuntime: boolean;
  chip: string;
}

/**
 * Read each adapter's own `isLive()` and report it verbatim.
 *
 * @remarks This previously compared `c.sepolia === "viem"`, but `/api/config` returns an OBJECT
 * (`{requested, live, note}`), so both comparisons were permanently false and the chip was a
 * constant that could never report live mode. Two failures in one: the mode disclosure the project
 * relies on did not function, and it would not have started working when the chain went live.
 *
 * Returning `null` while loading matters — rendering a default would mean guessing, and the one
 * thing this hook must never do is guess in the reassuring direction.
 */
function useAdapterTruth(): AdapterTruth | null {
  const [truth, setTruth] = useState<AdapterTruth | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/config", { cache: "no-store" });
        const c = await res.json();
        const sepoliaLive = Boolean(c?.sepolia?.live);
        const creditcoinLive = Boolean(c?.creditcoin?.live);
        const agentRuntime = c?.runtime === "agent";
        if (cancelled) return;
        setTruth({
          sepoliaLive,
          creditcoinLive,
          agentRuntime,
          chip: [
            sepoliaLive ? "Sepolia live" : "Sepolia simulated",
            creditcoinLive ? "Creditcoin CC3 live" : "Creditcoin CC3 simulated",
            agentRuntime ? "Financier AI" : "Policy Engine",
          ].join(" · "),
        });
      } catch {
        if (!cancelled) setTruth(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return truth;
}

/**
 * The header's chain status.
 *
 * @remarks This hard-coded a pulsing green "Creditcoin CC3 · live" regardless of mode, so in mock
 * mode — the default — the most prominent status text on the page asserted something the app
 * itself knew to be false. Colour, pulse and wording now all follow `isLive()`: green and pulsing
 * only when the adapter really is on-chain, amber and still when it is simulated.
 */
function StatusCluster({
  agents,
  truth,
  compact = false,
}: {
  agents: number | null;
  truth: AdapterTruth | null;
  /**
   * Drop the chain name and financier count, keeping only the dot and live/simulated.
   *
   * @remarks For the mobile header, where the full cluster plus a hamburger, logo and wordmark
   * does not fit 360px. What survives the trim is deliberately the honesty signal: a viewer must
   * still be able to tell simulated from live, even when there is no room for anything else.
   */
  compact?: boolean;
}) {
  if (!truth) return null;
  const live = truth.creditcoinLive;
  const color = live ? "var(--success)" : "var(--warn)";
  return (
    <span
      className="flex min-w-0 items-center gap-1.5 whitespace-nowrap text-xs"
      style={{ color: "var(--text-muted)" }}
      title={
        live
          ? "Reading the deployed contracts on Creditcoin CC3."
          : "Simulated data. No live registry is connected — see /api/config for why."
      }
    >
      <span
        className={`inline-block h-2 w-2 shrink-0 rounded-full ${live ? "pulse-dot" : ""}`}
        style={{ background: color, boxShadow: `0 0 8px ${color}` }}
      />
      {compact ? (
        <span style={{ color: live ? "var(--success)" : "var(--warn)" }}>
          {live ? "live" : "simulated"}
        </span>
      ) : (
        <>
          Creditcoin CC3 · {live ? "live" : "simulated"}
          {agents !== null ? (
            <span className="mono" style={{ color: "var(--text-faint)" }}>
              · {agents} financiers
            </span>
          ) : null}
        </>
      )}
    </span>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [agents, setAgents] = useState<number | null>(null);
  const [strip, setStrip] = useState(false);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const truth = useAdapterTruth();

  useEffect(() => {
    api.agents().then((r) => setAgents(r.agents.length)).catch(() => {});
  }, []);

  // Magic link: ?admin=<token> unlocks the reset control.
  //
  // Each setState below yields first. React 19 flags a synchronous setState in an effect body as a
  // cascading render, and none of this can move to initial state: it all reads `window` or
  // `localStorage`, which the server render does not have, so seeding from it would risk a
  // hydration mismatch instead.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        const url = new URL(window.location.href);
        const t = url.searchParams.get("admin");
        if (t) {
          localStorage.setItem("precedence-admin", t);
          url.searchParams.delete("admin");
          window.history.replaceState(null, "", url.pathname + url.search + url.hash);
        }
        setAdminUnlocked(!!localStorage.getItem("precedence-admin"));
      } catch {
        // A browser refusing localStorage simply leaves the control locked, which is the safe default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // One-time judge strip on the first /collateral visit
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await Promise.resolve();
      if (cancelled) return;
      try {
        if (pathname === "/collateral" && !localStorage.getItem("precedence-strip-seen")) {
          setStrip(true);
        }
      } catch {
        // no localStorage: skip the strip rather than show it on every visit
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  // Close the mobile drawer on navigation. Deferred for the same reason as above.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) setOpen(false);
    });
    return () => {
      cancelled = true;
    };
  }, [pathname]);

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
        className="glass-chrome sticky top-0 z-30 hidden h-16 items-center gap-4 overflow-hidden border-b px-5 md:flex"
        style={{ borderColor: "var(--border)" }}
      >
        <Link href="/collateral" className="flex min-w-0 shrink items-center gap-2.5">
          <Logo size={28} />
          <div className="leading-tight">
            <Wordmark />
            <div className="eyebrow hidden xl:block" style={{ fontSize: "0.66rem" }}>
              Priority Settlement Layer
            </div>
          </div>
        </Link>

        <nav
          className="no-scrollbar mx-auto flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
          // The rail scrolls, but a hard cut looks like a layout bug rather than an invitation to
          // scroll. The mask only bites when there is actually overflow to reveal.
          style={{
            maskImage: "linear-gradient(90deg, #000 0, #000 calc(100% - 24px), transparent 100%)",
            WebkitMaskImage: "linear-gradient(90deg, #000 0, #000 calc(100% - 24px), transparent 100%)",
          }}
        >
          {NAV.map(({ href, label }) => {
            // Exact match for /registry so it does not also highlight while on /registry/new — two
            // different destinations should never both look current.
            const active =
              href === "/registry" || href === "/registry/new" || href === "/collateral"
                ? pathname === href
                : pathname === href || pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className="relative shrink-0 whitespace-nowrap px-3 py-2 text-sm transition-colors"
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

        <div className="flex min-w-0 shrink-0 items-center gap-3">
          {truth ? (
            <span
              className="mono hidden truncate rounded-full border px-2.5 py-1 text-[0.66rem] uppercase tracking-wider [@media(min-width:1900px)]:inline"
              style={{ borderColor: "var(--border)", color: "var(--text-faint)" }}
              title={truth.chip}
            >
              {truth.chip}
            </span>
          ) : null}
          <div className="hidden min-w-0 [@media(min-width:1480px)]:flex [@media(min-width:1480px)]:items-center">
            <StatusCluster agents={agents} truth={truth} />
          </div>
          {/* Below 1480px the full cluster does not fit beside a seven-item nav and a connect
              button, but the live/simulated signal must never be the thing that drops — so the
              compact dot takes over rather than showing nothing. */}
          <div className="flex shrink-0 items-center [@media(min-width:1480px)]:hidden">
            <StatusCluster agents={agents} truth={truth} compact />
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
        className="glass-chrome sticky top-0 z-30 flex items-center gap-2.5 overflow-hidden border-b px-3 py-2.5 md:hidden"
        style={{ borderColor: "var(--border)" }}
      >
        <button
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          className="btn-ghost flex h-9 w-9 items-center justify-center rounded-lg"
        >
          <Menu size={18} />
        </button>
        <Link href="/collateral" className="flex min-w-0 shrink items-center gap-2.5">
          <Logo size={26} />
          <Wordmark />
        </Link>
        <div className="ml-auto shrink-0">
          <StatusCluster agents={agents} truth={truth} compact />
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
                    // Exact match for /registry so it does not also highlight while on /registry/new — two
            // different destinations should never both look current.
            const active =
              href === "/registry" || href === "/registry/new" || href === "/collateral"
                ? pathname === href
                : pathname === href || pathname.startsWith(href);
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
                <StatusCluster agents={agents} truth={truth} />
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
