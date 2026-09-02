/**
 * The judge-verifiable evidence register.
 *
 * Every claim the submission makes has to be checkable by someone who does not trust us. So a
 * settled race writes a record containing: the source transactions with their block and index, the
 * Creditcoin transaction that settled them, the positions the PRECOMPILE ITSELF derived, and live
 * explorer links for all of it.
 *
 * The cross-check is the point. `calculateTxIndex` derives the position from the Merkle path; a
 * block explorer reports `transactionIndex` independently. If those agree, the ordering the
 * protocol settled on is the ordering the canonical chain actually has — which is the entire thesis
 * in one comparison. If they ever disagree, that is a finding and must not be buried.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { explorers } from "./config";

const EVIDENCE_DIR = resolve(import.meta.dir, "../../evidence");

export interface SourceLockEvidence {
  financier: string;
  tranche: string;
  amount: string;
  txHash: string;
  /** From the proof service / receipt. */
  blockNumber: number;
  txIndex: number;
  seq: number;
  explorerUrl: string;
}

export interface RaceEvidence {
  kind: "priority-race";
  collateralId: string;
  capturedAtZ: string;
  attestation: {
    waitMinutes: number;
    attestedHeight: number;
    note: string;
  };
  sourceChain: {
    name: string;
    chainId: number;
    chainKey: number;
    vault: string;
    vaultExplorerUrl: string;
    locks: SourceLockEvidence[];
  };
  creditcoin: {
    chainId: number;
    gate: string;
    gateExplorerUrl: string;
    settleTxHash: string;
    settleExplorerUrl: string;
    blockNumber: number;
    gasUsed: string;
    /** Positions the precompile derived, from the gate's own LockVerified events. */
    provenPositions: { height: number; txIndex: number; financier: string }[];
  };
  /** THE cross-check: precompile-derived index vs what an explorer independently reports. */
  crossCheck: {
    agrees: boolean;
    rows: { txHash: string; precompileTxIndex: number; explorerTxIndex: number; agrees: boolean }[];
    note: string;
  };
  settlement: {
    awards: { financier: string; tranche: string; rank: number; amount: string; height: number; txIndex: number }[];
    refunds: { financier: string; tranche: string; amount: string }[];
  };
}

export function writeEvidence(name: string, data: unknown): string {
  if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, `${name}.json`);
  writeFileSync(path, JSON.stringify(data, null, 2));
  return path;
}

export function readEvidence<T>(name: string): T | null {
  const path = resolve(EVIDENCE_DIR, `${name}.json`);
  if (!existsSync(path)) return null;
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

/**
 * Render a race's evidence as a Markdown table for the README and the integration summary.
 * Generated rather than transcribed — a hand-copied hash is how a dead explorer link happens.
 */
export function renderEvidenceMarkdown(e: RaceEvidence): string {
  const lines: string[] = [];
  lines.push(`### Priority race — collateral \`${e.collateralId}\``);
  lines.push("");
  lines.push(`Captured ${e.capturedAtZ}. Attestation wait: **${e.attestation.waitMinutes} minutes**.`);
  lines.push("");
  lines.push(`**Source locks on ${e.sourceChain.name}** (chainKey ${e.sourceChain.chainKey})`);
  lines.push("");
  lines.push("| # | Financier | Tranche | Amount | Block | txIndex | Transaction |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  e.sourceChain.locks.forEach((l, i) => {
    lines.push(
      `| ${i + 1} | \`${l.financier.slice(0, 10)}…\` | ${l.tranche} | ${l.amount} | ${l.blockNumber} | ` +
        `${l.txIndex} | [${l.txHash.slice(0, 12)}…](${l.explorerUrl}) |`,
    );
  });
  lines.push("");
  lines.push(
    `**Settled on Creditcoin** in one transaction: ` +
      `[${e.creditcoin.settleTxHash.slice(0, 14)}…](${e.creditcoin.settleExplorerUrl}) ` +
      `· block ${e.creditcoin.blockNumber} · ${e.creditcoin.gasUsed} gas`,
  );
  lines.push("");
  lines.push("**Ordering cross-check** — the claim a judge should actually test:");
  lines.push("");
  lines.push("| Transaction | `calculateTxIndex` (precompile) | Block explorer | Agrees |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of e.crossCheck.rows) {
    lines.push(
      `| \`${r.txHash.slice(0, 12)}…\` | ${r.precompileTxIndex} | ${r.explorerTxIndex} | ` +
        `${r.agrees ? "yes" : "**NO**"} |`,
    );
  }
  lines.push("");
  lines.push(
    e.crossCheck.agrees
      ? `Every position the precompile derived from the Merkle path matches what the block explorer ` +
          `independently reports. The ordering priority settled on IS the canonical chain's ordering.`
      : `**MISMATCH — investigate before submitting.** ${e.crossCheck.note}`,
  );
  lines.push("");
  lines.push("**Resulting priority stack**");
  lines.push("");
  lines.push("| Rank | Tranche | Holder | Principal | Won at |");
  lines.push("| --- | --- | --- | --- | --- |");
  for (const a of e.settlement.awards) {
    lines.push(
      `| ${a.rank} | ${a.tranche} | \`${a.financier.slice(0, 10)}…\` | ${a.amount} | ` +
        `block ${a.height}, txIndex ${a.txIndex} |`,
    );
  }
  if (e.settlement.refunds.length) {
    lines.push("");
    lines.push("**Auto-refunded** (double-financing prevented)");
    lines.push("");
    for (const r of e.settlement.refunds) {
      lines.push(`- \`${r.financier.slice(0, 10)}…\` — ${r.amount} declared ${r.tranche}, returned in full`);
    }
  }
  return lines.join("\n");
}

export { explorers };
