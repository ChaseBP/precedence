"use client";

/**
 * Servicing: draw, repay, and reclaim.
 *
 * @remarks Which controls appear is derived from the **vault's own** obligor field and from whose
 * address owns the locks — not from a stored profile or a role the user picked. The same wallet
 * can be the borrower here and a lender on the next facility, and that is the normal case rather
 * than an edge one.
 *
 * Three actions, three different people:
 *  - **draw** — obligor only, after the race closes, never beyond what the vault allocated.
 *  - **repay** — moves pUSD in and emits the event a proof will read. The figure the waterfall
 *    runs on is decoded from that transaction on Creditcoin, so nobody can overstate it here.
 *  - **refund** — a financier reclaiming capital that was never allocated. Also the liveness
 *    escape hatch: if the obligor never draws, `isAbandoned` flips and the whole lock is
 *    reclaimable, so capital cannot be stranded by inaction.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  CheckCircle2,
  ExternalLink,
  Loader2,
  RotateCcw,
  Undo2,
} from "lucide-react";
import type { Address, Hex } from "viem";
import { Badge, Card, Why } from "@/components/ui";
import { useWallet } from "@/lib/client/wallet";
import {
  drawCapital,
  readIsAbandoned,
  readMyLocks,
  readRaceState,
  readTotalAllocated,
  refundLock,
  repayFacility,
  type MyLock,
  type VaultAddresses,
  type VaultRaceState,
} from "@/lib/client/vault";
import { usd } from "@/lib/client/format";
import type { CollateralAsset } from "@/lib/precedence/types";
import { fetchAppConfig } from "@/lib/client/app-config";

const TRANCHE_NAMES = ["SENIOR", "JUNIOR", "SUBORDINATE"] as const;

interface ConfigShape {
  addresses?: { sepolia?: VaultAddresses };
  explorers?: { sepolia?: string };
}

export function ServiceFacility({ collateral }: { collateral: CollateralAsset }) {
  const { address, chainKey } = useWallet();
  const [cfg, setCfg] = useState<ConfigShape | null>(null);
  const [race, setRace] = useState<VaultRaceState | null>(null);
  const [abandoned, setAbandoned] = useState(false);
  const [allocated, setAllocated] = useState<number | null>(null);
  const [myLocks, setMyLocks] = useState<MyLock[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ what: string; hash: Hex } | null>(null);
  const [drawAmount, setDrawAmount] = useState("");
  const [repayAmount, setRepayAmount] = useState("");

  const addrs = cfg?.addresses?.sepolia;
  const explorer = cfg?.explorers?.sepolia ?? "https://sepolia.etherscan.io";
  const realHash = /^0x[0-9a-fA-F]{64}$/.test(collateral.docHash);
  const onSepolia = chainKey === "sepolia";

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const j = (await fetchAppConfig()) as ConfigShape;
        if (!cancelled) setCfg(j);
      } catch {
        if (!cancelled) setCfg({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    if (!addrs || !realHash) return;
    try {
      const cid = collateral.docHash as Hex;
      const r = await readRaceState(addrs.PriorityVault, cid);
      const [ab, alloc] = await Promise.all([
        readIsAbandoned(addrs.PriorityVault, cid),
        readTotalAllocated(addrs.PriorityVault, cid),
      ]);
      setRace(r);
      setAbandoned(ab);
      setAllocated(alloc);
      if (address && r.lockCount > 0) {
        setMyLocks(await readMyLocks(addrs.PriorityVault, cid, r.raceNonce, r.lockCount, address as Address, ab));
      } else {
        setMyLocks([]);
      }
    } catch (e) {
      setError((e as Error).message.slice(0, 180));
    }
  }, [addrs, realHash, collateral.docHash, address]);

  useEffect(() => {
    if (!addrs || !realHash) return;
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) void refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [addrs, realHash, refresh, done]);

  const isObligor = Boolean(
    race && address && race.obligor.toLowerCase() === address.toLowerCase(),
  );
  // Capped by what the vault ALLOCATED, not by the facility size. Under-subscribed facilities
  // allocate less than was asked for, and offering the difference would offer a revert.
  const drawable =
    race && allocated !== null ? Math.max(0, allocated - race.totalDrawnUsd) : 0;
  const reclaimable = useMemo(() => myLocks.filter((l) => l.refundableUsd > 0), [myLocks]);

  async function run(what: string, fn: () => Promise<Hex>) {
    setError(null);
    setDone(null);
    setBusy(what);
    try {
      const hash = await fn();
      setDone({ what, hash });
    } catch (e) {
      setError((e as Error).message.slice(0, 260));
    } finally {
      setBusy(null);
    }
  }

  // Nothing to service until the document is real, a vault exists, and a race has closed.
  if (!realHash || !addrs) return null;
  if (race && !race.registered) return null;
  if (!race) {
    return (
      <Card>
        <div className="flex items-center gap-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          <Loader2 size={13} className="animate-spin" /> reading servicing state from the vault…
        </div>
      </Card>
    );
  }
  if (race.raceOpen) return null; // nothing is drawable or refundable while bidding is live
  if (!isObligor && reclaimable.length === 0) return null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Servicing</h3>
        <div className="flex flex-wrap items-center gap-2">
          {isObligor ? <Badge color="var(--accent)">you are the obligor</Badge> : null}
          {reclaimable.length > 0 ? <Badge color="var(--warn)">you have capital to reclaim</Badge> : null}
          {abandoned ? <Badge color="var(--danger)">abandoned — draw window expired</Badge> : null}
          <button onClick={() => void refresh()} className="btn-ghost inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[10.5px]">
            <RotateCcw size={11} /> refresh
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
        <span>facility <strong style={{ color: "var(--text)" }}>{usd(race.facilitySizeUsd)}</strong></span>
        <span>locked <strong style={{ color: "var(--text)" }}>{usd(race.totalLockedUsd)}</strong></span>
        {allocated !== null ? (
          <span>allocated <strong style={{ color: "var(--text)" }}>{usd(allocated)}</strong></span>
        ) : null}
        <span>drawn <strong style={{ color: "var(--text)" }}>{usd(race.totalDrawnUsd)}</strong></span>
        <span>repaid <strong style={{ color: "var(--text)" }}>{usd(race.totalRepaidUsd)}</strong></span>
      </div>

      {!onSepolia ? (
        <p className="mt-3 text-[11.5px]" style={{ color: "var(--warn)" }}>
          Switch to Sepolia to act on this facility — servicing moves pUSD, which lives there.
        </p>
      ) : null}

      {/* ── obligor: draw and repay ── */}
      {isObligor ? (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg p-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold">
              <ArrowDownToLine size={13} style={{ color: "var(--accent)" }} /> Draw capital
            </div>
            <p className="mt-1 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
              Up to {usd(drawable)} remaining. The vault caps this at what it actually allocated, so
              an over-draw reverts rather than succeeding quietly.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                data-field="drawAmount"
                value={drawAmount}
                onChange={(e) => setDrawAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder={String(Math.floor(drawable))}
                inputMode="decimal"
                className="mono w-28 rounded-lg px-2 py-1 text-[11.5px] outline-none"
                style={{ background: "var(--bg-1)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <button
                onClick={() =>
                  run("draw", () =>
                    drawCapital(addrs.PriorityVault, collateral.docHash as Hex, Number(drawAmount)),
                  )
                }
                disabled={!onSepolia || busy !== null || !(Number(drawAmount) > 0)}
                className="btn-primary px-2.5 py-1 text-[11px] font-semibold"
              >
                {busy === "draw" ? "Drawing…" : "Draw"}
              </button>
            </div>
          </div>

          <div className="rounded-lg p-3" style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-1.5 text-[11.5px] font-semibold">
              <ArrowUpFromLine size={13} style={{ color: "var(--proof-verified)" }} /> Repay
            </div>
            <p className="mt-1 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
              The waterfall runs on the amount decoded from this transaction on Creditcoin, not on
              anything stated here — so it cannot be overstated.
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input
                data-field="repayAmount"
                value={repayAmount}
                onChange={(e) => setRepayAmount(e.target.value.replace(/[^0-9.]/g, ""))}
                placeholder={String(Math.floor(race.totalDrawnUsd))}
                inputMode="decimal"
                className="mono w-28 rounded-lg px-2 py-1 text-[11.5px] outline-none"
                style={{ background: "var(--bg-1)", border: "1px solid var(--border)", color: "var(--text)" }}
              />
              <button
                onClick={() =>
                  run("repay", () =>
                    repayFacility(addrs, collateral.docHash as Hex, Number(repayAmount), () => {}),
                  )
                }
                disabled={!onSepolia || busy !== null || !(Number(repayAmount) > 0)}
                className="btn-primary px-2.5 py-1 text-[11px] font-semibold"
                style={{ background: "var(--proof-verified)", color: "var(--on-accent)" }}
              >
                {busy === "repay" ? "Repaying…" : "Repay"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {/* ── financier: reclaim ── */}
      {reclaimable.length > 0 ? (
        <div className="mt-4">
          <Why>
            {abandoned
              ? "The obligor never drew and the draw window has expired, so the whole lock is reclaimable. Capital cannot be stranded by someone else's inaction."
              : "Capital the facility did not allocate comes back in full. It was never demoted into a lower tranche, because bidding for a rank is not consent to hold a riskier one."}
          </Why>
          <div className="mt-2 flex flex-col gap-2">
            {reclaimable.map((l) => (
              <div key={l.index}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg p-2.5"
                style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}>
                <div className="min-w-0 text-[11.5px]">
                  <span className="font-semibold">{TRANCHE_NAMES[l.tranche]}</span>{" "}
                  <span style={{ color: "var(--text-muted)" }}>
                    seq {l.seq} · locked {usd(l.amountUsd)} · allocated {usd(l.allocatedUsd)}
                  </span>
                </div>
                <button
                  onClick={() =>
                    run(`refund-${l.index}`, () =>
                      refundLock(addrs.PriorityVault, collateral.docHash as Hex, l.index),
                    )
                  }
                  disabled={!onSepolia || busy !== null}
                  className="btn-primary btn-primary--warn inline-flex shrink-0 items-center gap-1.5 px-2.5 py-1 text-[11px] font-semibold"
                >
                  {busy === `refund-${l.index}` ? (
                    <Loader2 size={11} className="animate-spin" />
                  ) : (
                    <Undo2 size={11} />
                  )}
                  Reclaim {usd(l.refundableUsd)}
                </button>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {error ? (
        <p className="mt-3 flex items-start gap-1.5 text-[11px]" style={{ color: "var(--danger)" }}>
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {error}
        </p>
      ) : null}

      {done ? (
        <p className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]" style={{ color: "var(--proof-verified)" }}>
          <CheckCircle2 size={12} className="shrink-0" /> {done.what} confirmed
          <a href={`${explorer}/tx/${done.hash}`} target="_blank" rel="noreferrer"
            className="mono inline-flex items-center gap-1 break-all" style={{ color: "var(--accent)" }}>
            {done.hash.slice(0, 18)}… <ExternalLink size={10} className="shrink-0" />
          </a>
        </p>
      ) : null}
    </Card>
  );
}
