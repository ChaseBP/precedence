/**
 * Attestcoin readability pipeline.
 *
 * The honest two-stage story, which is non-negotiable (`rohan-plan.md` §20):
 *  1. Source transaction lands on Sepolia                       — instant
 *  2. Attestation reaches that height                           — MEASURED 7–9 min (sawtooth)
 *  3. Proof generation from the builder service                 — seconds
 *  4. Precompile verification + state transition on Creditcoin  — ONE ~15s block
 *
 * "One block" refers ONLY to steps 3+4. PENDING_EVIDENCE is a patient state, never an error.
 *
 * The on-chain interface (verified against @gluwa/usc-contracts@0.2.0 and the deployed precompile):
 *
 *   verifyAndEmit(uint64 chainKey, uint64 height,    bytes,   MerkleProof,   ContinuityProof)
 *   verifyAndEmit(uint64 chainKey, uint64[] heights, bytes[], MerkleProof[], ContinuityProof shared)
 *   verify(...)        — the same two, view-only and FREE. Used as a preflight before spending gas.
 *   calculateTxIndex(MerkleProof) returns (uint64)  — the intra-block position, from the proof path
 */
import type {
  AttestcoinProofRecord,
  ContinuityProofData,
  Hex,
  MerkleProofData,
  ProofPipelineStatus,
  SourceLockRecord,
} from "../types";
import { hashObject } from "../crypto/hash";

/** Native Query Verifier (BlockProver) precompile. */
export const ATTESTCOIN_PRECOMPILE = "0x0000000000000000000000000000000000000FD2" as const;
/** ChainInfo precompile — attestation heights, continuity bounds, supported chains. */
export const ATTESTCOIN_CHAININFO = "0x0000000000000000000000000000000000000fd3" as const;
/** Sepolia, read from 0x0FD3.get_supported_chains() itself. */
export const SEPOLIA_CHAIN_KEY = 1;
export const SEPOLIA_CHAIN_ID = 11155111;
export const CREDITCOIN_CHAIN_ID = 102031;

/** MAX_BATCH_SIZE — one continuity proof covers at most this many transactions. */
export const MAX_BATCH_SIZE = 10;
/** MAX_BATCH_RANGE — those transactions must fall inside this many blocks. */
export const MAX_BATCH_RANGE = 1000;

/**
 * MEASURED attestation lag on Sepolia. Attestcoin does not document this figure anywhere, and the
 * ~8-10 min in `rohan-plan.md` §20 was unsourced, so it is sampled continuously instead.
 *
 * Never quote a single number: attestation advances in BATCHES, so the lag sawtooths between the
 * bounds below rather than sitting at an average. And never imply the proof is instant.
 */
export const MEASURED_ATTESTATION_LAG = {
  minMinutes: 6.7,
  maxMinutes: 9.4,
  p50Minutes: 7.8,
  p90Minutes: 8.8,
  p99Minutes: 9.4,
  samples: 86,
  measuredAt: "2026-09-02T00:20:00Z",
  /** Pre-stage source transactions at least this far ahead of a demo: p90 + a 3-minute buffer. */
  demoStagingMinutes: 12,
  source: "ops/measure-latency.ts -> evidence/latency.jsonl (run `--summary` for the current figure)",
  note: "Attestation advances in BATCHES, so the lag is a sawtooth rather than a constant. Quote the range, never a single number.",
} as const;

export function midpointLagMinutes(): number {
  return Math.round(((MEASURED_ATTESTATION_LAG.minMinutes + MEASURED_ATTESTATION_LAG.maxMinutes) / 2) * 10) / 10;
}

/** Human-readable, honest description of the two-stage latency. */
export const HONEST_LATENCY_COPY =
  `Attestation of the source block takes ${MEASURED_ATTESTATION_LAG.minMinutes}–${MEASURED_ATTESTATION_LAG.maxMinutes} minutes ` +
  `(measured on Sepolia). Verification and settlement then complete in one Creditcoin block (~15s) once the proof exists.`;

/** Does this set of locks fit one shared continuity proof? */
export function batchFits(locks: SourceLockRecord[]): { ok: boolean; reason?: string } {
  if (locks.length === 0) return { ok: false, reason: "no locks to prove" };
  if (locks.length > MAX_BATCH_SIZE) {
    return { ok: false, reason: `${locks.length} locks exceeds MAX_BATCH_SIZE of ${MAX_BATCH_SIZE}` };
  }
  const heights = locks.map((l) => l.lockBlockNumber);
  const span = Math.max(...heights) - Math.min(...heights);
  if (span > MAX_BATCH_RANGE) {
    return { ok: false, reason: `block span ${span} exceeds MAX_BATCH_RANGE of ${MAX_BATCH_RANGE}` };
  }
  return { ok: true };
}

/**
 * Verification cost grows with proof AGE, because continuity hashes accumulate:
 *   ≈ 2.3e-5 + 2.9e-7 × (continuity hash count) CTC
 * ~10 min old ≈ 2.59e-5 CTC · 24 h old ≈ 3.13e-4 CTC — over 10× more. PROVE PROMPTLY.
 */
export function estimateVerifyCostCtc(continuityHashCount: number): number {
  return 2.3e-5 + 2.9e-7 * continuityHashCount;
}

/** SAMPLE proof material for `mock` mode. Never presented as chain data. */
function sampleMerkleProof(lock: SourceLockRecord): MerkleProofData {
  const root = hashObject({ SAMPLE: "merkle-root", block: lock.lockBlockNumber });
  return {
    root,
    siblings: [0, 1, 2].map((d) => ({
      hash: hashObject({ SAMPLE: "sibling", tx: lock.sepoliaTxHash, d }),
      isLeft: d % 2 === 0,
    })),
  };
}

function sampleContinuityProof(minHeight: number, count: number): ContinuityProofData {
  return {
    lowerEndpointDigest: hashObject({ SAMPLE: "lower-endpoint", minHeight }),
    roots: Array.from({ length: Math.max(1, count) }, (_, i) =>
      hashObject({ SAMPLE: "continuity-root", h: minHeight + i }),
    ),
  };
}

/**
 * Build the proof record for a batch of source locks.
 *
 * In `mock` mode this produces SAMPLE-prefixed material with the exact shape the chain adapter
 * returns, so wiring the real adapter in is a swap and not a re-model.
 */
export function buildProofRecord(
  locks: SourceLockRecord[],
  opts: {
    proverAgent?: string;
    status?: ProofPipelineStatus;
    attestationLagMinutes?: number;
    attestedHeight?: number;
    creditcoinTxHash?: Hex;
    verificationBlockNumber?: number;
    preflightVerified?: boolean;
  } = {},
): AttestcoinProofRecord {
  const ordered = [...locks].sort((a, b) =>
    a.lockBlockNumber !== b.lockBlockNumber
      ? a.lockBlockNumber - b.lockBlockNumber
      : a.lockTxIndex - b.lockTxIndex,
  );
  const heights = ordered.map((l) => l.lockBlockNumber);
  const minHeight = heights.length ? Math.min(...heights) : 0;
  const maxHeight = heights.length ? Math.max(...heights) : 0;

  return {
    chainKey: SEPOLIA_CHAIN_KEY,
    heights,
    txIndices: ordered.map((l) => l.lockTxIndex),
    encodedTxs: ordered.map((l) => l.sepoliaTxHash),
    merkleProofs: ordered.map(sampleMerkleProof),
    continuityProof: sampleContinuityProof(minHeight, maxHeight - minHeight + 1),
    batchSize: ordered.length,
    preflightVerified: opts.preflightVerified ?? true,
    proofPipelineStatus: opts.status ?? "VERIFIED",
    attestationLagMinutes: opts.attestationLagMinutes ?? midpointLagMinutes(),
    attestedHeight: opts.attestedHeight ?? maxHeight,
    proverAgent: opts.proverAgent ?? "kestrel",
    precompile: ATTESTCOIN_PRECOMPILE,
    creditcoinTxHash: opts.creditcoinTxHash,
    verificationBlockNumber: opts.verificationBlockNumber,
    verifiedAt: (opts.status ?? "VERIFIED") === "VERIFIED" ? new Date().toISOString() : undefined,
  };
}

/**
 * The checks the dApp MUST perform that the precompile does NOT.
 *
 * 1. `receipt.status == 0x1` — the precompile verifies inclusion, not success. A reverted lock is
 *    a genuinely included transaction and would otherwise win priority.
 * 2. The emitting contract — the reference `ASCBase` never records WHO emitted the verified
 *    transaction, so a genuine proof of a look-alike contract's Lock event would verify. Every
 *    proof must be bound to the collateral's registered vault.
 */
export function enforceDappSideChecks(
  locks: SourceLockRecord[],
  registeredVault: Hex,
): { ok: boolean; failures: string[] } {
  const failures: string[] = [];
  for (const l of locks) {
    if (l.receiptStatus !== 1) {
      failures.push(`${l.sepoliaTxHash.slice(0, 14)}… reverted on Sepolia (status != 0x1) — rejected`);
    }
    if (registeredVault && l.emittedBy.toLowerCase() !== registeredVault.toLowerCase()) {
      failures.push(
        `${l.sepoliaTxHash.slice(0, 14)}… was emitted by ${l.emittedBy.slice(0, 12)}…, not the registered vault ` +
          `${registeredVault.slice(0, 12)}… — look-alike contract rejected`,
      );
    }
  }
  return { ok: failures.length === 0, failures };
}
