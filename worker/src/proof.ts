/**
 * The Attestcoin readability pipeline.
 *
 * Stages, in order, with the honest costs of each:
 *
 *   1. Read receipts from the source chain            — instant
 *   2. waitUntilHeightAttested()                      — MEASURED 7-9 min (sawtooth)
 *   3. getBatchProof(txHashes)                        — seconds; ONE shared continuity proof
 *   4. verify(...) view-only preflight                — FREE, catches a bad batch before gas
 *   5. settleRace(...)                                — ONE Creditcoin block (~15s)
 *
 * "One block" refers only to stages 4-5. Stage 2 is minutes and must never be hidden.
 *
 * @module
 */
import { ethers } from "ethers";
import { chainInfo as sdkChainInfo, proofProvider } from "@gluwa/usc-sdk";
import {
  CHAIN_INFO_PRECOMPILE,
  MAX_BATCH_RANGE,
  MAX_BATCH_SIZE,
  SEPOLIA_CHAIN_KEY,
  creditcoinProvider,
  proofBuilderUrl,
} from "./config";

/** Mirrors `INativeQueryVerifier.MerkleProofEntry`. */
export interface MerkleProofEntry {
  hash: string;
  isLeft: boolean;
}
/** Mirrors `INativeQueryVerifier.MerkleProof`. */
export interface MerkleProof {
  root: string;
  siblings: MerkleProofEntry[];
}
/** Mirrors `INativeQueryVerifier.ContinuityProof`. */
export interface ContinuityProof {
  lowerEndpointDigest: string;
  roots: string[];
}

/** Mirrors `AttestationGate.RaceProof`, ready to pass straight to ethers. */
export interface RaceProof {
  heights: number[];
  encodedTxs: string[];
  merkleProofs: MerkleProof[];
  sharedProof: ContinuityProof;
}

export interface ProvenTx {
  txHash: string;
  height: number;
  /** Derived by the proof service; the gate independently re-derives it via `calculateTxIndex`. */
  txIndex: number;
  encodedTx: string;
  merkleProof: MerkleProof;
}

export interface BuiltProof {
  proof: RaceProof;
  ordered: ProvenTx[];
  attestedHeight: number;
  /** Wall-clock minutes spent waiting for attestation. The honest figure, not an estimate. */
  attestationWaitMinutes: number;
  builtAtZ: string;
}

// ─────────────────────────────── attestation ───────────────────────────────

export function chainInfo() {
  // The SDK's ChainInfo provider takes an ethers provider, not a URL.
  return new sdkChainInfo.PrecompileChainInfoProvider(creditcoinProvider(), CHAIN_INFO_PRECOMPILE);
}

export function builder() {
  // ProofBuilder(chainKey, builderUrl, timeout?) — NOT a wrapped ChainInfo provider.
  return new proofProvider.service.ProofBuilder(SEPOLIA_CHAIN_KEY, proofBuilderUrl());
}

export interface AttestationStatus {
  latestAttestedHeight: number;
  sourceHead: number;
  lagBlocks: number;
  lagMinutes: number;
}

export async function attestationStatus(sourceProvider: ethers.JsonRpcProvider): Promise<AttestationStatus> {
  const info = chainInfo();
  const [{ height }, head] = await Promise.all([
    info.getLatestAttestedHeightAndHash(SEPOLIA_CHAIN_KEY),
    sourceProvider.getBlockNumber(),
  ]);
  const latest = Number(height);
  const blk = await sourceProvider.getBlock(latest);
  return {
    latestAttestedHeight: latest,
    sourceHead: head,
    lagBlocks: head - latest,
    lagMinutes: blk ? Math.round(((Date.now() / 1000 - blk.timestamp) / 60) * 100) / 100 : 0,
  };
}

/**
 * Wait for attestation to reach `targetHeight`, reporting progress.
 *
 * @dev The wait is real and takes minutes. `onProgress` exists so the UI can render a patient
 * PENDING_EVIDENCE state with a truthful elapsed time instead of a spinner that implies imminence.
 */
export async function waitForAttestation(
  targetHeight: number,
  opts: { pollMs?: number; timeoutMs?: number; onProgress?: (s: AttestationStatus & { elapsedMinutes: number }) => void } = {},
  sourceProvider?: ethers.JsonRpcProvider,
): Promise<{ waitedMinutes: number; attestedHeight: number }> {
  const info = chainInfo();
  const started = Date.now();
  const pollMs = opts.pollMs ?? 15_000;
  const timeoutMs = opts.timeoutMs ?? 30 * 60_000;

  for (;;) {
    const { height } = await info.getLatestAttestedHeightAndHash(SEPOLIA_CHAIN_KEY);
    const attested = Number(height);
    const elapsedMinutes = Math.round(((Date.now() - started) / 60_000) * 100) / 100;

    if (opts.onProgress && sourceProvider) {
      const head = await sourceProvider.getBlockNumber();
      opts.onProgress({
        latestAttestedHeight: attested,
        sourceHead: head,
        lagBlocks: head - attested,
        lagMinutes: 0,
        elapsedMinutes,
      });
    }

    if (attested >= targetHeight) {
      return { waitedMinutes: elapsedMinutes, attestedHeight: attested };
    }
    if (Date.now() - started > timeoutMs) {
      throw new Error(
        `Attestation did not reach height ${targetHeight} within ${timeoutMs / 60_000} min ` +
          `(latest ${attested}). This is a PENDING_EVIDENCE condition, not a failure — the proof is ` +
          `simply not available yet.`,
      );
    }
    await new Promise((r) => setTimeout(r, pollMs));
  }
}

// ─────────────────────────────── proof construction ───────────────────────────────

export function checkBatchLimits(heights: number[]): { ok: boolean; reason?: string } {
  if (heights.length === 0) return { ok: false, reason: "no transactions to prove" };
  if (heights.length > MAX_BATCH_SIZE) {
    return { ok: false, reason: `${heights.length} exceeds MAX_BATCH_SIZE of ${MAX_BATCH_SIZE}` };
  }
  const span = Math.max(...heights) - Math.min(...heights);
  if (span > MAX_BATCH_RANGE) {
    return { ok: false, reason: `block span ${span} exceeds MAX_BATCH_RANGE of ${MAX_BATCH_RANGE}` };
  }
  return { ok: true };
}

/**
 * Flatten the SDK's batch response into the gate's `RaceProof`.
 *
 * @dev This is the one genuinely fiddly mapping in the worker. `getBatchProof` returns
 * `merkleProofs` as a NESTED map — `Map<headerNumber, Map<txIndex, entry>>` — which is convenient
 * for lookup and useless for a contract call. Two things have to happen here:
 *
 *  1. **Flatten and sort by `(height, txIndex)`.** The gate requires strictly increasing proven
 *     order and will revert otherwise, so submitting in map-iteration order would fail
 *     intermittently depending on insertion order. Sorting here is not cosmetic.
 *
 *  2. **Keep the arrays index-aligned.** `heights[i]`, `encodedTxs[i]` and `merkleProofs[i]` must
 *     describe the same transaction. The precompile has no way to detect a misalignment — it would
 *     verify a real transaction against the wrong height and fail confusingly.
 *
 * The `txIndex` the service reports is carried through for cross-checking, but the gate does not
 * trust it: it re-derives the position from the Merkle path with `calculateTxIndex`. Two independent
 * witnesses of the same fact.
 */
export function flattenBatchProof(batch: {
  continuityProof: { lowerEndpointDigest: string; roots: string[] };
  merkleProofs: Map<number, Map<number, { txHash: string; txBytes: string; merkleProof: { root: string; siblings: { hash: string; isLeft: boolean }[] } }>>;
}): { proof: RaceProof; ordered: ProvenTx[] } {
  const flat: ProvenTx[] = [];

  for (const [height, byIndex] of batch.merkleProofs) {
    for (const [txIndex, entry] of byIndex) {
      flat.push({
        txHash: entry.txHash,
        height: Number(height),
        txIndex: Number(txIndex),
        encodedTx: entry.txBytes,
        merkleProof: {
          root: entry.merkleProof.root,
          siblings: entry.merkleProof.siblings.map((s) => ({ hash: s.hash, isLeft: s.isLeft })),
        },
      });
    }
  }

  // Proven order. The gate enforces this, so get it right here rather than discover it on-chain.
  flat.sort((a, b) => (a.height !== b.height ? a.height - b.height : a.txIndex - b.txIndex));

  return {
    ordered: flat,
    proof: {
      heights: flat.map((t) => t.height),
      encodedTxs: flat.map((t) => t.encodedTx),
      merkleProofs: flat.map((t) => t.merkleProof),
      sharedProof: {
        lowerEndpointDigest: batch.continuityProof.lowerEndpointDigest,
        roots: batch.continuityProof.roots,
      },
    },
  };
}

/**
 * Build a batch proof for a set of source transactions, waiting for attestation first.
 *
 * @param txHashes source-chain transaction hashes — `getBatchProof` takes HASHES, not
 *                 `(chainKey, block, txIndex)` as an earlier draft of the spec assumed.
 */
export async function buildRaceProof(
  txHashes: string[],
  sourceProvider: ethers.JsonRpcProvider,
  opts: { onStage?: (stage: string, detail: string) => void; skipWait?: boolean } = {},
): Promise<BuiltProof> {
  const say = opts.onStage ?? (() => {});

  // ── 1. receipts, and the status check the precompile will not do ──
  const receipts = await Promise.all(txHashes.map((h) => sourceProvider.getTransactionReceipt(h)));
  receipts.forEach((r, i) => {
    if (!r) throw new Error(`Transaction ${txHashes[i]} not found on the source chain`);
    if (r.status !== 1) {
      throw new Error(
        `Transaction ${txHashes[i]} REVERTED on the source chain (status ${r.status}). ` +
          `The precompile would still prove its inclusion, so refusing it here is the point.`,
      );
    }
  });

  const heights = receipts.map((r) => r!.blockNumber);
  const limits = checkBatchLimits(heights);
  if (!limits.ok) throw new Error(`Batch cannot share one continuity proof: ${limits.reason}`);

  const maxHeight = Math.max(...heights);
  say(
    "receipts",
    `${txHashes.length} transactions, all status 1, blocks ${Math.min(...heights)}–${maxHeight} ` +
      `(span ${maxHeight - Math.min(...heights)} of ${MAX_BATCH_RANGE} allowed)`,
  );

  // ── 2. the honest wait ──
  let attestationWaitMinutes = 0;
  let attestedHeight = maxHeight;
  if (!opts.skipWait) {
    const before = await attestationStatus(sourceProvider);
    say(
      "attestation",
      `waiting for height ${maxHeight}; attestation is currently at ${before.latestAttestedHeight} ` +
        `(${before.lagBlocks} blocks / ${before.lagMinutes} min behind). This takes MINUTES.`,
    );
    const waited = await waitForAttestation(
      maxHeight,
      {
        onProgress: (s) =>
          say("attestation", `attested ${s.latestAttestedHeight} / need ${maxHeight} · waited ${s.elapsedMinutes} min`),
      },
      sourceProvider,
    );
    attestationWaitMinutes = waited.waitedMinutes;
    attestedHeight = waited.attestedHeight;
    say("attestation", `height ${maxHeight} attested after ${attestationWaitMinutes} min`);
  }

  // ── 3. one shared continuity proof for the whole batch ──
  const result = await builder().getBatchProof(txHashes);
  if (!result.success || !result.data) {
    throw new Error(`getBatchProof failed: ${result.error ?? "unknown error"}`);
  }
  const { proof, ordered } = flattenBatchProof(result.data as never);

  say(
    "proof",
    `getBatchProof → 1 shared continuity proof (${proof.sharedProof.roots.length} roots) covering ` +
      `blocks ${result.data.fromHeader}–${result.data.toHeader}, plus ${proof.merkleProofs.length} ` +
      `Merkle proofs. Proven order: ${ordered.map((t) => `${t.height}:${t.txIndex}`).join(" → ")}`,
  );

  return {
    proof,
    ordered,
    attestedHeight,
    attestationWaitMinutes,
    builtAtZ: new Date().toISOString(),
  };
}

/**
 * Free, view-only preflight through the precompile's non-mutating `verify`.
 *
 * @dev Worth doing every time: a malformed batch costs nothing here and would otherwise cost a
 * failed transaction plus the confusion of a revert inside proof verification.
 */
export async function preflight(
  gateContract: ethers.Contract,
  proof: RaceProof,
): Promise<{ ok: boolean; error?: string }> {
  try {
    const ok = await gateContract.preflightBatch(proof);
    return { ok: Boolean(ok) };
  } catch (e) {
    const err = e as { shortMessage?: string; message?: string };
    return { ok: false, error: err.shortMessage ?? err.message ?? String(e) };
  }
}

/**
 * Verification cost grows with proof AGE, because continuity hashes accumulate:
 *   ≈ 2.3e-5 + 2.9e-7 × (continuity hash count) CTC
 * A 10-minute-old transaction is ~2.6e-5 CTC; the same one at 24h is ~3.1e-4 CTC — over 10× more.
 * So the worker proves promptly rather than batching work up.
 */
export function estimateVerifyCostCtc(continuityHashCount: number): number {
  return 2.3e-5 + 2.9e-7 * continuityHashCount;
}
