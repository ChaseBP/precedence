"use client";

/**
 * The landing page.
 *
 * @remarks It used to be one viewport tall with no scroll at all: a logo, a wordmark, one run-on
 * paragraph, a button and a status line, every one of them stacked on the same centre axis. It
 * read as a title card rather than a product, which is exactly what it was.
 *
 * The rebuild leads with the receipt instead of a slogan about the receipt. `SETTLEMENT` is a real
 * settled race — two locks in ONE Sepolia block, separated by transaction index alone, proven at
 * `0x0FD2` and settled on Creditcoin. That artefact is the whole argument, it is verifiable on a
 * public explorer, and no competitor can copy it without doing the work. Everything below it is
 * support.
 *
 * Deliberately absent: the cursor-following spotlight, the 3D tilt, the per-letter blur entrance
 * and the endlessly retyping status line. They read as game marketing rather than as a place to
 * put money, and two independent reviewers described the blur as looking like a rendering defect.
 */

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConnectWallet } from "@/components/ConnectWallet";
import { SETTLEMENT, EXPLORER, DEPLOYED } from "@/lib/landing-record";

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

/* ─────────────────────────── the receipt ─────────────────────────── */

function SettlementRecord() {
  const reduced = useReducedMotion();
  return (
    <div
      className="w-full overflow-hidden rounded-2xl border"
      style={{ borderColor: "var(--border-strong)", background: "var(--bg-1)" }}
    >
      <div
        className="flex items-baseline justify-between gap-3 border-b px-5 py-3.5"
        style={{ borderColor: "var(--border)" }}
      >
        {/* The one all-caps label that survives. A caption on a document is the vernacular of
            trade finance, not template chrome. */}
        <span className="mono text-[0.62rem] uppercase tracking-[0.14em]" style={{ color: "var(--text-faint)" }}>
          Settlement record
        </span>
        <span className="mono text-[0.68rem]" style={{ color: "var(--proof-verified)" }}>
          verified
        </span>
      </div>

      <div className="px-5 pt-4">
        <div className="text-[0.78rem]" style={{ color: "var(--text-muted)" }}>
          {SETTLEMENT.sourceChain}, block{" "}
          <a
            href={EXPLORER.sepoliaBlock(SETTLEMENT.block)}
            target="_blank"
            rel="noreferrer"
            className="mono underline decoration-dotted underline-offset-4 hover:decoration-solid"
            style={{ color: "var(--text)" }}
          >
            {SETTLEMENT.block}
          </a>
        </div>
      </div>

      <div className="flex flex-col gap-1.5 p-5 pt-3">
        {SETTLEMENT.locks.map((l, i) => (
          <motion.a
            key={l.txHash}
            href={EXPLORER.sepoliaTx(l.txHash)}
            target="_blank"
            rel="noreferrer"
            // The one orchestrated moment on this page: the two rows arrive in their proven
            // order. Under reduced motion they are simply already in it.
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: reduced ? 0 : 0.45 + i * 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-x-4 rounded-lg px-3 py-2.5 transition-colors"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            <span
              className="mono text-lg font-semibold tabular-nums"
              style={{ color: "var(--accent)" }}
              title={`transaction index ${l.txIndex}`}
            >
              {l.txIndex}
            </span>
            <span className="min-w-0">
              <span
                className="mono text-[0.7rem] uppercase tracking-wider"
                style={{ color: `var(--rank-${l.tranche.toLowerCase()})` }}
              >
                {l.tranche}
              </span>
              <span className="mono block truncate text-[0.62rem]" style={{ color: "var(--text-faint)" }}>
                {short(l.txHash)}
              </span>
            </span>
            <span className="mono text-sm font-semibold tabular-nums">{l.amount}</span>
          </motion.a>
        ))}
      </div>

      <div
        className="border-t px-5 py-3.5 text-[0.72rem] leading-relaxed"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      >
        One block. The index is the only thing separating them, and it is what decides who is
        senior.
        <span className="mt-1.5 block" style={{ color: "var(--text-faint)" }}>
          Proven at{" "}
          <span className="mono" style={{ color: "var(--text-muted)" }}>
            0x0FD2
          </span>
          , settled on {SETTLEMENT.settledOn.chain} block{" "}
          <a
            href={EXPLORER.creditcoinBlock(SETTLEMENT.settledOn.block)}
            target="_blank"
            rel="noreferrer"
            className="mono underline decoration-dotted underline-offset-4 hover:decoration-solid"
            style={{ color: "var(--text-muted)" }}
          >
            {SETTLEMENT.settledOn.block}
          </a>
          . {SETTLEMENT.refunded} later locks were returned in full.
        </span>
      </div>
    </div>
  );
}

/* ─────────────────────────── sections ─────────────────────────── */

function Section({
  title,
  deck,
  children,
  tint,
}: {
  title: string;
  deck?: string;
  children: React.ReactNode;
  tint?: boolean;
}) {
  return (
    <section
      className="border-t px-6 py-12 sm:py-16"
      style={{ borderColor: "var(--border)", background: tint ? "var(--bg-1)" : "transparent" }}
    >
      <div className="mx-auto w-full max-w-5xl">
        <h2 className="font-[family-name:var(--font-display)] text-2xl font-semibold tracking-tight sm:text-3xl">
          {title}
        </h2>
        {deck ? (
          <p className="mt-2.5 max-w-[62ch] text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {deck}
          </p>
        ) : null}
        <div className="mt-8">{children}</div>
      </div>
    </section>
  );
}

function Mechanism() {
  return (
    <div className="grid gap-px overflow-hidden rounded-xl border md:grid-cols-2" style={{ borderColor: "var(--border)", background: "var(--border)" }}>
      {[
        {
          h: "How it works today",
          body: "A lender files a lien with a registry and hopes the clerk timestamps it before anyone else's. Priority is an administrative outcome, argued after the fact, and the record lives somewhere neither party controls.",
          mark: false,
        },
        {
          h: "How it works here",
          body: "A lender sends a transaction. Its block and its index inside that block are facts the chain already committed to, and the precompile re-derives them from the proof itself. There is nothing left to argue about.",
          mark: true,
        },
      ].map((c) => (
        <div
          key={c.h}
          className="p-6"
          style={{
            background: "var(--bg-1)",
            // The side that is this product gets a rule, not brighter text.
            boxShadow: c.mark ? "inset 3px 0 0 var(--accent)" : undefined,
          }}
        >
          <h3 className="text-sm font-semibold">{c.h}</h3>
          <p className="mt-2 max-w-[52ch] text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {c.body}
          </p>
        </div>
      ))}
    </div>
  );
}

function HowItWorks() {
  // Numbered because this genuinely is a sequence — each step cannot begin before the last ends.
  const steps = [
    {
      n: 1,
      h: "A borrower posts terms",
      b: "They register a real asset — a warehouse receipt, a freight invoice — and publish how much they want across three tranches, with a rate for each.",
    },
    {
      n: 2,
      h: "Lenders race to lock",
      b: "Capital locks on Sepolia. Whoever's transaction lands earliest in the proven order takes the senior rank; anything past a tranche cap comes back in full.",
    },
    {
      n: 3,
      h: "Priority settles by proof",
      b: `Once the source block is attested — ${SETTLEMENT.attestation.minMinutes} to ${SETTLEMENT.attestation.maxMinutes} minutes, measured — the precompile verifies every lock in one call and the lien is recorded on Creditcoin.`,
    },
  ];
  return (
    <ol className="grid gap-8 md:grid-cols-3">
      {steps.map((s) => (
        <li key={s.n}>
          <div
            className="mono flex h-7 w-7 items-center justify-center rounded-full text-xs font-semibold"
            style={{ border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}
          >
            {s.n}
          </div>
          <h3 className="mt-3.5 text-sm font-semibold">{s.h}</h3>
          <p className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {s.b}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Deployed() {
  const groups = [
    { label: "Creditcoin CC3", rows: DEPLOYED.creditcoin, url: EXPLORER.creditcoinAddress },
    { label: "Ethereum Sepolia", rows: DEPLOYED.sepolia, url: EXPLORER.sepoliaAddress },
    { label: "Attestcoin precompiles", rows: DEPLOYED.precompiles, url: EXPLORER.creditcoinAddress },
  ];
  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-3">
      {groups.map((g) => (
        <div key={g.label}>
          <div className="pb-2 text-xs font-semibold">{g.label}</div>
          <dl className="flex flex-col">
            {g.rows.map((r) => (
              <div
                key={r.address}
                className="flex items-baseline justify-between gap-3 border-t py-2"
                style={{ borderColor: "var(--border)" }}
              >
                <dt className="text-[0.78rem]" style={{ color: "var(--text-muted)" }}>
                  {r.name}
                </dt>
                <dd className="mono shrink-0 text-[0.68rem]">
                  <a
                    href={g.url(r.address)}
                    target="_blank"
                    rel="noreferrer"
                    className="underline-offset-4 hover:underline"
                    style={{ color: "var(--text-faint)" }}
                  >
                    {/* A precompile's address IS its short form. Truncating 0x…0FD2 through the
                        generic middle-ellipsis produced "0x0000…0FD2", which reads as a mangled
                        hash rather than the well-known constant it is. */}
                    {/^0x0{20,}/.test(r.address)
                      ? `0x${r.address.slice(-4).toUpperCase()}`
                      : `${r.address.slice(0, 6)}…${r.address.slice(-4)}`}
                  </a>
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ))}
    </div>
  );
}

function Limits() {
  const items = [
    ["Ordering is not authenticity.", "This stops one registered claim being financed twice. It cannot tell you a custodian issued two receipts for the same physical lot — that is a different problem and this protocol does not solve it."],
    ["Proof is not instant.", `Attestation of a source block takes ${SETTLEMENT.attestation.minMinutes} to ${SETTLEMENT.attestation.maxMinutes} minutes on Sepolia, measured across ${SETTLEMENT.attestation.samples} samples. Verification is fast once the proof exists; the wait before it is real and the interface says so.`],
    ["Proof is not law.", "A court has never been asked to weigh a block index against a filing date. What this gives you is an ordering neither party can dispute, not a ruling."],
  ];
  return (
    <dl className="grid gap-7 md:grid-cols-3">
      {items.map(([h, b]) => (
        <div key={h}>
          <dt className="text-sm font-semibold">{h}</dt>
          <dd className="mt-1.5 text-sm leading-relaxed" style={{ color: "var(--text-muted)" }}>
            {b}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/* ─────────────────────────── page ─────────────────────────── */

export default function Landing() {
  const reduced = useReducedMotion();
  const rise = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <main className="relative min-h-screen" style={{ background: "var(--bg-0)" }}>
      <div className="grain" aria-hidden />

      <header className="relative z-10 mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-5">
        <Link href="/" className="flex items-center gap-2.5 rounded-lg" aria-label="PRECEDENCE home">
          <Logo size={26} />
          <span className="font-[family-name:var(--font-display)] text-sm font-bold tracking-tight">
            PRECEDENCE
          </span>
        </Link>
        {/* These were `hidden sm:inline` with no hamburger behind them, so below 640px the landing
            page had no navigation at all — only a theme toggle. They stay visible and simply wrap. */}
        <nav className="flex flex-wrap items-center justify-end gap-x-4 gap-y-1 text-[0.8rem]">
          <Link href="/collateral" className="underline-offset-4 hover:underline" style={{ color: "var(--text-muted)" }}>
            Facilities
          </Link>
          <Link href="/race" className="underline-offset-4 hover:underline" style={{ color: "var(--text-muted)" }}>
            Priority settlement
          </Link>
          <Link href="/registry" className="hidden underline-offset-4 hover:underline sm:inline" style={{ color: "var(--text-muted)" }}>
            Registry
          </Link>
          <ConnectWallet />
          <ThemeToggle />
        </nav>
      </header>

      {/* ── hero: asymmetric, left-aligned. The old page centred everything on one axis, which is
             what made it read as a title card. ── */}
      <div className="relative z-10 mx-auto grid w-full max-w-6xl items-center gap-12 px-6 pb-16 pt-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16 lg:pb-24 lg:pt-16">
        <div className="min-w-0">
          <motion.h1
            {...rise(0)}
            className="font-[family-name:var(--font-display)] text-[2.15rem] font-bold leading-[1.08] tracking-tight sm:text-5xl lg:text-[3.4rem]"
          >
            Priority goes to the transaction that landed first.
          </motion.h1>

          <motion.p
            {...rise(0.08)}
            className="mt-5 max-w-[56ch] text-base leading-relaxed"
            style={{ color: "var(--text-muted)" }}
          >
            Lenders compete to fund real-world collateral. Rank is decided by where each
            transaction actually landed in the block order — proven on Creditcoin, not asserted by
            anyone. Not by who reached a filing office first.
          </motion.p>

          <motion.div {...rise(0.16)} className="mt-8 flex flex-wrap items-center gap-3">
            <Link href="/collateral" className="btn-accent px-5 py-3 text-sm font-semibold">
              Browse facilities
            </Link>
            <Link href="/registry/new" className="btn-ghost rounded-lg px-4 py-3 text-sm font-medium">
              Register collateral
            </Link>
          </motion.div>

          <motion.p {...rise(0.24)} className="mt-6 text-xs" style={{ color: "var(--text-faint)" }}>
            Deployed on Creditcoin CC3 and Ethereum Sepolia. Every figure on this page links to a
            public explorer.
          </motion.p>
        </div>

        <motion.div {...rise(0.12)} className="min-w-0">
          <SettlementRecord />
        </motion.div>
      </div>

      <Section
        title="Two lenders, one block"
        deck="Lien priority is normally an administrative race — whoever files first, wins. That race is decided by an office, after the fact. This one is decided by the chain, at the moment it happens."
        tint
      >
        <Mechanism />
      </Section>

      <Section title="How a facility works" deck="Three steps, in order. Nothing here needs a trusted intermediary.">
        <HowItWorks />
      </Section>

      <Section title="What is deployed" deck="Live contracts on two chains, and the Attestcoin precompiles they depend on." tint>
        <Deployed />
      </Section>

      <Section title="What this does not claim" deck="The limits are part of the design, so they are stated here rather than discovered later.">
        <Limits />
      </Section>

      <footer className="border-t px-6 py-10" style={{ borderColor: "var(--border)" }}>
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <Logo size={20} />
            <span className="text-xs" style={{ color: "var(--text-muted)" }}>
              Proof-ordered capital priority
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-xs">
            {[
              { href: "/collateral", label: "Facilities" },
              { href: "/registry/new", label: "Register collateral" },
              { href: "/race", label: "Priority settlement" },
              { href: "/registry", label: "Registry" },
              { href: "/dashboard", label: "Telemetry" },
            ].map((l) => (
              <Link key={l.href} href={l.href} className="inline-flex min-h-[40px] items-center px-1 underline-offset-4 hover:underline" style={{ color: "var(--text-muted)" }}>
                {l.label}
              </Link>
            ))}
          </div>
          <p className="mono w-full text-[0.66rem]" style={{ color: "var(--text-faint)" }}>
            Testnet only. Sepolia data is simulated in this deployment; Creditcoin CC3 is live. pUSD
            is test scrip, not a stablecoin.
          </p>
        </div>
      </footer>
    </main>
  );
}
