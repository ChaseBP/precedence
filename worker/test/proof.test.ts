/**
 * Tests for the worker's pure logic — the parts that can be wrong silently.
 *
 * The proof pipeline's network stages are exercised end-to-end against real testnets; these cover
 * the transformations where a mistake produces a confusing on-chain revert rather than an obvious
 * failure. `flattenBatchProof` in particular: the SDK hands back a nested map, the contract needs
 * three index-aligned arrays in proven order, and getting the alignment wrong would verify a real
 * transaction against the wrong height.
 *
 *   bun test
 */
import { describe, expect, test } from "bun:test";
import { checkBatchLimits, flattenBatchProof } from "../src/proof";
import { validateLockSet, type WatchedLock } from "../src/watch";

// ─────────────────────────── helpers ───────────────────────────

function entry(txHash: string, root: string, siblings: { hash: string; isLeft: boolean }[] = []) {
  return { txHash, txBytes: `0xdeadbeef${txHash.slice(2, 6)}`, merkleProof: { root, siblings } };
}

/** Shape a `getBatchProof` response: Map<height, Map<txIndex, entry>>. */
function batch(
  rows: { height: number; txIndex: number; txHash: string }[],
  roots = ["0xr1", "0xr2"],
) {
  const merkleProofs = new Map<number, Map<number, ReturnType<typeof entry>>>();
  for (const r of rows) {
    if (!merkleProofs.has(r.height)) merkleProofs.set(r.height, new Map());
    merkleProofs.get(r.height)!.set(r.txIndex, entry(r.txHash, `0xroot${r.height}`));
  }
  return {
    continuityProof: { lowerEndpointDigest: "0xlower", roots },
    merkleProofs,
  };
}

function lock(p: Partial<WatchedLock> & { seq: number; blockNumber: number; txIndex: number }): WatchedLock {
  return {
    collateralId: "0xcol",
    financier: "0xfin",
    tranche: 0,
    amount: 1_000_000n,
    raceNonce: 1,
    txHash: `0xtx${p.seq}`,
    ...p,
  };
}

// ═══════════════════════════ flattenBatchProof ═══════════════════════════

describe("flattenBatchProof", () => {
  test("flattens the nested map into index-aligned arrays", () => {
    const { proof, ordered } = flattenBatchProof(
      batch([
        { height: 100, txIndex: 17, txHash: "0xaa11" },
        { height: 100, txIndex: 22, txHash: "0xbb22" },
        { height: 101, txIndex: 3, txHash: "0xcc33" },
      ]) as never,
    );

    expect(proof.heights.length).toBe(3);
    expect(proof.encodedTxs.length).toBe(3);
    expect(proof.merkleProofs.length).toBe(3);

    // The three arrays must describe the same transaction at each index. The precompile cannot
    // detect a misalignment — it would verify a real tx against the wrong height.
    ordered.forEach((t, i) => {
      expect(proof.heights[i]).toBe(t.height);
      expect(proof.encodedTxs[i]).toBe(t.encodedTx);
      expect(proof.merkleProofs[i]).toEqual(t.merkleProof);
    });
  });

  test("sorts by (height, txIndex) — the gate reverts on anything else", () => {
    // Deliberately inserted out of order, and with the higher block first.
    const { ordered } = flattenBatchProof(
      batch([
        { height: 101, txIndex: 3, txHash: "0xcc33" },
        { height: 100, txIndex: 22, txHash: "0xbb22" },
        { height: 100, txIndex: 17, txHash: "0xaa11" },
      ]) as never,
    );

    expect(ordered.map((t) => `${t.height}:${t.txIndex}`)).toEqual(["100:17", "100:22", "101:3"]);
  });

  test("orders same-block transactions by txIndex alone", () => {
    // The case the whole protocol turns on: one block, three positions.
    const { ordered } = flattenBatchProof(
      batch([
        { height: 6182101, txIndex: 41, txHash: "0xnovum" },
        { height: 6182101, txIndex: 17, txHash: "0xmeridian" },
        { height: 6182101, txIndex: 22, txHash: "0xvector" },
      ]) as never,
    );

    expect(ordered.map((t) => t.txIndex)).toEqual([17, 22, 41]);
    expect(ordered[0].txHash).toBe("0xmeridian");
    expect(new Set(ordered.map((t) => t.height)).size).toBe(1);
  });

  test("carries ONE shared continuity proof for the whole batch", () => {
    const { proof } = flattenBatchProof(
      batch(
        [
          { height: 100, txIndex: 1, txHash: "0xa" },
          { height: 105, txIndex: 2, txHash: "0xb" },
        ],
        ["0xr1", "0xr2", "0xr3"],
      ) as never,
    );

    expect(proof.sharedProof.lowerEndpointDigest).toBe("0xlower");
    expect(proof.sharedProof.roots).toEqual(["0xr1", "0xr2", "0xr3"]);
  });

  test("preserves each Merkle proof's siblings verbatim", () => {
    const sibs = [
      { hash: "0xs1", isLeft: true },
      { hash: "0xs2", isLeft: false },
    ];
    const m = new Map([[100, new Map([[7, entry("0xtx", "0xroot", sibs)]])]]);
    const { proof } = flattenBatchProof({
      continuityProof: { lowerEndpointDigest: "0xl", roots: ["0xr"] },
      merkleProofs: m,
    } as never);

    // `calculateTxIndex` derives the position from exactly these bits, so any mutation here would
    // change the priority the gate computes.
    expect(proof.merkleProofs[0].siblings).toEqual(sibs);
  });

  test("handles a single-transaction batch", () => {
    const { proof, ordered } = flattenBatchProof(
      batch([{ height: 100, txIndex: 0, txHash: "0xonly" }]) as never,
    );
    expect(ordered.length).toBe(1);
    expect(proof.heights).toEqual([100]);
  });
});

// ═══════════════════════════ batch limits ═══════════════════════════

describe("checkBatchLimits", () => {
  test("rejects an empty batch", () => {
    expect(checkBatchLimits([]).ok).toBe(false);
  });

  test("accepts exactly MAX_BATCH_SIZE", () => {
    expect(checkBatchLimits(Array(10).fill(100)).ok).toBe(true);
  });

  test("rejects more than MAX_BATCH_SIZE — one continuity proof cannot cover them", () => {
    const r = checkBatchLimits(Array(11).fill(100));
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("MAX_BATCH_SIZE");
  });

  test("accepts a span of exactly MAX_BATCH_RANGE", () => {
    expect(checkBatchLimits([1000, 2000]).ok).toBe(true);
  });

  test("rejects a span beyond MAX_BATCH_RANGE", () => {
    const r = checkBatchLimits([1000, 2001]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("MAX_BATCH_RANGE");
  });
});

// ═══════════════════════════ validateLockSet ═══════════════════════════
// Mirrors what AttestationGate + PriorityProofLib enforce on-chain. Catching these locally turns a
// wasted ~9-minute attestation wait plus a failed transaction into an immediate error.

describe("validateLockSet", () => {
  test("accepts a well-formed same-block race", () => {
    const r = validateLockSet([
      lock({ seq: 1, blockNumber: 6182101, txIndex: 17 }),
      lock({ seq: 2, blockNumber: 6182101, txIndex: 22 }),
      lock({ seq: 3, blockNumber: 6182101, txIndex: 41 }),
    ]);
    expect(r.ok).toBe(true);
    expect(r.problems).toEqual([]);
  });

  test("accepts a single uncontested lock", () => {
    expect(validateLockSet([lock({ seq: 1, blockNumber: 100, txIndex: 0 })]).ok).toBe(true);
  });

  test("rejects an empty set", () => {
    expect(validateLockSet([]).ok).toBe(false);
  });

  test("rejects a seq gap — a prover omitting a middle lock", () => {
    const r = validateLockSet([
      lock({ seq: 1, blockNumber: 100, txIndex: 1 }),
      lock({ seq: 3, blockNumber: 100, txIndex: 2 }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("seq gap"))).toBe(true);
  });

  test("rejects a set that does not start at seq 1 — omitting the FIRST lock", () => {
    // The attack that actually pays: dropping the senior winner leaves a consecutive run, so
    // contiguity alone would miss it. Requiring a start at 1 is what catches it.
    const r = validateLockSet([
      lock({ seq: 2, blockNumber: 100, txIndex: 2 }),
      lock({ seq: 3, blockNumber: 100, txIndex: 3 }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("seq gap"))).toBe(true);
  });

  test("rejects locks spliced from two different races", () => {
    const r = validateLockSet([
      lock({ seq: 1, blockNumber: 100, txIndex: 1, raceNonce: 1 }),
      lock({ seq: 2, blockNumber: 100, txIndex: 2, raceNonce: 2 }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("multiple races"))).toBe(true);
  });

  test("rejects a batch over the size cap", () => {
    const many = Array.from({ length: 11 }, (_, i) =>
      lock({ seq: i + 1, blockNumber: 100, txIndex: i + 1 }),
    );
    const r = validateLockSet(many);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("MAX_BATCH_SIZE"))).toBe(true);
  });

  test("rejects a block span beyond the continuity window", () => {
    const r = validateLockSet([
      lock({ seq: 1, blockNumber: 1000, txIndex: 1 }),
      lock({ seq: 2, blockNumber: 2500, txIndex: 1 }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("MAX_BATCH_RANGE"))).toBe(true);
  });

  test("rejects a set that is not strictly increasing in position", () => {
    // seq says 1 then 2, but the proven positions are identical — the vault contradicts itself.
    const r = validateLockSet([
      lock({ seq: 1, blockNumber: 100, txIndex: 5 }),
      lock({ seq: 2, blockNumber: 100, txIndex: 5 }),
    ]);
    expect(r.ok).toBe(false);
    expect(r.problems.some((p) => p.includes("strictly increasing"))).toBe(true);
  });
});
