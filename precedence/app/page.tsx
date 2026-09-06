"use client";

/**
 * The landing page.
 *
 * @remarks The claim this product makes is **spatial** — index 71 beat index 72 inside one block —
 * and prose can only report a spatial fact, never deliver one. So the page draws it. The block is
 * a vertical index axis, the winning locks are rows on that axis, and the proof pipeline is a
 * horizontal rail beneath. Everything else is caption.
 *
 * Two structural rules the previous version got wrong, both measured:
 *
 * The page had **two left margins** — header and hero at x=168, every section and the footer at
 * x=208 — because the hero used `max-w-6xl` with padding inside the max-width and the sections
 * used `max-w-5xl` with padding outside. One `Band` now owns the measure so that cannot recur.
 *
 * And its only structural device was a `--bg-0`/`--bg-1` tint alternation of about 1.5%
 * luminance, which **disappears on a projector** — leaving one 2431px column broken by four
 * hairlines. Differentiation is now carried by unequal vertical rhythm and by exactly two
 * `--border-strong` rules, neither of which a projector can flatten.
 */

import Link from "next/link";
import { motion, useReducedMotion } from "motion/react";
import { Logo } from "@/components/Logo";
import { ThemeToggle } from "@/components/ThemeToggle";
import { ConnectWallet } from "@/components/ConnectWallet";
import { SETTLEMENT, EXPLORER, DEPLOYED } from "@/lib/landing-record";
import { useAdapterTruth, chainStatusSentence } from "@/lib/client/use-adapter-truth";

const short = (h: string) => `${h.slice(0, 10)}…${h.slice(-6)}`;

/**
 * One measure for the whole page.
 *
 * @remarks The outer element carries ground, rule and rhythm and bleeds full width; the inner one
 * holds every glyph inside 64rem. `rule="strong"` is spent exactly twice — opening the figure act
 * and opening the footer — because two landmarks a projector can still resolve are worth more than
 * six it cannot.
 */
function Band({
  children,
  ground,
  rule,
  pt = "3rem",
  pb = "3rem",
  as: Tag = "section",
}: {
  children: React.ReactNode;
  ground?: "bg-0" | "bg-1";
  rule?: "hair" | "strong";
  pt?: string;
  pb?: string;
  as?: "section" | "header" | "footer" | "div";
}) {
  return (
    <Tag
      style={{
        background: ground === "bg-1" ? "var(--bg-1)" : ground === "bg-0" ? "var(--bg-0)" : undefined,
        borderTop: rule
          ? `${rule === "strong" ? 2 : 1}px solid ${rule === "strong" ? "var(--border-strong)" : "var(--border)"}`
          : undefined,
        paddingTop: pt,
        paddingBottom: pb,
      }}
      className="px-5 sm:px-6 xl:px-8"
    >
      <div className="mx-auto w-full max-w-[64rem]">{children}</div>
    </Tag>
  );
}

/* ─────────────────────────── the block ─────────────────────────── */

/**
 * The settled race, drawn on its block's index axis.
 *
 * @remarks Ghost ticks above and below the two real rows are what make the axis legible as an
 * axis: without neighbours, 71 and 72 are just two numbers. They are drawn in `--border`, never as
 * text, because `--rank-subordinate` as a label measures 3.55:1 on this surface.
 */
function BlockFigure() {
  const reduced = useReducedMotion();
  const ghosts = [69, 70];
  const trailing = [73, 74];

  return (
    <figure
      className="m-0 w-full overflow-hidden rounded-xl"
      style={{ border: "1px solid var(--border-strong)", background: "var(--bg-1)" }}
    >
      <figcaption
        className="flex items-baseline justify-between gap-3 border-b px-5 py-3"
        style={{ borderColor: "var(--border)" }}
      >
        <span className="mono text-[0.6875rem] uppercase tracking-[0.14em]" style={{ color: "var(--text-muted)" }}>
          Settlement record
        </span>
        {/* The word carries --text-muted and the state is carried by the dot. Emerald as small
            text measures 3.77:1 in light; as a 6px mark against the same ground it is a non-text
            element at 3.77:1, which is above the 3:1 that applies to one. */}
        <span className="flex items-center gap-1.5">
          <span
            aria-hidden
            className="inline-block h-1.5 w-1.5 rounded-full"
            style={{ background: "var(--proof-verified)" }}
          />
          <span className="mono text-[0.6875rem]" style={{ color: "var(--text-muted)" }}>
            verified
          </span>
        </span>
      </figcaption>

      <div className="px-5 pt-4 text-[0.8125rem]" style={{ color: "var(--text-muted)" }}>
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

      {/* the index axis */}
      <div className="px-5 pb-1 pt-3">
        {ghosts.map((n) => (
          <GhostTick key={n} n={n} />
        ))}

        {SETTLEMENT.locks.map((l, i) => (
          <motion.a
            key={l.txHash}
            href={EXPLORER.sepoliaTx(l.txHash)}
            target="_blank"
            rel="noreferrer"
            // Moment one of two on this page: the winning rows arrive in their proven order.
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: reduced ? 0 : 0.45 + i * 0.45, ease: [0.16, 1, 0.3, 1] }}
            className="group grid grid-cols-[3.25rem_1fr_auto] items-center gap-x-4 rounded-lg px-3 py-2.5 transition-colors"
            style={{
              background: "var(--bg-2)",
              boxShadow: `inset 3px 0 0 var(--rank-${l.tranche.toLowerCase()})`,
              marginBottom: "0.375rem",
            }}
          >
            {/* 20px/700 makes this "large text", where --accent on --bg-2 needs 3:1 and measures
                4.36:1. At 18px/600 it was small text needing 4.5:1 and failed. */}
            <span
              className="mono text-xl font-bold tabular-nums"
              style={{ color: "var(--accent)" }}
              title={`transaction index ${l.txIndex}`}
            >
              {l.txIndex}
            </span>
            <span className="min-w-0">
              <span
                className="mono block text-[0.7rem] uppercase tracking-wider"
                style={{ color: `var(--rank-${l.tranche.toLowerCase()})` }}
              >
                {l.tranche}
              </span>
              {/* --text-faint measures 4.37:1 on --bg-2 in light; --text-muted is 5.62:1. */}
              <span className="mono block truncate text-[0.6875rem]" style={{ color: "var(--text-muted)" }}>
                {short(l.txHash)}
              </span>
            </span>
            <span className="mono text-right text-sm font-semibold tabular-nums">{l.amount}</span>
          </motion.a>
        ))}

        {trailing.map((n) => (
          <GhostTick key={n} n={n} />
        ))}
      </div>

      <div
        className="border-t px-5 py-3.5 text-[0.75rem] leading-relaxed"
        style={{ borderColor: "var(--border)", color: "var(--text-muted)" }}
      >
        One block. The index is the only thing separating them, and it is what decides who is
        senior.
      </div>
    </figure>
  );
}

/** An index position with nothing in it — the neighbours that make the axis read as an axis. */
function GhostTick({ n }: { n: number }) {
  return (
    <div className="grid grid-cols-[3.25rem_1fr] items-center gap-x-4 px-3 py-1" aria-hidden>
      <span className="mono text-[0.6875rem] tabular-nums" style={{ color: "var(--text-faint)" }}>
        {n}
      </span>
      <span className="h-px w-full" style={{ background: "var(--border)" }} />
    </div>
  );
}

/* ─────────────────────────── the proof rail ─────────────────────────── */

/**
 * What happens after the block, drawn to scale.
 *
 * @remarks The attestation is a **segment with width**, not a dot, because the six-to-nine minute
 * wait is the one part of this pipeline a reader consistently misreads as instant. Geometry states
 * it without a sentence having to.
 */
function ProofRail() {
  const reduced = useReducedMotion();
  const a = SETTLEMENT.attestation;
  return (
    <div className="w-full">
      <div className="flex items-end justify-between gap-4 pb-2 text-[0.6875rem]" style={{ color: "var(--text-muted)" }}>
        <span>Lock lands on Sepolia</span>
        <span className="mono">
          attestation · {a.minMinutes}–{a.maxMinutes} min, measured
        </span>
        <span>Proven on Creditcoin</span>
      </div>
      <div className="relative h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--bg-2)" }}>
        {/* Moment two of two: the wait draws itself once, the first time it is seen. */}
        <motion.span
          className="absolute inset-y-0 left-[12%] block rounded-full"
          style={{ width: "62%", background: "var(--proof-pending)", transformOrigin: "left" }}
          initial={reduced ? false : { scaleX: 0 }}
          whileInView={{ scaleX: 1 }}
          viewport={{ once: true, amount: 0.5 }}
          transition={{ duration: 0.7, ease: "easeOut" }}
        />
        <span className="absolute inset-y-0 left-0 block w-[3px] rounded-full" style={{ background: "var(--accent)" }} />
        <span
          className="absolute inset-y-0 right-0 block w-[3px] rounded-full"
          style={{ background: "var(--proof-verified)" }}
        />
      </div>
      <p className="mt-2 text-[0.75rem]" style={{ color: "var(--text-faint)" }}>
        Verification is one Creditcoin transaction once the proof exists. The wait before it is the
        source block being attested, and it is real.
      </p>
    </div>
  );
}

/* ─────────────────────────── sections ─────────────────────────── */

function Heading({ title, deck }: { title: string; deck?: string }) {
  return (
    <>
      <h2 className="font-[family-name:var(--font-display)] text-[1.75rem] font-semibold tracking-tight">
        {title}
      </h2>
      {deck ? (
        <p className="mt-2.5 max-w-[62ch] text-[0.95rem] leading-[1.65]" style={{ color: "var(--text-muted)" }}>
          {deck}
        </p>
      ) : null}
    </>
  );
}

/** Asymmetric on purpose: the split is the argument, and it survives a projector where tint does not. */
function Mechanism() {
  return (
    <div className="grid overflow-hidden rounded-xl md:grid-cols-[42fr_58fr]" style={{ border: "1px solid var(--border)" }}>
      <div className="p-6" style={{ background: "var(--bg-0)" }}>
        <h3 className="text-sm font-semibold" style={{ color: "var(--text-muted)" }}>
          How it works today
        </h3>
        <p className="mt-2 max-w-[52ch] text-[0.875rem] leading-[1.7]" style={{ color: "var(--text-muted)" }}>
          A lender files a lien with a registry and hopes the clerk timestamps it before anyone
          else&apos;s. Priority is an administrative outcome, argued after the fact, and the record
          lives somewhere neither party controls.
        </p>
      </div>
      <div className="p-6" style={{ background: "var(--bg-1)", boxShadow: "inset 3px 0 0 var(--accent)" }}>
        <h3 className="text-sm font-semibold">How it works here</h3>
        <p className="mt-2 max-w-[52ch] text-[0.875rem] leading-[1.7]" style={{ color: "var(--text-muted)" }}>
          A lender sends a transaction. Its block and its index inside that block are facts the
          chain already committed to, and the precompile re-derives them from the proof itself.
          There is nothing left to argue about.
        </p>
      </div>
    </div>
  );
}

/** The one legitimate sequence on the page, so the only place a number marker is earned. */
function HowItWorks() {
  const steps = [
    ["A borrower posts terms", "They register a real asset — a warehouse receipt, a freight invoice — and publish how much they want across three tranches, with a rate for each."],
    ["Lenders race to lock", "Capital locks on Sepolia. Whoever's transaction lands earliest in the proven order takes the senior rank; anything past a tranche cap comes back in full."],
    ["Priority settles by proof", `Once the source block is attested — ${SETTLEMENT.attestation.minMinutes} to ${SETTLEMENT.attestation.maxMinutes} minutes, measured — the precompile verifies every lock in one call and the lien is recorded.`],
  ];
  return (
    <ol className="grid gap-x-8 gap-y-8 md:grid-cols-3">
      {steps.map(([h, b], i) => (
        <li key={h} className="relative pt-5" style={{ borderTop: "1px solid var(--border)" }}>
          <span
            className="mono absolute -top-[0.7rem] left-0 flex h-[1.4rem] w-[1.4rem] items-center justify-center rounded-full text-[0.6875rem] font-semibold"
            style={{ background: "var(--bg-1)", border: "1px solid var(--border-strong)", color: "var(--text-muted)" }}
          >
            {i + 1}
          </span>
          <h3 className="text-sm font-semibold">{h}</h3>
          <p className="mt-1.5 max-w-[46ch] text-[0.875rem] leading-[1.7]" style={{ color: "var(--text-muted)" }}>
            {b}
          </p>
        </li>
      ))}
    </ol>
  );
}

function Deployed({ truth }: { truth: ReturnType<typeof useAdapterTruth> }) {
  const Row = ({ name, address, href }: { name: string; address: string; href: string }) => (
    <div className="flex items-baseline justify-between gap-3 border-t py-2" style={{ borderColor: "var(--border)" }}>
      <dt className="text-[0.8125rem]" style={{ color: "var(--text-muted)" }}>
        {name}
      </dt>
      <dd className="mono shrink-0 text-[0.6875rem]">
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
          style={{ color: "var(--text-muted)" }}
        >
          {/^0x0{20,}/.test(address) ? `0x${address.slice(-4).toUpperCase()}` : `${address.slice(0, 6)}…${address.slice(-4)}`}
        </a>
      </dd>
    </div>
  );

  return (
    <div className="grid gap-x-10 gap-y-8 md:grid-cols-[38fr_62fr]">
      <div>
        <div className="pb-1 text-xs font-semibold">Creditcoin CC3</div>
        <dl>
          {DEPLOYED.creditcoin.map((r) => (
            <Row key={r.address} name={r.name} address={r.address} href={EXPLORER.creditcoinAddress(r.address)} />
          ))}
        </dl>
      </div>

      <div className="grid gap-x-10 gap-y-7 sm:grid-cols-2">
        <div>
          <div className="pb-1 text-xs font-semibold">Ethereum Sepolia</div>
          <dl>
            {DEPLOYED.sepolia.map((r) => (
              <Row key={r.address} name={r.name} address={r.address} href={EXPLORER.sepoliaAddress(r.address)} />
            ))}
          </dl>
          <div className="pb-1 pt-6 text-xs font-semibold">Attestcoin precompiles</div>
          <dl>
            {DEPLOYED.precompiles.map((r) => (
              <Row key={r.address} name={r.name} address={r.address} href={EXPLORER.creditcoinAddress(r.address)} />
            ))}
          </dl>
        </div>

        {/* Where a "trusted by" row would go. This project has no logos to show and will not
            invent any, so the space carries the only credibility it can honestly offer: what was
            measured, and how many times. */}
        <div className="rounded-xl p-4" style={{ border: "1px solid var(--border)", background: "var(--bg-1)" }}>
          <div className="text-xs font-semibold">Measured, not claimed</div>
          <dl className="mt-2.5 flex flex-col gap-1.5 text-[0.8125rem]">
            {[
              ["Attestation latency", `${SETTLEMENT.attestation.minMinutes}–${SETTLEMENT.attestation.maxMinutes} min`],
              ["Median", `${SETTLEMENT.attestation.p50Minutes} min`],
              ["Samples", String(SETTLEMENT.attestation.samples)],
              ["Locks returned in full", String(SETTLEMENT.refunded)],
            ].map(([k, v]) => (
              <div key={k} className="flex items-baseline justify-between gap-3">
                <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
                <dd className="mono tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          {/* Derived, never typed. This sentence was authored as prose and became false the
              moment Sepolia went live — a untrue statement in the credibility block of the front
              page. It now reads the adapters. */}
          <p className="mt-3 text-[0.75rem] leading-relaxed" style={{ color: "var(--text-muted)" }}>
            Not audited. {chainStatusSentence(truth)}
          </p>
        </div>
      </div>
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
    <dl className="grid gap-x-8 gap-y-7 md:grid-cols-3">
      {items.map(([h, b]) => (
        <div key={h}>
          <dt className="text-sm font-semibold">{h}</dt>
          <dd className="mt-1.5 max-w-[46ch] text-[0.875rem] leading-[1.7]" style={{ color: "var(--text-muted)" }}>
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
  const truth = useAdapterTruth();
  const rise = (delay: number) =>
    reduced
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.5, delay, ease: [0.16, 1, 0.3, 1] as const },
        };

  return (
    <main style={{ background: "var(--bg-0)" }}>
      <div className="grain" aria-hidden />

      <Band as="header" ground="bg-1" pt="1rem" pb="1rem">
        {/* Two deliberate rows below 640px, not three ragged ones. Letting the whole bar wrap put
            the links above the wordmark and the wallet below it — three rows on different
            baselines. The brand and the controls hold one row; the links take their own. */}
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
          <div className="flex items-center justify-between gap-4">
            <Link href="/" className="flex shrink-0 items-center gap-2.5" aria-label="PRECEDENCE home">
              <Logo size={26} />
              <span className="font-[family-name:var(--font-display)] text-sm font-bold tracking-tight">
                PRECEDENCE
              </span>
            </Link>
            <span className="flex items-center gap-1.5 sm:hidden">
              <ConnectWallet variant="ghost" />
              <ThemeToggle />
            </span>
          </div>
          <nav className="-mx-2 flex items-center gap-x-1 overflow-x-auto no-scrollbar sm:mx-0 sm:justify-end">
            {[
              { href: "/collateral", label: "Facilities" },
              { href: "/race", label: "Priority settlement" },
              { href: "/registry", label: "Registry" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex min-h-[40px] shrink-0 items-center whitespace-nowrap rounded-lg px-2 text-[0.8125rem] underline-offset-4 hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                {l.label}
              </Link>
            ))}
            {/* Ghost here on purpose. As a solid it was the only filled object on the page and
                outranked the hero's own call to action. */}
            <span className="ml-1 hidden items-center gap-1.5 sm:flex">
              <ConnectWallet variant="ghost" />
              <ThemeToggle />
            </span>
          </nav>
        </div>
      </Band>

      <Band ground="bg-1" pt="3rem" pb="4rem">
        <div className="grid items-start gap-10 lg:grid-cols-[1fr_1.05fr] lg:gap-12">
          <motion.div {...rise(0)} className="min-w-0">
            <h1
              className="font-[family-name:var(--font-display)] font-bold tracking-tight"
              style={{ fontSize: "clamp(2.15rem, 1.2rem + 3.2vw, 3.4rem)", lineHeight: 1.06 }}
            >
              Priority goes to the transaction that landed first.
            </h1>
            <p className="mt-5 max-w-[56ch] text-[0.95rem] leading-[1.7]" style={{ color: "var(--text-muted)" }}>
              Lenders compete to fund real-world collateral. Rank is decided by where each
              transaction actually landed in the block order — proven on Creditcoin, not asserted by
              anyone. Not by who reached a filing office first.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/collateral" className="btn-primary inline-flex min-h-[44px] items-center px-5 text-sm font-semibold">
                Browse facilities
              </Link>
              <Link href="/registry/new" className="btn-ghost inline-flex min-h-[44px] items-center rounded-lg px-4 text-sm font-medium">
                Register collateral
              </Link>
            </div>
            <p className="mt-6 max-w-[56ch] text-[0.75rem]" style={{ color: "var(--text-muted)" }}>
              Deployed on Creditcoin CC3 and Ethereum Sepolia. Every figure on this page links to a
              public explorer.
            </p>
          </motion.div>

          <motion.div {...rise(0.1)} className="min-w-0">
            <BlockFigure />
          </motion.div>
        </div>

        {/* Spans the measure, so the band has a floor instead of a dead quadrant under the figure. */}
        <div className="mt-12">
          <ProofRail />
        </div>
      </Band>

      <Band ground="bg-0" rule="hair" pt="4rem" pb="4rem">
        <Heading
          title="Two lenders, one block"
          deck="Lien priority is normally an administrative race — whoever files first, wins. That race is decided by an office, after the fact. This one is decided by the chain, at the moment it happens."
        />
        <div className="mt-8">
          <Mechanism />
        </div>
      </Band>

      <Band ground="bg-1" rule="strong" pt="6rem" pb="6rem">
        <Heading title="How a facility works" deck="Three steps, in order. Nothing here needs a trusted intermediary." />
        <div className="mt-10">
          <HowItWorks />
        </div>
      </Band>

      <Band ground="bg-0" rule="hair" pt="4rem" pb="4rem">
        <Heading title="What is deployed" deck="Live contracts on two chains, and the Attestcoin precompiles they depend on." />
        <div className="mt-8">
          <Deployed truth={truth} />
        </div>
      </Band>

      <Band ground="bg-0" rule="hair" pt="3rem" pb="4rem">
        <Heading
          title="What this does not claim"
          deck="The limits are part of the design, so they are stated here rather than discovered later."
        />
        <div className="mt-8">
          <Limits />
        </div>
      </Band>

      <Band as="footer" ground="bg-1" rule="strong" pt="3rem" pb="3rem">
        <div className="grid items-start gap-x-10 gap-y-8 md:grid-cols-[1fr_auto]">
          <div className="min-w-0">
            <div className="flex items-center gap-2.5">
              <Logo size={20} />
              <span className="text-xs" style={{ color: "var(--text-muted)" }}>
                Proof-ordered capital priority
              </span>
            </div>
            {/* A footer whose own content is verification. These three are the whole claim, and
                each one resolves on a public explorer. */}
            <dl className="mt-4 flex flex-col gap-1.5 text-[0.75rem]">
              {[
                ["Source block", String(SETTLEMENT.block), EXPLORER.sepoliaBlock(SETTLEMENT.block)],
                ["Settled on Creditcoin", String(SETTLEMENT.settledOn.block), EXPLORER.creditcoinBlock(SETTLEMENT.settledOn.block)],
                ["Verifier precompile", "0x0FD2", EXPLORER.creditcoinAddress(DEPLOYED.precompiles[0].address)],
              ].map(([k, v, href]) => (
                <div key={k} className="flex items-baseline gap-2">
                  <dt style={{ color: "var(--text-muted)" }}>{k}</dt>
                  <dd className="mono">
                    <a
                      href={href}
                      target="_blank"
                      rel="noreferrer"
                      className="underline decoration-dotted underline-offset-4 hover:decoration-solid"
                      style={{ color: "var(--text-muted)" }}
                    >
                      {v}
                    </a>
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          <nav className="-mx-2 flex flex-wrap items-center gap-x-1 gap-y-0 text-[0.8125rem] md:-mr-2 md:ml-0 md:justify-end">
            {[
              { href: "/collateral", label: "Facilities" },
              { href: "/registry/new", label: "Register collateral" },
              { href: "/race", label: "Priority settlement" },
              { href: "/registry", label: "Registry" },
              { href: "/dashboard", label: "Telemetry" },
            ].map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className="inline-flex min-h-[40px] items-center rounded-lg px-2 underline-offset-4 hover:underline"
                style={{ color: "var(--text-muted)" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
        </div>

        {/* Promoted from 0.66rem. This is the honesty statement, not fine print. */}
        <p className="mt-8 max-w-[70ch] text-[0.75rem] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          {chainStatusSentence(truth)} pUSD is test scrip, not a stablecoin.
        </p>
      </Band>
    </main>
  );
}
