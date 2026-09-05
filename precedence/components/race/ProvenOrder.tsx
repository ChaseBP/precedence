"use client";

/**
 * The rank order, shown as soon as the locks land rather than after the proof arrives.
 *
 * @remarks The console used to show `PENDING_EVIDENCE` and nothing else for the six to nine
 * minutes attestation takes, which reads as a stalled application. It is not: the ordering is
 * decided the instant each lock confirms, because `(lockBlockNumber, lockTxIndex)` IS the
 * priority and both come back on the transaction receipt within a block.
 *
 * So the wait is not to discover who won. It is to prove it to Creditcoin. This component says
 * that plainly — it shows the order immediately, marked as observed rather than proven, and the
 * same rows become proven when the attestation lands.
 *
 * The distinction is load-bearing and must not be blurred. An observed order is what our node saw
 * on the source chain; a proven order is what the precompile re-derived from a Merkle path and
 * Creditcoin recorded. Only the second is settlement. The one thing that can still change the
 * answer is a source-chain reorg, which is exactly what the attestation wait exists to rule out,
 * so the copy says so rather than implying the wait is bureaucracy.
 */

import type { PriorityRace } from "@/lib/precedence/types";
import { Badge, Card, Eyebrow, Why } from "@/components/ui";
import { trancheColor } from "@/lib/client/format";
import { MEASURED_ATTESTATION_LAG } from "@/lib/precedence/domain/proof";

export function ProvenOrder({ race, settled }: { race: PriorityRace; settled: boolean }) {
  const locks = race.locks ?? [];
  if (!locks.length) return null;

  // (height, txIndex) ascending — the same comparison PriorityProofLib re-derives on-chain.
  const ordered = [...locks].sort(
    (a, b) => a.lockBlockNumber - b.lockBlockNumber || a.lockTxIndex - b.lockTxIndex,
  );
  const sameBlock = new Set(ordered.map((l) => l.lockBlockNumber)).size < ordered.length;

  return (
    <Card>
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <Eyebrow>Rank order</Eyebrow>
        <Badge color={settled ? "var(--proof-verified)" : "var(--proof-pending)"}>
          {settled ? "PROVEN" : "OBSERVED"}
        </Badge>
      </div>

      <p className="mb-3 text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
        {settled ? (
          <>
            Re-derived on Creditcoin from the Merkle path at{" "}
            <span className="mono" style={{ color: "var(--text)" }}>
              0x0FD2
            </span>{" "}
            and recorded. This is the settled order.
          </>
        ) : (
          <>
            Already decided. Each lock&apos;s block and index came back on its receipt, and that
            pair is the priority — nothing is being computed while you wait.
          </>
        )}
      </p>

      <ol className="flex flex-col gap-1.5">
        {ordered.map((l, i) => (
          <li
            key={l.sepoliaTxHash}
            className="flex items-center gap-3 rounded-lg px-2.5 py-2"
            style={{ background: "var(--bg-2)", border: "1px solid var(--border)" }}
          >
            <span
              className="mono flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[0.62rem] font-bold"
              style={{
                background: settled ? "var(--proof-verified)" : "transparent",
                color: settled ? "var(--on-accent)" : "var(--text-muted)",
                border: `1px solid ${settled ? "var(--proof-verified)" : "var(--border-strong)"}`,
              }}
              title={settled ? `proven position ${i + 1}` : `observed position ${i + 1}`}
            >
              {i + 1}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold capitalize">{l.financier}</span>
              <span className="mono block text-[0.62rem]" style={{ color: "var(--text-faint)" }}>
                block {l.lockBlockNumber} · index {l.lockTxIndex}
              </span>
            </span>
            <Badge color={trancheColor(l.tranche)}>{l.tranche}</Badge>
          </li>
        ))}
      </ol>

      {!settled ? (
        <Why>
          The wait is the proof, not the decision. Attestation of the source block takes{" "}
          {MEASURED_ATTESTATION_LAG.minMinutes}–{MEASURED_ATTESTATION_LAG.maxMinutes} minutes,
          measured, and until it completes Creditcoin has no way to check this ordering for itself.
          Only a reorg on the source chain could change it, which is the risk that wait exists to
          rule out.
        </Why>
      ) : null}

      {sameBlock ? (
        <p className="mt-2.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
          Two of these landed in the same block. The transaction index is the only thing separating
          them.
        </p>
      ) : null}
    </Card>
  );
}
