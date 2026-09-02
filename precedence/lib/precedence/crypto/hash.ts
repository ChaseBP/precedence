/**
 * Deterministic cryptographic utilities for PRECEDENCE.
 *
 * Provides keccak256 canonical hashing for collateral document uniqueness,
 * Attestcoin verification payloads, and deterministic source-lock commitments.
 */
import { keccak256, toHex, stringToBytes } from "viem";
import type { Hex } from "../types";

/** Recursively sort object keys for a stable, canonical JSON string. */
export function canonicalize(value: unknown): string {
  return JSON.stringify(sortDeep(value));
}

function sortDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortDeep);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      out[key] = sortDeep((value as Record<string, unknown>)[key]);
    }
    return out;
  }
  return value;
}

/** keccak256 over the canonical JSON of `value`. */
export function hashObject(value: unknown): Hex {
  return keccak256(stringToBytes(canonicalize(value)));
}

/** keccak256 of an arbitrary UTF-8 string. */
export function hashString(s: string): Hex {
  return keccak256(stringToBytes(s));
}

/** A random 32-byte hex nonce (uses Web Crypto). */
export function randomNonce(): Hex {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return toHex(bytes);
}
