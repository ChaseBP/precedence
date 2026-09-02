/**
 * In-memory staging for pending reveals and unverified proofs.
 */
import type { Hex } from "../types";

interface PendingProof {
  raceId: string;
  collateralId: string;
  sourceBlock: number;
  locks: Hex[];
  timestamp: string;
}

const g = globalThis as unknown as { __precedencePending?: Map<string, PendingProof> };
const pendingMap = (g.__precedencePending ??= new Map());

export function setPendingProof(raceId: string, proof: PendingProof): void {
  pendingMap.set(raceId, proof);
}

export function takePendingProof(raceId: string): PendingProof | undefined {
  const p = pendingMap.get(raceId);
  pendingMap.delete(raceId);
  return p;
}

// Backward compatibility alias helpers
export function setPendingReveal(id: string, payload: unknown): void {
  pendingMap.set(id, payload as PendingProof);
}

export function takePendingReveal(id: string): any {
  const p = pendingMap.get(id);
  pendingMap.delete(id);
  return p;
}
