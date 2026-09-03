"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  motion,
  useMotionValue,
  useSpring,
  useTransform,
  useMotionTemplate,
  useReducedMotion,
  type MotionValue,
} from "motion/react";
import { ArrowRight } from "lucide-react";
import { api } from "@/lib/client/api";
import { Logo, LOGO_PATHS } from "@/components/Logo";
import { Atmosphere } from "@/components/motion/Atmosphere";
import { ThemeToggle } from "@/components/ThemeToggle";

const TITLE = "PRECEDENCE".split("");

function HeroLogo({ tiltX, tiltY }: { tiltX: MotionValue<number>; tiltY: MotionValue<number> }) {
  return (
    <motion.div className="relative" style={{ rotateX: tiltX, rotateY: tiltY, transformPerspective: 600 }}>
      <motion.span
        aria-hidden
        className="absolute inset-[-45%] rounded-full"
        style={{ background: "radial-gradient(circle, var(--accent-glow), transparent 70%)" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0.2, 0.45, 0.2] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut", delay: 1.8 }}
      />
      <svg width={76} height={76} viewBox="0 0 32 32" fill="none" aria-hidden className="relative">
        {LOGO_PATHS.map((p, i) => (
          <motion.path
            key={i}
            d={p.d}
            stroke={p.color}
            strokeWidth={p.width}
            strokeLinecap="round"
            strokeLinejoin="round"
            initial={{ pathLength: 0, opacity: 0 }}
            animate={{ pathLength: 1, opacity: 1 }}
            transition={{ duration: 0.4, delay: 0.15 + i * 0.15, ease: "easeOut" }}
          />
        ))}
      </svg>
      <motion.span
        aria-hidden
        className="absolute inset-[-35%] rounded-full"
        style={{ background: "radial-gradient(circle, var(--accent-glow), transparent 65%)" }}
        initial={{ opacity: 0, scale: 0.5 }}
        animate={{ opacity: [0, 0.9, 0], scale: [0.5, 1.25, 1.5] }}
        transition={{ delay: 0.8, duration: 0.7, ease: "easeOut" }}
      />
    </motion.div>
  );
}

function Key({ children }: { children: string }) {
  return <span className="mono" style={{ color: "var(--accent)", fontSize: "0.92em" }}>{children}</span>;
}

export default function Landing() {
  const router = useRouter();
  const reduced = useReducedMotion();

  // Live terminal line typed out from real reads
  const [full, setFull] = useState<string | null>(null);
  const [typed, setTyped] = useState("");

  useEffect(() => {
    Promise.allSettled([api.collateral(), api.races(), api.agents()]).then(([o, c, a]) => {
      const parts: string[] = [];
      if (o.status === "fulfilled" && o.value.count > 0) {
        parts.push(`scanning ${o.value.count} collateral assets`);
      }
      if (c.status === "fulfilled") {
        const count = c.value.races?.length ?? 0;
        if (count > 0) {
          parts.push(`${count} settled races`);
        }
      }
      if (!parts.length) parts.push(`${a.status === "fulfilled" ? a.value.agents.length : 3} financiers standing by`);
      parts.push("Attestcoin 0x0FD2 · Creditcoin CC3");
      setFull(`▸ ${parts.join(" · ")}`);
    });
  }, []);

  useEffect(() => {
    if (full === null || reduced) return;
    let i = 0;
    const t = setInterval(() => {
      i += 1;
      setTyped(full.slice(0, i));
      if (i >= full.length) clearInterval(t);
    }, 24);
    return () => clearInterval(t);
  }, [full, reduced]);

  const line = reduced ? full ?? "" : typed;

  // Cursor-reactive spotlight
  const px = useMotionValue(-800);
  const py = useMotionValue(-800);
  const nx = useMotionValue(0);
  const ny = useMotionValue(0);
  const spx = useSpring(px, { stiffness: 50, damping: 18 });
  const spy = useSpring(py, { stiffness: 50, damping: 18 });
  const snx = useSpring(nx, { stiffness: 60, damping: 20 });
  const sny = useSpring(ny, { stiffness: 60, damping: 20 });
  const spotlight = useMotionTemplate`radial-gradient(600px circle at ${spx}px ${spy}px, rgba(83, 109, 254, 0.08), transparent 70%)`;
  const tiltY = useTransform(snx, [-0.5, 0.5], [-3, 3]);
  const tiltX = useTransform(sny, [-0.5, 0.5], [3, -3]);
  const heroX = useTransform(snx, [-0.5, 0.5], [6, -6]);
  const heroY = useTransform(sny, [-0.5, 0.5], [4, -4]);
  const tagX = useTransform(snx, [-0.5, 0.5], [3, -3]);

  const onMove = reduced
    ? undefined
    : (e: React.MouseEvent) => {
        px.set(e.clientX);
        py.set(e.clientY);
        nx.set(e.clientX / window.innerWidth - 0.5);
        ny.set(e.clientY / window.innerHeight - 0.5);
      };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && e.target === document.body) {
        router.push("/collateral");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  return (
    <main
      onMouseMove={onMove}
      className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 text-center"
    >
      <Atmosphere />
      {!reduced ? (
        <motion.div aria-hidden className="pointer-events-none fixed inset-0 z-0" style={{ background: spotlight }} />
      ) : null}
      <div className="vignette" aria-hidden />
      <div className="grain" aria-hidden />
      <ThemeToggle className="!fixed right-5 top-5 z-20" />

      {/* w-full + max-w-full so nothing inside can widen this past the padded viewport. `main` is
          `overflow-hidden`, so anything that does gets CLIPPED rather than becoming scrollable —
          which is why a mechanical scrollWidth check reported this page as clean while the
          wordmark was visibly cut off at both edges on a 360px screen. */}
      <div className="relative z-10 flex w-full max-w-full flex-col items-center">
        <div className="mb-7">{reduced ? <Logo size={76} /> : <HeroLogo tiltX={tiltX} tiltY={tiltY} />}</div>

        <motion.h1
          style={{ x: heroX, y: heroY, letterSpacing: "-0.04em" }}
          // Started at text-6xl with no smaller step: ten letters at 60px overflow a 360px
          // viewport, and because this h1 sets the width of the centered column, it pushed the
          // tagline off both edges too.
          className="flex max-w-full justify-center font-[family-name:var(--font-display)] text-[2.15rem] font-bold leading-[1.1] sm:text-6xl md:text-7xl"
        >
          {TITLE.map((c, i) => (
            <motion.span
              key={i}
              initial={{ opacity: 0, y: 18, filter: "blur(6px)" }}
              animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
              transition={{ duration: 0.45, delay: 0.3 + i * 0.08, ease: [0.16, 1, 0.3, 1] }}
              className={i === 0 ? "text-gradient" : ""}
            >
              {c}
            </motion.span>
          ))}
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.9 }}
          style={{ x: tagX, color: "var(--text-muted)", textWrap: "balance" }}
          className="mt-5 max-w-xl text-base leading-relaxed sm:text-lg"
        >
          Competing financiers race to lock capital against real-world collateral on Ethereum Sepolia —{" "}
          <Key>proof-ordered priority</Key> verified by Attestcoin at <Key>0x0FD2</Key>, tradeable <Key>ERC-1155 claims</Key> minted on Creditcoin CC3, and atomic refinancing in one block.{" "}
          <span style={{ color: "var(--text)" }}>The encumbrance registry populates itself.</span>
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 1.15 }}
          className="mt-9 flex w-full flex-col items-center gap-5"
        >
          <div className="flex w-full max-w-2xl items-center gap-4">
            <span aria-hidden className="h-px min-w-6 flex-1" style={{ background: "linear-gradient(90deg, transparent, var(--border-strong))" }} />
            <Link href="/collateral" className="btn-accent group flex items-center gap-2 px-6 py-3.5 text-sm font-semibold">
              Enter Command Center
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" />
            </Link>
            <span
              className="mono hidden rounded border px-1.5 py-0.5 text-[0.68rem] sm:inline"
              style={{ borderColor: "var(--border-strong)", color: "var(--text-faint)" }}
              title="Press Enter"
            >
              ⏎
            </span>
            <span aria-hidden className="h-px min-w-6 flex-1" style={{ background: "linear-gradient(90deg, var(--border-strong), transparent)" }} />
          </div>

          <div className="mono min-h-[1.2em] text-xs" style={{ color: "var(--text-faint)" }}>
            {line}
            {full !== null ? <span className="caret" style={{ color: "var(--accent)" }}>▌</span> : null}
          </div>
        </motion.div>
      </div>
    </main>
  );
}
