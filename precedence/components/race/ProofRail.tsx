"use client";

import { motion } from "motion/react";
import { Check, ExternalLink, Clock, Cpu, ShieldCheck } from "lucide-react";
import type { Hex, PriorityRace } from "@/lib/precedence/types";
import { Badge, Card, Eyebrow } from "@/components/ui";

// explorer.cc3-testnet.creditcoin.network does not resolve (HTTP 000, checked 2026-09-02).
// A judge clicking a verification link that dies is the single most damaging thing this app
// could do, so the fallback is the host every other part of the repo already uses.
const CREDITCOIN_EXPLORER = "https://creditcoin-testnet.blockscout.com";
const SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";

function ProofStepRow({
  label,
  detail,
  href,
  status,
  mock,
}: {
  label: string;
  detail?: string;
  href?: string;
  status: "pending" | "available" | "verified" | "waiting";
  mock: boolean;
}) {
  const isVerified = status === "verified";
  const isAvailable = status === "available";
  const isPending = status === "pending";

  const color = isVerified
    ? "var(--proof-verified)"
    : isAvailable
      ? "var(--proof-available)"
      : isPending
        ? "var(--proof-pending)"
        : "var(--border-strong)";

  return (
    <div className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2.5">
        {isVerified ? (
          <motion.span
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--proof-verified)", color: "var(--bg-0)" }}
          >
            <Check size={11} strokeWidth={3} />
          </motion.span>
        ) : isAvailable ? (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--proof-available-soft)", border: "1px solid var(--proof-available)", color: "var(--proof-available)" }}
          >
            <Cpu size={11} />
          </span>
        ) : isPending ? (
          <span
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full"
            style={{ background: "var(--proof-pending-soft)", border: "1px solid var(--proof-pending)", color: "var(--proof-pending)" }}
          >
            <Clock size={11} className="animate-spin" />
          </span>
        ) : (
          <span className="h-5 w-5 shrink-0 rounded-full border" style={{ borderColor: "var(--border-strong)" }} />
        )}
        <div className="min-w-0 leading-tight">
          <div className="text-xs font-semibold">{label}</div>
          {detail ? (
            <div className="mono truncate text-[0.68rem]" style={{ color: "var(--text-faint)" }} title={detail}>
              {detail}
            </div>
          ) : null}
        </div>
      </div>
      {/* A fabricated hash must never become a link. `mock` used to change only the LABEL to
          "sample" while still rendering the href, so a scripted run offered Etherscan links to
          transactions that do not exist — the exact dead-link failure that ends a submission. */}
      {isVerified && mock ? (
        // Where the verify link would be. A scripted run has a fabricated hash, so there is
        // nothing to open — say that in the slot the link occupies rather than leaving a gap the
        // eye reads as a missing feature.
        <span
          className="mono shrink-0 rounded px-1.5 py-0.5 text-[9.5px] uppercase tracking-wider"
          style={{
            color: "var(--warn)",
            border: "1px solid color-mix(in srgb, var(--warn) 35%, transparent)",
          }}
          title="Scripted walkthrough — this hash is simulated, so there is no transaction to open."
        >
          sample
        </span>
      ) : isVerified && href ? (
        <a
          href={href}
          target="_blank"
          rel="noreferrer"
          className="btn-ghost flex shrink-0 items-center gap-1 rounded-md px-2 py-1 text-[0.68rem]"
        >
          <ExternalLink size={10} /> verify
        </a>
      ) : null}
    </div>
  );
}

/**
 * Pinned Attestcoin Proof Rail:
 *  1. PENDING_EVIDENCE (6.5-9.3 min measured attestation wait on Sepolia, n=239)
 *  2. PROOF AVAILABLE (Merkle + 1 shared continuity proof generated)
 *  3. VERIFIED at 0x0FD2 on Creditcoin CC3 (one block post-attestation)
 */
export function ProofRail({ race }: { race: PriorityRace; identityRegistry?: Hex | "" }) {
  const p = race.proofRecord;
  /**
   * Whether this race's hashes point at transactions that exist.
   *
   * @remarks `race.onchain` is set only after the server fetched a receipt for the opening
   * transaction, so its presence is the one reliable answer — and it is a property of the RACE,
   * not of the app's configuration.
   *
   * This used to read `simulated || !creditcoinLive`, which conflated two unrelated things and got
   * the common case wrong in the worst direction: with the Creditcoin adapter reading in mock
   * mode, a genuine Sepolia lock — signed from the lender's own wallet, confirmed, with a real
   * hash — was labelled `sample` and its explorer link withheld. The rule is not "is Creditcoin
   * live", it is "did this hash come from a chain".
   */
  const live = !!race.onchain;
  // Settled once the priority stack exists — everything downstream of PRIORITY_SETTLED.
  const isSettled = !!race.settlement;
  const hasLocks = race.locks.length > 0;

  const firstLock = race.locks[0];
  const explorerUrl = p?.creditcoinTxHash
    ? `${CREDITCOIN_EXPLORER}/tx/${p.creditcoinTxHash}`
    : undefined;

  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldCheck size={14} style={{ color: "var(--accent)" }} />
          <Eyebrow>Attestcoin Proof Pipeline</Eyebrow>
        </div>
        <Badge color={isSettled ? "var(--proof-verified)" : hasLocks ? "var(--proof-pending)" : "var(--silver)"}>
          {isSettled ? "VERIFIED" : hasLocks ? "PENDING_EVIDENCE" : "AWAITING LOCKS"}
        </Badge>
      </div>

      <div className="divide-y" style={{ borderColor: "var(--border)" }}>
        <ProofStepRow
          label="1. Source Locks (Sepolia)"
          // The position, not just the height. `(height, txIndex)` is the priority root, and
          // naming only the block hides the half that resolves a same-block tie.
          detail={
            firstLock
              ? `${race.locks.length} lock${race.locks.length === 1 ? "" : "s"} anchored · block ` +
                `${firstLock.lockBlockNumber.toLocaleString()} · txIndex ${firstLock.lockTxIndex}`
              : "PriorityVault.sol · pending"
          }
          href={firstLock?.sepoliaTxHash ? `${SEPOLIA_EXPLORER}/tx/${firstLock.sepoliaTxHash}` : undefined}
          status={hasLocks ? "verified" : "waiting"}
          mock={!live}
        />
        <ProofStepRow
          label="2. Attestation Proof (0x0FD3)"
          // A single scalar invited "why 8.5?" and contradicted the measurement. The lag
          // sawtooths because attestation advances in batches, so only a range is truthful.
          detail={hasLocks ? "6.5-9.3m measured attestation window · batch proof ready" : "waitUntilHeightAttested · waiting"}
          status={isSettled ? "verified" : hasLocks ? "available" : "waiting"}
          mock={!live}
        />
        <ProofStepRow
          label="3. Precompile Verify (0x0FD2)"
          detail={isSettled ? `batch verifyAndEmit() TRUE · settled in 1 CC3 block` : "AttestationGate · pending"}
          href={explorerUrl}
          status={isSettled ? "verified" : "waiting"}
          mock={!live}
        />
      </div>
    </Card>
  );
}
