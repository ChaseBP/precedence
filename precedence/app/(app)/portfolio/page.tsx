"use client";

/**
 * One wallet's book, on both sides.
 *
 * @remarks There is no role picker and no account record. What a wallet sees is what it holds:
 * claims make it a lender, registered collateral makes it a borrower, and both is normal. A wallet
 * with no history is not shown an empty dashboard — it is shown the two things it can actually do.
 */
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  FileText,
  Loader2,
  RotateCcw,
  ShieldCheck,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { api, type Portfolio } from "@/lib/client/api";
import { usd, pct, trancheColor, encumbranceColor } from "@/lib/client/format";
import { Badge, Card, Eyebrow, SectionTitle, Stat, Why } from "@/components/ui";
import { FadeUp, Item, Stagger } from "@/components/motion/Reveal";
import { shortAddress, useWallet } from "@/lib/client/wallet";

const ROLE_COPY: Record<Portfolio["role"], { label: string; blurb: string }> = {
  new: {
    label: "No positions yet",
    blurb:
      "This wallet holds no claims and owns no registered collateral. Both sides of the book are open to it.",
  },
  lender: {
    label: "Lender",
    blurb: "Derived from the claims this wallet holds — not from anything it told us at signup.",
  },
  borrower: {
    label: "Borrower",
    blurb: "Derived from the collateral registered to this wallet on Creditcoin CC3.",
  },
  both: {
    label: "Lender and borrower",
    blurb:
      "This wallet lends against other collateral while borrowing against its own. A role picker at signup would have got this wrong.",
  },
};

export default function PortfolioPage() {
  const { address, chainKey, status, connect } = useWallet();
  const [data, setData] = useState<Portfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!address) return;
    setError(null);
    try {
      setData(await api.portfolio(address));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [address]);

  // Fetch inside the effect so every setState lands after an await, and clear nothing on the way
  // out — a stale portfolio is filtered by address below rather than nulled synchronously.
  // Gated on `address`, not on `ready`. `ready` means "on Sepolia", but a borrower has to be on
  // Creditcoin CC3 to register collateral at all, so gating on it showed them a blank page with
  // neither data nor a spinner. Positions come from our API, so either chain is fine here.
  useEffect(() => {
    if (!address) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await api.portfolio(address);
        if (!cancelled) setData(p);
      } catch (e) {
        if (!cancelled) setError((e as Error).message);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Never show one wallet's book under another's address. Switching accounts in MetaMask fires
  // accountsChanged, and the refetch is async, so the previous result is briefly still in state.
  const shown = data && address && data.address.toLowerCase() === address.toLowerCase() ? data : null;
  const loading = Boolean(address) && !shown && !error;

  // ── not connected ──
  if (status !== "connected") {
    return (
      <FadeUp>
        <div className="mx-auto max-w-lg py-16 text-center">
          <Wallet size={30} className="mx-auto mb-4" style={{ color: "var(--text-faint)" }} />
          <h1 className="font-[family-name:var(--font-display)] text-2xl font-bold tracking-tight">
            Connect a wallet to see <span className="text-gradient">your book</span>
          </h1>
          <p className="mx-auto mt-2.5 max-w-sm text-sm" style={{ color: "var(--text-muted)" }}>
            PRECEDENCE has no accounts and no passwords. Your positions are whatever your address
            holds on-chain, so connecting is the whole of signing in.
          </p>
          <button
            onClick={connect}
            className="mt-5 rounded-lg px-4 py-2 text-xs font-semibold"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            Connect Wallet
          </button>
        </div>
      </FadeUp>
    );
  }

  const role = shown?.role ?? "new";
  const simulated = shown && !shown.live.creditcoin;

  return (
    <div>
      <FadeUp>
        <header className="mb-6">
          <Eyebrow>Positions derived from on-chain history</Eyebrow>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h1 className="font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
              Your <span className="text-gradient">Book</span>
            </h1>
            {address ? (
              <span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>
                {shortAddress(address)}
              </span>
            ) : null}
          </div>
          <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--text-muted)" }}>
            {ROLE_COPY[role].blurb}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <Badge>{ROLE_COPY[role].label}</Badge>
            {chainKey === null ? (
              <Badge color="var(--warn)">
                Wallet is on another network — positions shown, but signing needs Sepolia or CC3
              </Badge>
            ) : null}
            {simulated ? (
              <Badge color="var(--warn)">Simulated — no live registry connected</Badge>
            ) : shown ? (
              <Badge color="var(--proof-verified)">Read from Creditcoin CC3</Badge>
            ) : null}
            <button
              onClick={async () => {
                setRefreshing(true);
                await load();
                setRefreshing(false);
              }}
              disabled={refreshing}
              className="btn-ghost flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px]"
            >
              {refreshing ? <Loader2 size={12} className="animate-spin" /> : <RotateCcw size={12} />}
              Refresh
            </button>
          </div>
        </header>
      </FadeUp>

      {error ? (
        <Card>
          <p className="text-sm" style={{ color: "var(--danger)" }}>
            Could not load positions: {error}
          </p>
        </Card>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-12 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={14} className="animate-spin" /> reading positions…
        </div>
      ) : null}

      {shown ? (
        <>
          {/* ── headline numbers ── */}
          <Stagger>
            <div className="mb-7 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Item>
                <Stat label="Capital lent" value={usd(shown.totals.lentUsd)} />
              </Item>
              <Item>
                <Stat label="Blended coupon" value={pct(shown.totals.blendedRatePct, 2)} />
              </Item>
              <Item>
                <Stat label="Capital borrowed" value={usd(shown.totals.borrowedUsd)} />
              </Item>
              <Item>
                <Stat label="Returned to you" value={usd(shown.totals.refundedUsd)} />
              </Item>
            </div>
          </Stagger>

          {/* ── first-run: what brings you here ── */}
          {role === "new" ? <FirstRun /> : null}

          {/* ── lending ── */}
          {shown.lending.length > 0 ? (
            <section className="mb-8">
              <SectionTitle
                kicker="Claims held"
                title="My Lending"
                right={<span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>{shown.counts.lending} position(s)</span>}
              />
              <Why>
                Each rank below was won by a proven source-chain position, not by arriving first in
                our records — the block and transaction index shown are the ones the Attestcoin precompile
                derived from the Merkle path.
              </Why>
              <div className="mt-3 grid gap-3">
                {shown.lending.map((l) => (
                  <Card key={`${l.collateralId}-${l.tokenId}-${l.provenAt.seq}`}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className="rounded px-1.5 py-0.5 text-[10.5px] font-semibold uppercase tracking-wider"
                            style={{ background: `${trancheColor(l.tranche)}22`, color: trancheColor(l.tranche) }}
                          >
                            Rank {l.priorityRank} · {l.tranche}
                          </span>
                          <Badge color={l.state === "ACTIVE" ? "var(--proof-verified)" : undefined}>{l.state}</Badge>
                        </div>
                        <h3 className="mt-1.5 truncate text-sm font-semibold">{l.title}</h3>
                        <p className="mono mt-1 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                          proven at block {l.provenAt.blockNumber} · txIndex {l.provenAt.txIndex} · seq {l.provenAt.seq}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-[family-name:var(--font-display)] text-lg font-bold">
                          {usd(l.principalUsd)}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {pct(l.ratePct)} coupon
                        </div>
                        <Link
                          href={`/race?id=${l.raceId}`}
                          className="mono mt-1 inline-flex items-center gap-1 text-[10.5px]"
                          style={{ color: "var(--accent)" }}
                        >
                          settlement <ArrowUpRight size={10} />
                        </Link>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {/* ── refunded bids: the anti-double-financing rule, visible ── */}
          {shown.refunded.length > 0 ? (
            <section className="mb-8">
              <SectionTitle kicker="Capital returned in full" title="Outpaced bids" />
              <Why>
                A declared tranche is a preference, not an entitlement. When an earlier proven lock
                took the tranche you bid for, your capital came back — it was never quietly moved
                into subordinate risk you had not agreed to hold.
              </Why>
              <div className="mt-3 grid gap-2">
                {shown.refunded.map((r, i) => (
                  <Card key={`${r.collateralId}-${i}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <div className="min-w-0">
                        <h3 className="truncate text-sm font-semibold">{r.title}</h3>
                        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {r.reason}
                        </p>
                      </div>
                      <div className="mono shrink-0 text-sm font-semibold">{usd(r.amountUsd)}</div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}

          {/* ── borrowing ── */}
          {shown.borrowing.length > 0 ? (
            <section className="mb-8">
              <SectionTitle
                kicker="Collateral registered to this wallet"
                title="My Borrowings"
                right={<span className="mono text-[11px]" style={{ color: "var(--text-faint)" }}>{shown.counts.borrowing} facility(s)</span>}
              />
              <div className="mt-3 grid gap-3">
                {shown.borrowing.map((b) => (
                  <Card key={b.collateralId}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge color={encumbranceColor(b.status)}>{b.status}</Badge>
                          {b.termsPosted ? (
                            <Badge color="var(--proof-verified)">Terms posted</Badge>
                          ) : (
                            <Badge color="var(--warn)">No terms yet — lenders cannot bid</Badge>
                          )}
                        </div>
                        <h3 className="mt-1.5 truncate text-sm font-semibold">{b.title}</h3>
                        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
                          {b.activeClaims} active lien(s) · face {usd(b.faceValueUsd)} · max advance{" "}
                          {usd(b.maxAdvanceUsd)}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <div className="font-[family-name:var(--font-display)] text-lg font-bold">
                          {usd(b.drawnUsd)}
                        </div>
                        <div className="text-[11px]" style={{ color: "var(--text-muted)" }}>
                          drawn{b.repaidUsd > 0 ? ` · ${usd(b.repaidUsd)} repaid` : ""}
                        </div>
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** What a wallet with no history can actually do. Two doors, not an empty table. */
function FirstRun() {
  const doors = [
    {
      href: "/collateral",
      icon: TrendingUp,
      kicker: "Lend",
      title: "Browse open facilities",
      blurb:
        "Borrowers publish per-tranche caps and coupons. Pick a tranche and race for it — the earliest proven lock takes the rank.",
    },
    {
      href: "/registry/new",
      icon: FileText,
      kicker: "Borrow",
      title: "Register real-world collateral",
      blurb:
        "Upload the receipt or invoice. Terms you post become the facility lenders bid into, and the registry makes double-pledging detectable.",
    },
  ];

  return (
    <section className="mb-8">
      <SectionTitle kicker="Both sides are open to you" title="What brings you here?" />
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        {doors.map((d) => (
          <Link key={d.href} href={d.href} className="group">
            <Card>
              <d.icon size={18} style={{ color: "var(--accent)" }} />
              <Eyebrow>{d.kicker}</Eyebrow>
              <h3 className="mt-0.5 text-sm font-semibold">{d.title}</h3>
              <p className="mt-1.5 text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {d.blurb}
              </p>
              <span
                className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-medium"
                style={{ color: "var(--accent)" }}
              >
                Continue <ArrowUpRight size={11} />
              </span>
            </Card>
          </Link>
        ))}
      </div>
      <p className="mt-3 flex items-start gap-1.5 text-[11px]" style={{ color: "var(--text-faint)" }}>
        <ShieldCheck size={12} className="mt-0.5 shrink-0" />
        Nothing here asks for a private key. Locking capital is signed by your own wallet, and the
        scripted demo financiers are signed off-web by the worker.
      </p>
    </section>
  );
}
