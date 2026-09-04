"use client";

/**
 * The obligor's side of starting a live race.
 *
 * @remarks This card is the piece the app was missing. Registration wrote the asset to Creditcoin
 * and terms were posted to our own store, but nothing ever told the **Sepolia vault** that the
 * collateral existed — and {@link LockCapital} needs an open race on the vault to bid into. So the
 * live path dead-ended at "no race open" and the only race anyone could actually watch was the
 * scripted one, which is exactly the wrong impression to leave.
 *
 * Shown only to the wallet that can act: the collateral's obligor, or anyone at all while the
 * vault has never seen the document (registration is permissionless and the first caller becomes
 * the obligor of record).
 */

import { useCallback, useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { AlertTriangle, ArrowRight, Loader2, Radio } from "lucide-react";
import type { Address, Hex } from "viem";
import type { CollateralAsset } from "@/lib/precedence/types";
import { Badge, Card, Eyebrow } from "@/components/ui";
import { usd } from "@/lib/client/format";
import {
  MIN_RACE_WINDOW_S,
  openRaceOnVault,
  readRaceState,
  type OpenRaceStage,
  type VaultRaceState,
} from "@/lib/client/vault";

interface ConfigShape {
  addresses?: { sepolia?: { PUSD: Address; PriorityVault: Address } };
  explorers?: { sepolia?: string };
}

const STAGE_LABEL: Record<OpenRaceStage, string> = {
  switching: "Switching your wallet to Sepolia…",
  registering: "Claiming the collateral on the vault…",
  opening: "Opening the financing race…",
  open: "Race open on Sepolia",
};

/** Long enough to bid into by hand, short enough that a demo is not held hostage by it. */
const WINDOW_CHOICES = [
  { s: 300, label: "5 min" },
  { s: 900, label: "15 min" },
  { s: 3600, label: "1 hour" },
];

export function OpenRace({ collateral }: { collateral: CollateralAsset }) {
  const { address } = useAccount();
  const [cfg, setCfg] = useState<ConfigShape | null>(null);
  const [race, setRace] = useState<VaultRaceState | null>(null);
  const [windowS, setWindowS] = useState(900);
  const [stage, setStage] = useState<OpenRaceStage | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ openTxHash: Hex; registerTxHash?: Hex } | null>(null);

  const addrs = cfg?.addresses?.sepolia;
  const explorer = cfg?.explorers?.sepolia ?? "https://sepolia.etherscan.io";
  const isRealDocHash = /^0x[0-9a-fA-F]{64}$/.test(collateral.docHash);
  const terms = collateral.terms;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/config", { cache: "no-store" })
      .then((r) => r.json())
      .then((j: ConfigShape) => { if (!cancelled) setCfg(j); })
      .catch(() => { if (!cancelled) setCfg({}); });
    return () => { cancelled = true; };
  }, []);

  const refresh = useCallback(async () => {
    if (!addrs || !isRealDocHash) return;
    try {
      setRace(await readRaceState(addrs.PriorityVault, collateral.docHash as Hex));
    } catch {
      setRace(null);
    }
  }, [addrs, collateral.docHash, isRealDocHash]);

  useEffect(() => { void refresh(); }, [refresh, done]);

  // Nothing to say unless a real document, posted terms and a deployed vault all line up. Each of
  // those already has its own explanation in LockCapital directly below, so this card stays quiet
  // rather than repeating them.
  if (!isRealDocHash || !terms || !addrs) return null;

  const zero = "0x0000000000000000000000000000000000000000";
  const claimed = !!race?.registered && race.obligor.toLowerCase() !== zero;
  const mine = !!address && !!race && race.obligor.toLowerCase() === address.toLowerCase();
  // Either the vault has never seen this document (anyone may claim it), or it is already ours.
  if (claimed && !mine) return null;
  if (race?.raceOpen) return null;

  const caps = {
    senior: terms.seniorCapUsd,
    junior: terms.juniorCapUsd,
    subordinate: terms.subordinateCapUsd,
  };
  const facility = caps.senior + caps.junior + caps.subordinate;
  const busy = stage !== null && stage !== "open";

  async function go() {
    if (!addrs) return;
    setError(null);
    setDone(null);
    try {
      const r = await openRaceOnVault(
        addrs.PriorityVault,
        collateral.docHash as Hex,
        caps,
        windowS,
        (s, detail) => { setStage(s); setNote(detail ?? ""); },
      );
      setDone({ openTxHash: r.openTxHash, registerTxHash: r.registerTxHash });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStage(null);
    }
  }

  if (done) {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Radio size={15} style={{ color: "var(--success)" }} />
            <h3 className="text-sm font-semibold">The race is open on Sepolia</h3>
          </div>
          <Badge color="var(--success)">LIVE</Badge>
        </div>
        <p className="mt-1.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
          {usd(facility)} across three tranches, closing in {Math.round(windowS / 60)} minutes.
          Lenders can lock capital below — each lock is a real transaction, and its block and index
          are the priority claim.
        </p>
        <div className="mt-2.5 flex flex-col gap-1 text-[11px]">
          {done.registerTxHash ? (
            <a className="mono truncate" style={{ color: "var(--accent)" }} target="_blank" rel="noreferrer"
               href={`${explorer}/tx/${done.registerTxHash}`}>
              registerCollateral · {done.registerTxHash}
            </a>
          ) : null}
          <a className="mono truncate" style={{ color: "var(--accent)" }} target="_blank" rel="noreferrer"
             href={`${explorer}/tx/${done.openTxHash}`}>
            openRace · {done.openTxHash}
          </a>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <Eyebrow>Obligor action · Sepolia</Eyebrow>
          <h3 className="mt-0.5 text-sm font-semibold">
            {claimed ? "Open a financing race" : "Claim this asset on the vault and open a race"}
          </h3>
          <p className="mt-1 max-w-prose text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            {claimed
              ? "Your posted caps become the tranche sizes lenders bid into."
              : "Registration on Creditcoin recorded the lien; the Sepolia vault is where capital actually locks, and it has not seen this document yet. Whoever registers it becomes its obligor of record."}{" "}
            This signs {claimed ? "one transaction" : "two transactions"} from your wallet.
          </p>
        </div>
        <div className="mono shrink-0 text-right text-[11px]" style={{ color: "var(--text-muted)" }}>
          <div>{usd(caps.senior)} senior</div>
          <div>{usd(caps.junior)} junior</div>
          <div>{usd(caps.subordinate)} subordinate</div>
          <div className="mt-1 font-semibold" style={{ color: "var(--text)" }}>{usd(facility)} facility</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Eyebrow>Window</Eyebrow>
        {WINDOW_CHOICES.map((w) => (
          <button
            key={w.s}
            onClick={() => setWindowS(w.s)}
            disabled={busy}
            className={windowS === w.s ? "btn-primary rounded-lg px-3 py-1 text-[11px]" : "btn-ghost rounded-lg px-3 py-1 text-[11px]"}
          >
            {w.label}
          </button>
        ))}
        <span className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
          the vault rejects anything under {MIN_RACE_WINDOW_S}s
        </span>
      </div>

      <div className="mt-3.5 flex flex-wrap items-center gap-3">
        <button onClick={go} disabled={busy} className="btn-primary inline-flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold disabled:opacity-50">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ArrowRight size={13} />}
          {claimed ? "Open the race" : "Claim and open"}
        </button>
        {stage ? (
          <span className="flex min-w-0 items-center gap-2 text-[11px]" style={{ color: "var(--text-muted)" }}>
            <span>{STAGE_LABEL[stage]}</span>
            {note ? <span className="mono truncate" style={{ color: "var(--text-faint)" }}>{note}</span> : null}
          </span>
        ) : null}
      </div>

      {error ? (
        <div className="mt-3 flex items-start gap-2 rounded-lg border p-2.5 text-[11.5px]"
             style={{ borderColor: "var(--warn)", color: "var(--warn)" }}>
          <AlertTriangle size={13} className="mt-0.5 shrink-0" />
          <span className="min-w-0 break-words">{error}</span>
        </div>
      ) : null}
    </Card>
  );
}
