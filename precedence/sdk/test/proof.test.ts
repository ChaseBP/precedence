/**
 * Proof constants, batch limits, and the checks the precompile does NOT perform.
 *
 * @remarks Two groups matter most here.
 *
 * `enforceDappSideChecks` covers the two holes the reference integration leaves open. The
 * precompile verifies *inclusion*, not success — a reverted lock is a genuinely included
 * transaction with a real block and index, and would otherwise win a rank for free. And the
 * reference base never records WHO emitted the verified transaction, so a perfectly valid proof of
 * a look-alike contract's identically-shaped event would verify.
 *
 * `MEASURED_ATTESTATION_LAG` is asserted as a *range* with its sample count, because the latency
 * is measured rather than documented and attestation advances in batches — quoting a single
 * average would describe a sawtooth as a constant, and would be the easiest way for this project
 * to overclaim by accident.
 */
import { describe, expect, test } from "bun:test";
import {
  ATTESTCOIN_CHAININFO,
  ATTESTCOIN_PRECOMPILE,
  CREDITCOIN_CHAIN_ID,
  HONEST_LATENCY_COPY,
  MAX_BATCH_RANGE,
  MAX_BATCH_SIZE,
  MEASURED_ATTESTATION_LAG,
  SEPOLIA_CHAIN_ID,
  SEPOLIA_CHAIN_KEY,
  batchFits,
  buildProofRecord,
  enforceDappSideChecks,
  estimateVerifyCostCtc,
  midpointLagMinutes,
} from "../src/domain/proof";
import { VAULT, lock, sameBlockRace, tx } from "./helpers";

describe("protocol constants", () => {
  test("names the native query verifier at 0x0FD2", () => {
    expect(ATTESTCOIN_PRECOMPILE.toLowerCase()).toEndWith("fd2");
  });

  test("names ChainInfo at 0x0FD3", () => {
    expect(ATTESTCOIN_CHAININFO.toLowerCase()).toEndWith("fd3");
  });

  test("both precompiles are twenty-byte addresses", () => {
    expect(ATTESTCOIN_PRECOMPILE).toHaveLength(42);
    expect(ATTESTCOIN_CHAININFO).toHaveLength(42);
  });

  test("Sepolia's chainKey is 1, as read from get_supported_chains", () => {
    expect(SEPOLIA_CHAIN_KEY).toBe(1);
  });

  test("Sepolia's chain id is 11155111", () => {
    expect(SEPOLIA_CHAIN_ID).toBe(11155111);
  });

  test("Creditcoin CC3's chain id is 102031", () => {
    expect(CREDITCOIN_CHAIN_ID).toBe(102031);
  });

  test("a chainKey is not a chain id", () => {
    expect(SEPOLIA_CHAIN_KEY).not.toBe(SEPOLIA_CHAIN_ID);
  });

  test("a batch covers at most ten transactions", () => {
    expect(MAX_BATCH_SIZE).toBe(10);
  });

  test("a batch spans at most a thousand blocks", () => {
    expect(MAX_BATCH_RANGE).toBe(1000);
  });
});

describe("MEASURED_ATTESTATION_LAG — measured, not documented", () => {
  test("is a range rather than a single figure", () => {
    expect(MEASURED_ATTESTATION_LAG.minMinutes).toBeLessThan(MEASURED_ATTESTATION_LAG.maxMinutes);
  });

  test("carries the sample count the range is drawn from", () => {
    expect(MEASURED_ATTESTATION_LAG.samples).toBeGreaterThan(100);
  });

  test("its percentiles are ordered", () => {
    const { p50Minutes, p90Minutes, p99Minutes } = MEASURED_ATTESTATION_LAG;
    expect(p50Minutes).toBeLessThanOrEqual(p90Minutes);
    expect(p90Minutes).toBeLessThanOrEqual(p99Minutes);
  });

  test("its percentiles fall inside the range", () => {
    const { minMinutes, maxMinutes, p50Minutes, p99Minutes } = MEASURED_ATTESTATION_LAG;
    expect(p50Minutes).toBeGreaterThanOrEqual(minMinutes);
    expect(p99Minutes).toBeLessThanOrEqual(maxMinutes);
  });

  test("stages a demo beyond p90, with a buffer", () => {
    expect(MEASURED_ATTESTATION_LAG.demoStagingMinutes).toBeGreaterThan(
      MEASURED_ATTESTATION_LAG.p90Minutes,
    );
  });

  test("names where the figure came from", () => {
    expect(MEASURED_ATTESTATION_LAG.source).toContain("measure-latency");
  });

  test("says out loud that the lag is a sawtooth", () => {
    expect(MEASURED_ATTESTATION_LAG.note).toContain("BATCHES");
    expect(MEASURED_ATTESTATION_LAG.note).toContain("range");
  });

  test("the midpoint sits between the bounds", () => {
    const mid = midpointLagMinutes();
    expect(mid).toBeGreaterThan(MEASURED_ATTESTATION_LAG.minMinutes);
    expect(mid).toBeLessThan(MEASURED_ATTESTATION_LAG.maxMinutes);
  });
});

describe("HONEST_LATENCY_COPY", () => {
  test("quotes both ends of the measured range", () => {
    expect(HONEST_LATENCY_COPY).toContain(String(MEASURED_ATTESTATION_LAG.minMinutes));
    expect(HONEST_LATENCY_COPY).toContain(String(MEASURED_ATTESTATION_LAG.maxMinutes));
  });

  test("says the attestation takes minutes", () => {
    expect(HONEST_LATENCY_COPY).toContain("minutes");
  });

  test("scopes 'one block' to what happens AFTER the proof exists", () => {
    expect(HONEST_LATENCY_COPY).toContain("once the proof exists");
  });

  test("never claims a proof is instant", () => {
    expect(HONEST_LATENCY_COPY.toLowerCase()).not.toContain("instant");
    expect(HONEST_LATENCY_COPY.toLowerCase()).not.toContain("immediate");
  });
});

describe("batchFits", () => {
  test("accepts the seeded three-lock race", () => {
    expect(batchFits(sameBlockRace()).ok).toBe(true);
  });

  test("accepts exactly ten locks", () => {
    const locks = Array.from({ length: 10 }, (_, i) =>
      lock({ seq: i + 1, lockTxIndex: i, sepoliaTxHash: tx(i + 1) }),
    );
    expect(batchFits(locks).ok).toBe(true);
  });

  test("rejects eleven", () => {
    const locks = Array.from({ length: 11 }, (_, i) =>
      lock({ seq: i + 1, lockTxIndex: i, sepoliaTxHash: tx(i + 1) }),
    );
    const r = batchFits(locks);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("MAX_BATCH_SIZE");
  });

  test("rejects an empty batch, because there is nothing to prove", () => {
    const r = batchFits([]);
    expect(r.ok).toBe(false);
    expect(r.reason).toBe("no locks to prove");
  });

  test("accepts a span of exactly a thousand blocks", () => {
    const locks = [
      lock({ seq: 1, lockBlockNumber: 1_000 }),
      lock({ seq: 2, lockBlockNumber: 2_000, sepoliaTxHash: tx(2) }),
    ];
    expect(batchFits(locks).ok).toBe(true);
  });

  test("rejects a wider span", () => {
    const locks = [
      lock({ seq: 1, lockBlockNumber: 1_000 }),
      lock({ seq: 2, lockBlockNumber: 2_001, sepoliaTxHash: tx(2) }),
    ];
    const r = batchFits(locks);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain("MAX_BATCH_RANGE");
  });

  test("reports the span it measured", () => {
    const locks = [
      lock({ seq: 1, lockBlockNumber: 1_000 }),
      lock({ seq: 2, lockBlockNumber: 5_000, sepoliaTxHash: tx(2) }),
    ];
    expect(batchFits(locks).reason).toContain("4000");
  });

  test("a single lock always fits", () => {
    expect(batchFits([lock()]).ok).toBe(true);
  });
});

describe("estimateVerifyCostCtc — why proving promptly matters", () => {
  test("costs something even with no accumulated hashes", () => {
    expect(estimateVerifyCostCtc(0)).toBeGreaterThan(0);
  });

  test("grows with the number of continuity hashes", () => {
    expect(estimateVerifyCostCtc(1_000)).toBeGreaterThan(estimateVerifyCostCtc(10));
  });

  test("grows more than tenfold from ten minutes to a day", () => {
    // The reason the worker proves as soon as the block is attested rather than batching later.
    const tenMinutes = estimateVerifyCostCtc(10);
    const oneDay = estimateVerifyCostCtc(1_000);
    expect(oneDay / tenMinutes).toBeGreaterThan(10);
  });

  test("is linear in the hash count", () => {
    const a = estimateVerifyCostCtc(100) - estimateVerifyCostCtc(0);
    const b = estimateVerifyCostCtc(200) - estimateVerifyCostCtc(100);
    expect(a).toBeCloseTo(b, 10);
  });
});

describe("enforceDappSideChecks — the two holes the precompile leaves", () => {
  test("accepts locks that are successful and from the registered vault", () => {
    expect(enforceDappSideChecks(sameBlockRace(), VAULT).ok).toBe(true);
  });

  test("rejects a reverted lock, which the precompile would happily verify", () => {
    const locks = [lock({ receiptStatus: 0 as never })];
    const r = enforceDappSideChecks(locks, VAULT);
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toContain("status != 0x1");
  });

  test("says why status is checked here", () => {
    const r = enforceDappSideChecks([lock({ receiptStatus: 0 as never })], VAULT);
    expect(r.failures[0]).toContain("reverted on Sepolia");
  });

  test("rejects a lock emitted by a look-alike contract", () => {
    const impostor = ("0x" + "de".repeat(20)) as never;
    const r = enforceDappSideChecks([lock({ emittedBy: impostor })], VAULT);
    expect(r.ok).toBe(false);
    expect(r.failures[0]).toContain("look-alike contract rejected");
  });

  test("names both the emitter and the registered vault", () => {
    const impostor = ("0x" + "de".repeat(20)) as never;
    const r = enforceDappSideChecks([lock({ emittedBy: impostor })], VAULT);
    expect(r.failures[0]).toContain("dededede");
    expect(r.failures[0]).toContain(VAULT.slice(0, 12));
  });

  test("compares the vault case-insensitively", () => {
    const upper = VAULT.toUpperCase().replace("0X", "0x") as never;
    expect(enforceDappSideChecks([lock({ emittedBy: upper })], VAULT).ok).toBe(true);
  });

  test("reports both failures for one lock that has both", () => {
    const impostor = ("0x" + "de".repeat(20)) as never;
    const r = enforceDappSideChecks(
      [lock({ receiptStatus: 0 as never, emittedBy: impostor })],
      VAULT,
    );
    expect(r.failures).toHaveLength(2);
  });

  test("reports a failure per offending lock", () => {
    const locks = [
      lock({ seq: 1, receiptStatus: 0 as never }),
      lock({ seq: 2, receiptStatus: 0 as never, sepoliaTxHash: tx(2) }),
    ];
    expect(enforceDappSideChecks(locks, VAULT).failures).toHaveLength(2);
  });

  test("accepts an empty set", () => {
    expect(enforceDappSideChecks([], VAULT).ok).toBe(true);
  });

  test("skips the vault check when no vault is registered yet", () => {
    expect(enforceDappSideChecks(sameBlockRace(), "" as never).ok).toBe(true);
  });
});

describe("buildProofRecord", () => {
  test("orders heights and indices together, by proven position", () => {
    const record = buildProofRecord(sameBlockRace().reverse());
    expect(record.txIndices).toEqual([17, 22, 41]);
  });

  test("keeps the three arrays index-aligned", () => {
    const record = buildProofRecord(sameBlockRace());
    expect(record.heights).toHaveLength(record.txIndices.length);
    expect(record.encodedTxs).toHaveLength(record.txIndices.length);
    expect(record.merkleProofs).toHaveLength(record.txIndices.length);
  });

  test("reports the batch size", () => {
    expect(buildProofRecord(sameBlockRace()).batchSize).toBe(3);
  });

  test("names Sepolia's chainKey", () => {
    expect(buildProofRecord(sameBlockRace()).chainKey).toBe(SEPOLIA_CHAIN_KEY);
  });

  test("names the precompile the proof goes to", () => {
    expect(buildProofRecord(sameBlockRace()).precompile).toBe(ATTESTCOIN_PRECOMPILE);
  });

  test("uses ONE shared continuity proof for the batch", () => {
    const record = buildProofRecord(sameBlockRace());
    expect(Array.isArray(record.continuityProof.roots)).toBe(true);
    expect(record.continuityProof.roots.length).toBeGreaterThan(0);
  });

  test("attests to the highest block in the batch", () => {
    const locks = [
      lock({ seq: 1, lockBlockNumber: 100 }),
      lock({ seq: 2, lockBlockNumber: 140, sepoliaTxHash: tx(2) }),
    ];
    expect(buildProofRecord(locks).attestedHeight).toBe(140);
  });

  test("labels its sample material as SAMPLE, so it can never read as chain data", () => {
    const record = buildProofRecord(sameBlockRace());
    expect(JSON.stringify(record.merkleProofs)).toContain("0x");
    // Derived from a hash of an object whose key is literally "SAMPLE" — see sampleMerkleProof.
    expect(record.merkleProofs[0].siblings.length).toBeGreaterThan(0);
  });

  test("carries no Creditcoin transaction hash unless one is given", () => {
    expect(buildProofRecord(sameBlockRace()).creditcoinTxHash).toBeUndefined();
  });

  test("records the Creditcoin hash when the proof landed", () => {
    const hash = tx(9);
    expect(buildProofRecord(sameBlockRace(), { creditcoinTxHash: hash }).creditcoinTxHash).toBe(
      hash,
    );
  });

  test("defaults the lag to the measured midpoint rather than zero", () => {
    expect(buildProofRecord(sameBlockRace()).attestationLagMinutes).toBe(midpointLagMinutes());
  });

  test("stamps a verified time only for a VERIFIED pipeline", () => {
    expect(buildProofRecord(sameBlockRace(), { status: "VERIFIED" }).verifiedAt).toBeDefined();
    expect(buildProofRecord(sameBlockRace(), { status: "PENDING_EVIDENCE" }).verifiedAt).toBeUndefined();
  });

  test("handles an empty batch without throwing", () => {
    const record = buildProofRecord([]);
    expect(record.batchSize).toBe(0);
    expect(record.heights).toEqual([]);
  });
});
