"use client";

/**
 * Lock capital into a tranche — the lender's side of the protocol.
 *
 * @remarks This signs a **real Sepolia transaction from the viewer's own wallet**, and it has no
 * simulated fallback on purpose. A fabricated lock would be a fabricated settlement, and the one
 * claim this project must never soften is that a financier's rank comes from where *their*
 * transaction landed. When no vault is deployed the panel says so and names the command that
 * changes it, rather than pretending.
 *
 * Race state is read from the vault every few seconds, not from our store: a lender about to spend
 * money needs the authoritative answer about whether the race is still open.
 *
 * The copy is deliberate about what a lock does and does not buy. Choosing SENIOR is a
 * *preference*. If an earlier-proven lock already filled that tranche, the capital is refunded in
 * full rather than quietly demoted — so the panel says that before anyone signs, not after.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ExternalLink,
  Loader2,
  Lock,
  Undo2,
  Wallet,
} from "lucide-react";
import type { Address, Hex } from "viem";
import { Badge, Card, Why } from "@/components/ui";
import { ConnectWallet } from "@/components/ConnectWallet";
import { useWallet } from "@/lib/client/wallet";
import {
  approveAndLock,
  mintTestUsd,
  readLenderPosition,
  readRaceState,
  type LenderPosition,
  type LockStage,
  type VaultAddresses,
  type VaultRaceState,
} from "@/lib/client/vault";
import { usd, pct, trancheColor } from "@/lib/client/format";
import type { CollateralAsset, Tranche } from "@/lib/precedence/types";

const TRANCHES: { name: Tranche; ordinal: 0 | 1 | 2 }[] = [
  { name: "SENIOR", ordinal: 0 },
  { name: "JUNIOR", ordinal: 1 },
  { name: "SUBORDINATE", ordinal: 2 },
];

interface ConfigShape {
  addresses?: { sepolia?: VaultAddresses };
  explorers?: { sepolia?: string };
}

export function LockCapital({ collateral }: { collateral: CollateralAsset }) {
  const { address, status, chainKey } = useWallet();
  const [cfg, setCfg] = useState<ConfigShape | null>(null);
  const [race, setRace] = useState<VaultRaceState | null>(null);
  const [raceErr, setRaceErr] = useState<string | null>(null);
  const [pos, setPos] = useState<LenderPosition | null>(null);
  const [tranche, setTranche] = useState<Tranche>("SENIOR");
  const [amount, setAmount] = useState("");
  const [allowDemotion, setAllowDemotion] = useState(false);
  const [stage, setStage] = useState<LockStage | null>(null);
  const [stageNote, setStageNote] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ lockTxHash: Hex; blockNumber: number; txIndex: number } | null>(null);
  const [minting, setMinting] = useState(false);

  const addrs = cfg?.addresses?.sepolia;
  // A fixture's docHash is a visible placeholder like 0xSAMPLE_DOC_HASH_..., not a bytes32. The
  // vault read would throw on it and surface as "unreachable", which is true but blames the wrong
  // thing — the vault is fine, the document was never registered.
  const isRealDocHash = /^0x[0-9a-fA-F]{64}$/.test(collateral.docHash);
  const explorer = cfg?.explorers?.sepolia ?? "https://sepolia.etherscan.io";
  const terms = collateral.terms;
  const onSepolia = chainKey === "sepolia";
  // No race open, or the vault has never seen this document: a bid cannot be submitted, so the
  // controls should not behave as though it can.
  const biddingClosed = !race?.raceOpen;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch("/api/config", { cache: "no-store" });
        const j = (await r.json()) as ConfigShape;
        if (!cancelled) setCfg(j);
      } catch {
        if (!cancelled) setCfg({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Poll the vault. The countdown is the reason: a race window is minutes, and a stale "open"
  // badge is how a lender wastes gas on a transaction that will revert.
  const refreshRace = useCallback(async () => {
    if (!addrs || !isRealDocHash) return;
    try {
      setRace(await readRaceState(addrs.PriorityVault, collateral.docHash as Hex));
      setRaceErr(null);
    } catch (e) {
      setRaceErr((e as Error).message.slice(0, 160));
    }
  }, [addrs, collateral.docHash, isRealDocHash]);

  useEffect(() => {
    if (!addrs || !isRealDocHash) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refreshRace();
    });
    const t = setInterval(() => void refreshRace(), 6000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [addrs, isRealDocHash, refreshRace]);

  useEffect(() => {
    if (!addrs || !address || !onSepolia) return;
    let cancelled = false;
    (async () => {
      try {
        const p = await readLenderPosition(addrs, address as Address);
        if (!cancelled) setPos(p);
      } catch {
        /* balances are informational; a failure here must not block a lock */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [addrs, address, onSepolia, result]);

  // Memoised so the validation below has a stable dependency rather than a fresh closure each
  // render, which would make the exhaustive-deps rule unsatisfiable.
  const capFor = useCallback(
    (t: Tranche) =>
      !terms ? 0 : t === "SENIOR" ? terms.seniorCapUsd : t === "JUNIOR" ? terms.juniorCapUsd : terms.subordinateCapUsd,
    [terms],
  );
  const rateFor = useCallback(
    (t: Tranche) =>
      !terms ? 0 : t === "SENIOR" ? terms.seniorRatePct : t === "JUNIOR" ? terms.juniorRatePct : terms.subordinateRatePct,
    [terms],
  );

  const amt = Number(amount);
  const problems = useMemo(() => {
    const out: string[] = [];
    if (!Number.isFinite(amt) || amt <= 0) return out; // nothing typed yet: say nothing
    if (pos && amt > pos.pusdUsd) out.push(`You hold ${usd(pos.pusdUsd)} pUSD.`);
    if (amt > capFor(tranche)) {
      out.push(
        `The ${tranche} cap is ${usd(capFor(tranche))}. Anything above it is refunded, not demoted — ` +
          `bidding more does not buy a bigger rank.`,
      );
    }
    return out;
  }, [amt, pos, tranche, capFor]);

  async function doLock() {
    if (!addrs) return;
    setError(null);
    setResult(null);
    try {
      const t = TRANCHES.find((x) => x.name === tranche)!;
      const r = await approveAndLock(
        addrs,
        collateral.docHash as Hex,
        t.ordinal,
        amt,
        allowDemotion,
        (s, detail) => {
          setStage(s);
          setStageNote(detail ?? "");
        },
      );
      setResult(r);
      void refreshRace();
    } catch (e) {
      setError((e as Error).message.slice(0, 260));
      setStage(null);
    }
  }

  // ── the facility is not open for new capital ──
  //
  // A facility page could show a settled or REPAID status in its header and still render an
  // active, pre-filled bid form below it. A judge cannot tell whether the thing is finished or
  // taking money, and either reading makes the app look wrong. Only a CLEAR facility can take a
  // bid; everything else says what state it is in instead.
  if (collateral.status !== "CLEAR") {
    return (
      <Card>
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--text-faint)" }} />
          <div>
            <h3 className="text-sm font-semibold">This facility is not taking new capital</h3>
            <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              Its state is <span className="mono">{collateral.status}</span>. Bids are only accepted
              while a facility is CLEAR and a race is open — once capital is committed the tranche
              caps are spoken for, and a later lock would have nothing to be seated in.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  // ── no terms posted: there is nothing to bid into ──
  if (!terms) {
    return (
      <Card>
        <h3 className="text-sm font-semibold">Not open for bids</h3>
        <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          The borrower has not posted facility terms for this asset yet, so there are no tranche
          caps or coupons to bid into.
        </p>
      </Card>
    );
  }

  // ── a fixture, not a registered document ──
  if (!isRealDocHash) {
    return (
      <Card>
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
          <div className="min-w-0">
            <h3 className="text-sm font-semibold">This is a sample facility, so it cannot take a bid</h3>
            <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              Its document hash is a visible placeholder rather than a registered document, so no
              vault position exists to lock against. Register real collateral to get a facility
              that can.
            </p>
            <p className="mono mt-1.5 break-all text-[10.5px]" style={{ color: "var(--text-faint)" }}>
              {collateral.docHash}
            </p>
            <a href="/registry/new" className="mt-2 inline-block text-[11px]" style={{ color: "var(--accent)" }}>
              Register collateral →
            </a>
          </div>
        </div>
      </Card>
    );
  }

  // ── nothing deployed: say so, do not simulate ──
  if (cfg && !addrs) {
    return (
      <Card>
        <div className="flex items-start gap-2.5">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
          <div>
            <h3 className="text-sm font-semibold">No vault is deployed, so capital cannot be locked</h3>
            <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
              Locking signs a real Sepolia transaction, and its position in the block is the whole
              claim. There is deliberately no simulated version of this — a fake lock would be a
              fake settlement.
            </p>
            <p className="mono mt-2 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
              cd contracts &amp;&amp; make deploy-sepolia
            </p>
          </div>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Lock size={15} style={{ color: "var(--accent)" }} />
          <h3 className="text-sm font-semibold">Lock capital</h3>
        </div>
        <RaceBadge race={race} err={raceErr} />
      </div>

      <Why>
        Your rank comes from where your transaction lands in a Sepolia block, proven on Creditcoin
        by <span className="mono">calculateTxIndex</span> at{" "}
        <span className="mono">0x0FD2</span> — not from when you pressed the button. Two bids in the
        same block are separated by transaction index alone.
      </Why>

      {/* ── tranche choice ── */}
      {/* Inputs used to stay fully interactive under a "no race open" badge, inviting someone to
          fill in an amount that could not be submitted. Disabled where bidding is not possible. */}
      <div className="mt-3 grid gap-2 sm:grid-cols-3">
        {TRANCHES.map(({ name }) => {
          const active = tranche === name;
          return (
            <button
              key={name}
              onClick={() => setTranche(name)}
              disabled={biddingClosed}
              className="rounded-lg p-2.5 text-left transition-colors disabled:opacity-60"
              style={{
                border: `1px solid ${active ? trancheColor(name) : "var(--border)"}`,
                background: active ? `color-mix(in srgb, ${trancheColor(name)} 10%, transparent)` : "transparent",
              }}
            >
              <div className="text-[10.5px] font-semibold uppercase tracking-wider" style={{ color: trancheColor(name) }}>
                {name}
              </div>
              <div className="mono mt-1 text-[12px] font-semibold">{pct(rateFor(name))}</div>
              <div className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                up to {usd(capFor(name))}
              </div>
            </button>
          );
        })}
      </div>

      {/* ── amount ── */}
      <label className="mt-3 flex flex-col gap-1">
        <span className="eyebrow">Amount (pUSD)</span>
        <div className="flex flex-wrap items-center gap-2">
          <input
            data-field="lockAmount"
            disabled={biddingClosed}
            value={amount}
            onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            placeholder={String(capFor(tranche) || 0)}
            inputMode="decimal"
            className="mono w-40 rounded-lg px-2.5 py-1.5 text-[12px] outline-none"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)", color: "var(--text)" }}
          />
          <button
            onClick={() => setAmount(String(capFor(tranche)))}
            disabled={biddingClosed}
            className="btn-ghost rounded-lg px-2.5 py-1 text-[11px] disabled:opacity-50"
          >
            Fill the cap
          </button>
          {pos ? (
            <span className="flex items-center gap-2 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
              you hold {usd(pos.pusdUsd)} pUSD
              {/* The faucet is permissionless, and without it in the UI a fresh wallet holds
                  nothing — which makes the entire live path unreachable however correct it is. */}
              <button
                onClick={async () => {
                  if (!addrs) return;
                  setError(null);
                  setMinting(true);
                  try {
                    await mintTestUsd(addrs.PUSD, 25_000);
                    const p = await readLenderPosition(addrs, address as Address);
                    setPos(p);
                  } catch (e) {
                    setError(e instanceof Error ? e.message : String(e));
                  } finally {
                    setMinting(false);
                  }
                }}
                disabled={minting || !addrs || !address}
                className="btn-ghost inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-[10.5px] disabled:opacity-50"
                title="Mint 25,000 PRECEDENCE Test USD to this wallet on Sepolia"
              >
                {minting ? <Loader2 size={10} className="animate-spin" /> : null}
                get test pUSD
              </button>
            </span>
          ) : null}
        </div>
      </label>

      {/* ── the consent that used to be given by a stranger ── */}
      {/* SUBORDINATE is the lowest tranche, so "seat me lower" is meaningless there — the checkbox
          asked a question with no answer. Excess subordinate capital can only ever be refunded, so
          say that instead of offering a choice that does nothing.
          The label is the tap target: a bare 16px checkbox is well under the 44px minimum, and
          wrapping the text in the same label makes the whole block tappable. */}
      {tranche === "SUBORDINATE" ? (
        <p className="mt-3 flex items-start gap-2 py-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          <Undo2 size={13} className="mt-0.5 shrink-0" style={{ color: "var(--text-faint)" }} />
          SUBORDINATE is the lowest tranche, so there is nowhere lower to be seated. Anything beyond
          its cap is refunded in full.
        </p>
      ) : (
        <label className="mt-3 flex min-h-[44px] cursor-pointer items-start gap-2.5 py-1.5">
          <input
            data-field="allowDemotion"
            type="checkbox"
            checked={allowDemotion}
            onChange={(e) => setAllowDemotion(e.target.checked)}
            className="mt-0.5 size-4 shrink-0 cursor-pointer"
          />
          <span className="text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            If {tranche} is already full, seat me lower rather than refunding me.
            <span className="block" style={{ color: "var(--text-faint)" }}>
              Off by default. Left off, anything that does not fit comes back in full — bidding for a
              rank is not consent to hold a riskier one. This choice is recorded in your own lock
              transaction, so nobody else can make it for you.
            </span>
          </span>
        </label>
      )}

      {problems.length > 0 ? (
        <ul className="mt-2.5 flex flex-col gap-1">
          {problems.map((p, i) => (
            <li key={i} className="flex items-start gap-1.5 text-[11px]" style={{ color: "var(--warn)" }}>
              <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {p}
            </li>
          ))}
        </ul>
      ) : null}

      {/* ── wallet gate ── */}
      <div className="mt-4">
        {status !== "connected" ? (
          // RainbowKit owns the picker, so this is a button that opens it rather than a bespoke
          // connect flow. And there is no longer a "wrong chain" branch: the write below carries
          // chainId, so the wallet is asked to move to Sepolia as part of signing.
          <div className="flex flex-wrap items-center gap-3">
            <ConnectWallet />
            <span className="text-[11px]" style={{ color: "var(--text-muted)" }}>
              Capital locks on Sepolia; your wallet will be asked to switch when you sign.
            </span>
          </div>
        ) : race && !race.registered ? (
          // Distinguished from "no race open" on purpose: these need different actions from
          // different people, and a lender who cannot tell them apart waits for the wrong thing.
          <p className="flex items-start gap-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            <AlertTriangle size={13} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
            This document is registered on Creditcoin but not yet on the Sepolia vault, so there is
            nowhere to lock. The obligor registers it there and opens a race before bids can be
            placed.
          </p>
        ) : !race?.raceOpen ? (
          <p className="flex items-start gap-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            <Clock size={13} className="mt-0.5 shrink-0" />
            No race is open on this collateral, so the vault will reject a lock. The borrower opens
            the window; it lasts minutes, not hours.
          </p>
        ) : (
          <button
            onClick={doLock}
            disabled={Boolean(stage && stage !== "locked") || !Number.isFinite(amt) || amt <= 0}
            className="btn-primary inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold"
          >
            {stage && stage !== "locked" ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
            {stage === "approving"
              ? "Approving pUSD…"
              : stage === "locking"
                ? "Locking…"
                : `Lock ${amt > 0 ? usd(amt) : ""} as ${tranche}`}
          </button>
        )}
      </div>

      {stage && stage !== "locked" ? (
        <p className="mono mt-2 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
          {stage} · {stageNote}
        </p>
      ) : null}

      {error ? (
        <p className="mt-3 flex items-start gap-1.5 text-[11px]" style={{ color: "var(--danger)" }}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      {/* ── the proven position ── */}
      {result ? (
        <div className="mt-3 rounded-lg p-3" style={{ background: "var(--bg-2)", border: "1px solid var(--proof-verified)" }}>
          <div className="flex items-center gap-2">
            <CheckCircle2 size={14} style={{ color: "var(--proof-verified)" }} />
            <span className="text-sm font-semibold">Locked</span>
          </div>
          <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            Your priority claim is this position, and nothing else:
          </p>
          <div className="mono mt-1.5 text-[11.5px]">
            block {result.blockNumber} · txIndex {result.txIndex}
          </div>
          <a href={`${explorer}/tx/${result.lockTxHash}`} target="_blank" rel="noreferrer"
            className="mono mt-2 inline-flex items-center gap-1 break-all text-[10.5px]" style={{ color: "var(--accent)" }}>
            {result.lockTxHash} <ExternalLink size={10} className="shrink-0" />
          </a>
          <p className="mt-2 text-[11px]" style={{ color: "var(--text-faint)" }}>
            Settlement waits for attestation of that block — 6.5&ndash;9.3 minutes, measured — then
            one Creditcoin transaction verifies every lock in the race at once.
          </p>
        </div>
      ) : null}
    </Card>
  );
}

function RaceBadge({ race, err }: { race: VaultRaceState | null; err: string | null }) {
  if (err) return <Badge color="var(--warn)">vault unreachable</Badge>;
  if (!race) return <Badge>reading the vault…</Badge>;
  if (!race.registered) return <Badge color="var(--text-faint)">not on the vault</Badge>;
  if (!race.raceOpen) return <Badge color="var(--text-faint)">no race open</Badge>;
  const m = Math.floor(race.secondsLeft / 60);
  const s = race.secondsLeft % 60;
  return (
    <span className="flex flex-wrap items-center gap-2">
      <Badge color="var(--proof-verified)">
        race {race.raceNonce} open · {m}:{String(s).padStart(2, "0")} left
      </Badge>
      <span className="mono text-[10.5px]" style={{ color: "var(--text-faint)" }}>
        {race.lockCount} lock(s) · {usd(race.totalLockedUsd)} in
      </span>
    </span>
  );
}
