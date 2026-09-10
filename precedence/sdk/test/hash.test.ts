/**
 * Canonical hashing.
 *
 * @remarks A facility is identified by the keccak256 of its document's canonical JSON, and both
 * registration paths — one signed on Creditcoin, one stored locally — derive it the same way. If
 * canonicalisation were order-sensitive the same document would hash two ways depending on which
 * form built the object, and the app would hold two records of one asset. Double-registration of
 * a single document is precisely the condition this protocol exists to make detectable, so it
 * must not be something the hash function can cause on its own.
 */
import { describe, expect, test } from "bun:test";
import { canonicalize, hashObject, hashString, randomNonce } from "../src/hash";

describe("canonicalize", () => {
  test("sorts object keys", () => {
    expect(canonicalize({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });

  test("sorts keys at every depth", () => {
    expect(canonicalize({ z: { d: 1, c: 2 }, a: 3 })).toBe('{"a":3,"z":{"c":2,"d":1}}');
  });

  test("preserves array order, which is meaningful", () => {
    expect(canonicalize([3, 1, 2])).toBe("[3,1,2]");
  });

  test("sorts keys inside array members", () => {
    expect(canonicalize([{ b: 1, a: 2 }])).toBe('[{"a":2,"b":1}]');
  });

  test("passes primitives through", () => {
    expect(canonicalize(42)).toBe("42");
    expect(canonicalize("x")).toBe('"x"');
    expect(canonicalize(true)).toBe("true");
    expect(canonicalize(null)).toBe("null");
  });

  test("is stable across two differently-built copies of one object", () => {
    const a = { obligor: "N", faceValueUsd: 1, custodian: "C" };
    const b = { custodian: "C", faceValueUsd: 1, obligor: "N" };
    expect(canonicalize(a)).toBe(canonicalize(b));
  });

  test("distinguishes a missing key from an explicit undefined only as JSON does", () => {
    // Pinned rather than asserted as desirable: JSON.stringify drops undefined values, so these
    // canonicalise identically. Worth knowing before putting an optional field in a document hash.
    expect(canonicalize({ a: 1 })).toBe(canonicalize({ a: 1, b: undefined }));
  });

  test("distinguishes a number from its string form", () => {
    expect(canonicalize({ a: 1 })).not.toBe(canonicalize({ a: "1" }));
  });
});

describe("hashObject", () => {
  test("returns a 32-byte hash", () => {
    expect(hashObject({ a: 1 })).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("is deterministic", () => {
    expect(hashObject({ a: 1, b: [2, 3] })).toBe(hashObject({ a: 1, b: [2, 3] }));
  });

  test("does not depend on key order", () => {
    expect(hashObject({ a: 1, b: 2 })).toBe(hashObject({ b: 2, a: 1 }));
  });

  test("changes with any value", () => {
    expect(hashObject({ a: 1 })).not.toBe(hashObject({ a: 2 }));
  });

  test("changes with array order", () => {
    expect(hashObject([1, 2])).not.toBe(hashObject([2, 1]));
  });

  test("distinguishes nesting", () => {
    expect(hashObject({ a: { b: 1 } })).not.toBe(hashObject({ "a.b": 1 }));
  });
});

describe("hashString", () => {
  test("returns a 32-byte hash", () => {
    expect(hashString("precedence")).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("is deterministic", () => {
    expect(hashString("x")).toBe(hashString("x"));
  });

  test("is case sensitive", () => {
    expect(hashString("x")).not.toBe(hashString("X"));
  });

  test("hashes the empty string to a defined value", () => {
    expect(hashString("")).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("handles non-ASCII text", () => {
    expect(hashString("Antwerpen · Belgïe")).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("differs from hashObject over the same text", () => {
    // One hashes the raw bytes, the other hashes JSON — including the quotes.
    expect(hashString("x")).not.toBe(hashObject("x"));
  });
});

describe("randomNonce", () => {
  test("returns 32 bytes", () => {
    expect(randomNonce()).toMatch(/^0x[0-9a-f]{64}$/);
  });

  test("does not repeat", () => {
    const seen = new Set(Array.from({ length: 200 }, () => randomNonce()));
    expect(seen.size).toBe(200);
  });
});
