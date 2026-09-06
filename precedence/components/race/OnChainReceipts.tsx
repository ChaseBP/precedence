"use client";

/**
 * Every transaction behind a live settlement, as clickable links.
 *
 * @remarks This card exists because the app was losing evidence it had already earned. A borrower
 * would register a facility on Creditcoin and open a race on Sepolia — four signatures, four
 * confirmations in their wallet — and then find nothing on the settlement page to open on an
 * explorer. The transactions were real; the interface simply never carried them. From the outside
 * that is indistinguishable from the project not having a live path at all.
 *
 * Renders nothing for a scripted race. There is no "sample" variant on purpose: a walkthrough's
 * hashes are fabricated, so a card of dead links is worse than no card, and the proof rail already
 * says the run is simulated.
 *
 * Two chains, kept visibly apart. The same address has appeared on both CC3 and Sepolia in this
 * project's own deployment history, so a receipt list that does not name its chain invites exactly
 * the wrong conclusion.
 */

import { ExternalLink, Link2 } from "lucide-react";
import type { PriorityRace } from "@/lib/precedence/types";
import { Card, Eyebrow } from "@/components/ui";
import { Fold } from "@/components/race/Fold";

// The CC3 host that resolves. `explorer.cc3-testnet.creditcoin.network` does not.
const CREDITCOIN_EXPLORER = "https://creditcoin-testnet.blockscout.com";
const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

interface Receipt {
  label: string;
  hash: string;
  base: string;
  chain: string;
}

export function OnChainReceipts({
  race,
  folded = false,
}: {
  race: PriorityRace;
  /**
   * Collapse to a one-line summary carrying the count.
   *
   * @remarks Six 66-character hashes are 286px of the most valuable vertical space on the page,
   * spent on audit artifacts rather than on the state a viewer is waiting to change. Folded, every
   * hash stays complete, copyable and one click away, and the summary says how many there are so
   * nobody has to open it to find out whether it is worth opening.
   */
  folded?: boolean;
}) {
  const oc = race.onchain;
  if (!oc) return null;

  const receipts: Receipt[] = [];
  const push = (label: string, hash: string | undefined, base: string, chain: string) => {
    if (hash && /^0x[0-9a-fA-F]{64}$/.test(hash)) receipts.push({ label, hash, base, chain });
  };

  push("registerCollateral", oc.creditcoinRegisterTx, CREDITCOIN_EXPLORER, "Creditcoin CC3");
  push("postFacilityTerms", oc.creditcoinTermsTx, CREDITCOIN_EXPLORER, "Creditcoin CC3");
  push("registerCollateral", oc.registerTxHash, SEPOLIA_EXPLORER, "Sepolia");
  push("openRace", oc.openTxHash, SEPOLIA_EXPLORER, "Sepolia");
  // In rank order, because that is the order they matter in. `lock` from three different wallets
  // is three rows, not one summarised count.
  for (const l of race.locks) {
    push(
      `lock · ${l.tranche.toLowerCase()} · block ${l.lockBlockNumber.toLocaleString()} idx ${l.lockTxIndex}`,
      l.sepoliaTxHash,
      SEPOLIA_EXPLORER,
      "Sepolia",
    );
  }
  push(
    "batch verifyAndEmit",
    race.proofRecord?.creditcoinTxHash,
    CREDITCOIN_EXPLORER,
    "Creditcoin CC3",
  );

  if (receipts.length === 0) return null;

  const list = (
    <>
      <ul className="mt-2.5 flex flex-col divide-y" style={{ borderColor: "var(--border)" }}>
        {receipts.map((r) => (
          <li key={`${r.chain}-${r.hash}-${r.label}`} className="py-2 first:pt-0 last:pb-0">
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-[11px] font-semibold">{r.label}</span>
              <span className="mono text-[9.5px] uppercase tracking-wider" style={{ color: "var(--text-faint)" }}>
                {r.chain}
              </span>
            </div>
            <a
              href={`${r.base}/tx/${r.hash}`}
              target="_blank"
              rel="noreferrer"
              // Wraps rather than truncates: a hash is what a judge cross-checks, and half of one
              // behind an ellipsis cannot be compared against an explorer.
              className="mono mt-0.5 inline-flex items-start gap-1 break-all text-[10.5px] underline decoration-dotted underline-offset-4 hover:decoration-solid"
              style={{ color: "var(--accent)" }}
            >
              {r.hash}
              <ExternalLink size={9} className="mt-0.5 shrink-0" />
            </a>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[10.5px]" style={{ color: "var(--text-faint)" }}>
        Vault <span className="mono">{oc.vaultAddress}</span> · race {oc.raceNonce} · obligor{" "}
        <span className="mono">{oc.obligor}</span>
      </p>
    </>
  );

  if (folded) {
    return (
      <Fold
        title="On-chain receipts"
        count={`${receipts.length} tx`}
        hint="Every transaction this settlement rests on. Each opens on its own chain's explorer."
      >
        {list}
      </Fold>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2">
        <Link2 size={14} style={{ color: "var(--accent)" }} />
        <Eyebrow>On-chain receipts</Eyebrow>
      </div>
      <p className="mt-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
        Every transaction this settlement rests on. Each opens on its own chain&rsquo;s explorer.
      </p>
      {list}
    </Card>
  );
}
