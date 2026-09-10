"use client";

import { PROTOCOL_STATES } from "@precedence/sdk/types";
import type {
  Agent,
  Attestation,
  CollateralAnalysis,
  CollateralAsset,
  Hex,
  LifecycleEvent,
  LifecyclePhase,
  PriorityRace,
  RaceSummary,
  RefinanceOpportunity,
  RegistrationProposal,
} from "@precedence/sdk/types";

async function jget<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return (await res.json()) as T;
}

async function jpost<T>(url: string, body?: unknown, headers?: Record<string, string>): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  return (await res.json()) as T;
}

function adminToken(): string {
  if (typeof window === "undefined") return "";
  try {
    return localStorage.getItem("precedence-admin") ?? "";
  } catch {
    return "";
  }
}

/** Terminal states close the SSE stream. Mirrors orchestrator/lifecycle.TERMINAL_PHASES. */
const TERMINAL_PHASES: LifecyclePhase[] = [
  "SETTLED_CLOSED",
  "TERMINATED_DEFAULT",
  "AUTO_REFUND",
  "ABORTED",
];


/** One poll of `/api/races/live/status`. Mirrors the route's own return shape. */
export interface SettlementStatus {
  ok: boolean;
  error?: string;
  id: string;
  stage:
    | "WINDOW_OPEN"
    | "AWAITING_CLOSE"
    | "AWAITING_ATTESTATION"
    | "PROOF_READY"
    | "PROVEN"
    | "ENCUMBERED"
    | "REPAID_AWAITING_PROOF";
  vault: {
    raceOpen: boolean;
    raceNonce: number;
    lockCount: number;
    totalLockedUsd: number;
    facilitySizeUsd: number;
    raceDeadline: number;
    secondsLeft: number;
    obligor: Hex;
    closableByAnyone: boolean;
    totalDrawnUsd: number;
    totalRepaidUsd: number;
    drawDeadline: number;
  };
  attestation: {
    chainKey: number;
    attestedHeight: number;
    checkpointHeight: number;
    sepoliaHead: number;
    lagBlocks: number;
    targetHeight: number;
    targetAttested: boolean;
    blocksToGo: number;
  };
  proverCommand: string;
  prover?: {
    /** Whether this deployment can run the prover itself, or can only name the command. */
    available: boolean;
    unavailableReason?: string;
    job?: {
      state: "running" | "done" | "failed";
      stage: string;
      startedAt: string;
      settleTxHash?: string;
      explorerUrl?: string;
      crossCheckAgrees?: boolean;
      error?: string;
      log: string[];
    };
  };
}

export interface PortfolioLending {
  collateralId: string;
  title: string;
  tranche: "SENIOR" | "JUNIOR" | "SUBORDINATE";
  priorityRank: 1 | 2 | 3;
  principalUsd: number;
  ratePct: number;
  tokenId: string;
  provenAt: { blockNumber: number; txIndex: number; seq: number };
  state: string;
  raceId: string;
  raceStatus: string;
}

export interface PortfolioRefund {
  collateralId: string;
  title: string;
  tranche: "SENIOR" | "JUNIOR" | "SUBORDINATE";
  amountUsd: number;
  reason: string;
}

export interface PortfolioBorrowing {
  collateralId: string;
  title: string;
  assetType: string;
  faceValueUsd: number;
  maxAdvanceUsd: number;
  status: string;
  termsPosted: boolean;
  drawnUsd: number;
  repaidUsd: number;
  activeClaims: number;
  raceId?: string;
  raceStatus?: string;
}

export interface Portfolio {
  ok: boolean;
  address: string;
  role: "new" | "lender" | "borrower" | "both";
  live: { sepolia: boolean; creditcoin: boolean };
  lending: PortfolioLending[];
  refunded: PortfolioRefund[];
  borrowing: PortfolioBorrowing[];
  totals: { lentUsd: number; refundedUsd: number; borrowedUsd: number; blendedRatePct: number };
  counts: { lending: number; borrowing: number; refunded: number };
}

export const api = {
  // Financier agents
  agents: () =>
    jget<{ ok: boolean; agents: Agent[]; registries: { identity: Hex | ""; reputation: Hex | "" }; creditcoinLive: boolean }>(
      "/api/agents",
    ),
  agent: (id: string) => jget<{ ok: boolean; agent: Agent }>(`/api/agents/${id}`),

  // Collateral assets
  collateral: (limit?: number) => {
    const q = new URLSearchParams();
    if (limit) q.set("limit", String(limit));
    return jget<{ ok: boolean; count: number; collateral: CollateralAsset[] }>(
      `/api/collateral${q.size ? `?${q}` : ""}`,
    );
  },

  analyze: (collateralId: string, amountUsd?: number) =>
    jget<{ ok: boolean; analysis: CollateralAnalysis }>(
      `/api/collateral/${encodeURIComponent(collateralId)}/analyze${amountUsd ? `?amountUsd=${amountUsd}` : ""}`,
    ),

  // Priority settlements
  races: () => jget<{ ok: boolean; races: RaceSummary[] }>("/api/races"),

  race: (id: string, sinceSeq = 0) =>
    jget<{ ok: boolean; race: PriorityRace; events: LifecycleEvent[] }>(`/api/races/${id}?sinceSeq=${sinceSeq}`),

  createRace: (body: { initiatorId?: string; collateral?: CollateralAsset; requestedTotalUsd?: number; mode?: "auto" | "step" }) =>
    jpost<{ ok: boolean; id: string; race: PriorityRace }>("/api/races", body),

  advanceRace: (id: string, mode: "auto" | "step") =>
    jpost<{ ok: boolean; phase?: string; race?: PriorityRace }>(`/api/races/${id}/advance`, { mode }),

  // ── live races ──
  //
  // These send a transaction hash and nothing else. The block, the transaction index, the tranche
  // and the amount are all decoded server-side from the receipt, because those numbers are the
  // priority claim and a party cannot be allowed to state its own rank. Posting them from here
  // would have been two fewer round trips and no proof at all.

  /** The live race for a facility, or null when the app knows of none. */
  liveRace: (collateralId: string) =>
    jget<{ ok: boolean; id: string | null; race: PriorityRace | null }>(
      `/api/races/live?collateralId=${encodeURIComponent(collateralId)}`,
    ),

  /** Record a race the caller has just opened on the vault. */
  recordLiveRace: (body: { collateralId: string; openTxHash: string; registerTxHash?: string }) =>
    jpost<{ ok: boolean; id?: string; race?: PriorityRace; error?: string }>("/api/races/live", body),

  /**
   * Rebuild a settlement's record from the chain, given only the facility.
   *
   * @remarks Needs no transaction hashes: nothing is being claimed, so there is nothing to verify.
   * This is the way back from a lost store — a restart with no PRECEDENCE_STORE_PATH, an admin
   * reset — without redoing a run and waiting out attestation a second time.
   */
  recoverLiveRace: (collateralId: string) =>
    jpost<{ ok: boolean; id?: string; race?: PriorityRace; error?: string }>("/api/races/live", {
      collateralId,
      recover: true,
    }),

  /** Record a lock the caller has just signed. */
  recordLiveLock: (body: { collateralId: string; lockTxHash: string }) =>
    jpost<{ ok: boolean; id?: string; race?: PriorityRace; error?: string }>(
      "/api/races/live/locks",
      body,
    ),

  /**
   * What a live settlement is waiting for, read from both chains.
   *
   * @remarks Polled, and deliberately a server call rather than three browser reads: a viewer with
   * no wallet still gets the answer, and the vault state and the attestation frontier arrive
   * together so the panel cannot show one of them stale beside the other.
   */
  settlementStatus: (id: string) =>
    jget<SettlementStatus>(`/api/races/live/status?id=${encodeURIComponent(id)}`),

  /**
   * Submit the proof for a settlement that is ready for one.
   *
   * @remarks Returns as soon as the prover has STARTED. Progress arrives through
   * `settlementStatus`, which the page is already polling — proving takes tens of seconds and a
   * request that waits for it is a request that times out.
   */
  proveSettlement: (id: string) =>
    jpost<{ ok: boolean; error?: string }>("/api/races/live/prove", { id }),

  // Attestations & proofs
  attestations: () => jget<{ ok: boolean; attestations: Attestation[] }>("/api/attestations"),

  /** One wallet's book, on both sides. Role is derived from position, never declared. */
  portfolio: (address: string) => jget<Portfolio>(`/api/portfolio?address=${address}`),

  /** Pre-fill only. Nothing returned is verified and nothing is registered by this call. */
  parseDocument: (documentText: string) =>
    jpost<{ ok: boolean; available: boolean; reason?: string; proposal?: RegistrationProposal; advisory?: string }>(
      "/api/collateral/parse",
      { documentText },
    ),

  facility: (id: string) =>
    jget<{
      ok: boolean;
      collateral: CollateralAsset;
      analysis: CollateralAnalysis;
      raceId: string | null;
      raceOutcome: string | null;
      live: { sepolia: boolean; creditcoin: boolean };
    }>(`/api/collateral/${id}`),

  registerCollateral: (body: unknown) =>
    jpost<{ ok: boolean; problems?: string[]; error?: string; collateral?: CollateralAsset; chain?: boolean; txHash?: string | null; note?: string }>(
      "/api/collateral/register",
      body,
    ),

  // Refinance & top opportunities
  refinance: (collateralId: string) =>
    jget<{ ok: boolean; opportunity: RefinanceOpportunity | null }>(
      `/api/collateral/${encodeURIComponent(collateralId)}/refinance`,
    ),

  // Admin reset
  reset: () => jpost<{ ok: boolean; error?: string }>("/api/admin/reset", undefined, { "x-precedence-admin": adminToken() }),
};

/** Subscribe to a settlement's SSE lifecycle stream. */
export function streamRace(
  id: string,
  onEvent: (ev: LifecycleEvent) => void,
  onDone?: () => void,
): () => void {
  const es = new EventSource(`/api/races/${id}/events`);
  const handler = (e: MessageEvent) => {
    try {
      const ev = JSON.parse(e.data) as LifecycleEvent;
      onEvent(ev);
      if (TERMINAL_PHASES.includes(ev.phase)) {
        es.close();
        onDone?.();
      }
    } catch {
      // ignore
    }
  };

  es.onmessage = handler;
  for (const p of PROTOCOL_STATES) {
    es.addEventListener(p, handler as EventListener);
  }

  // The server says `done` when a stream has nothing further to send. Without acting on it the
  // browser cannot distinguish a finished stream from a dropped connection and reconnects about
  // every three seconds, indefinitely — which a settled race did, having closed instantly on each
  // attempt. Closing here is the only place the loop can be stopped.
  es.addEventListener("done", () => {
    es.close();
    onDone?.();
  });

  es.onerror = () => {};
  return () => es.close();
}
