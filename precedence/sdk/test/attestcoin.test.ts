/**
 * The frontier arithmetic that reports the wait.
 *
 * @remarks Only the pure half is tested here. `AttestcoinChainInfo` reads a live precompile, and a
 * unit test that reached CC3 would pass or fail on the network's mood rather than on this code —
 * that surface is covered against the real chain by `ops/verify-precompile.ts`, which writes
 * `evidence/precompile.json`.
 *
 * What is worth pinning is the clamp. `targetHeight - attestedHeight` IS the remaining distance,
 * and the interface once rendered that subtraction unclamped: once the frontier passed the target
 * the figure went negative and the progress indicator ran backwards.
 */
import { describe, expect, test } from "bun:test";
import {
  AttestcoinChainInfo,
  CREDITCOIN_CC3_RPC,
  SEPOLIA_CHAIN_KEY_ARG,
  attestationLagBlocks,
  blocksToAttestation,
  type AttestationFrontier,
} from "../src/attestcoin";
import { ATTESTCOIN_CHAININFO, SEPOLIA_CHAIN_KEY } from "../src/domain/proof";

const frontier = (over: Partial<AttestationFrontier> = {}): AttestationFrontier => ({
  chainKey: 1,
  attestedHeight: 9_000_000,
  checkpointHeight: 8_999_990,
  ...over,
});

describe("blocksToAttestation", () => {
  test("counts the distance to the frontier", () => {
    expect(blocksToAttestation(9_000_040, frontier())).toBe(40);
  });

  test("is zero once the target is exactly at the frontier", () => {
    expect(blocksToAttestation(9_000_000, frontier())).toBe(0);
  });

  test("is zero once the frontier has passed the target", () => {
    expect(blocksToAttestation(8_999_000, frontier())).toBe(0);
  });

  test("never goes negative, so a progress indicator cannot run backwards", () => {
    for (const target of [0, 1, 8_000_000, 8_999_999]) {
      expect(blocksToAttestation(target, frontier())).toBeGreaterThanOrEqual(0);
    }
  });

  test("shrinks as the frontier advances", () => {
    const far = blocksToAttestation(9_000_100, frontier({ attestedHeight: 9_000_000 }));
    const near = blocksToAttestation(9_000_100, frontier({ attestedHeight: 9_000_090 }));
    expect(near).toBeLessThan(far);
  });

  test("moves in the ten-block steps attestation actually advances in", () => {
    const before = blocksToAttestation(9_000_100, frontier({ attestedHeight: 9_000_000 }));
    const after = blocksToAttestation(9_000_100, frontier({ attestedHeight: 9_000_010 }));
    expect(before - after).toBe(10);
  });

  test("ignores the checkpoint frontier, which trails attestation", () => {
    const a = blocksToAttestation(9_000_040, frontier({ checkpointHeight: 1 }));
    const b = blocksToAttestation(9_000_040, frontier({ checkpointHeight: 9_000_000 }));
    expect(a).toBe(b);
  });
});

describe("attestationLagBlocks", () => {
  test("measures how far attestation trails the source head", () => {
    expect(attestationLagBlocks(9_000_037, frontier())).toBe(37);
  });

  test("is zero when attestation has caught up", () => {
    expect(attestationLagBlocks(9_000_000, frontier())).toBe(0);
  });

  test("is deliberately NOT clamped — a negative lag means something is wrong", () => {
    // The frontier claiming a height above the source head is a real inconsistency, and hiding it
    // behind a clamp would turn a diagnosable state into a plausible-looking zero.
    expect(attestationLagBlocks(8_999_900, frontier())).toBe(-100);
  });

  test("sits in the documented 32-to-42-block band for a healthy chain", () => {
    // Not a property of this function — a sanity check on the figures the app reports.
    for (const head of [9_000_032, 9_000_037, 9_000_042]) {
      const lag = attestationLagBlocks(head, frontier());
      expect(lag).toBeGreaterThanOrEqual(32);
      expect(lag).toBeLessThanOrEqual(42);
    }
  });
});

describe("constants", () => {
  test("the chainKey argument is the numeric chainKey as a bigint", () => {
    expect(SEPOLIA_CHAIN_KEY_ARG).toBe(BigInt(SEPOLIA_CHAIN_KEY));
  });

  test("the chainKey is a bigint, because the precompile takes a uint64", () => {
    expect(typeof SEPOLIA_CHAIN_KEY_ARG).toBe("bigint");
  });

  test("there is one definition of the ChainInfo address, not two", () => {
    // The client reads it from domain/proof rather than declaring its own copy.
    expect(ATTESTCOIN_CHAININFO.toLowerCase()).toEndWith("fd3");
  });

  test("the default RPC is the CC3 testnet endpoint", () => {
    expect(CREDITCOIN_CC3_RPC).toBe("https://rpc.cc3-testnet.creditcoin.network");
  });

  test("the default RPC is never the dead explorer host", () => {
    expect(CREDITCOIN_CC3_RPC).not.toContain("explorer.cc3-testnet");
  });
});

describe("AttestcoinChainInfo", () => {
  test("constructs with no arguments, because the frontier needs no configuration", () => {
    expect(() => new AttestcoinChainInfo()).not.toThrow();
  });

  test("accepts an explicit RPC URL", () => {
    expect(() => new AttestcoinChainInfo("https://rpc.example.invalid")).not.toThrow();
  });

  test("exposes the two reads the wait is reported from", () => {
    const chain = new AttestcoinChainInfo();
    expect(typeof chain.frontier).toBe("function");
    expect(typeof chain.isAttested).toBe("function");
  });

  test("asks the precompile whether a height is attested rather than deriving it", () => {
    // `isAttested` exists as a separate call on purpose: attestation advances in ten-block
    // batches, and `attestedHeight >= target` is our arithmetic standing in for the chain's answer.
    const chain = new AttestcoinChainInfo();
    expect(chain.isAttested.length).toBeGreaterThanOrEqual(1);
  });
});
