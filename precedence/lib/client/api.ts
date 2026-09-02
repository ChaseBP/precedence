"use client";

import { PROTOCOL_STATES } from "../precedence/types";
import type {
  Agent,
  Attestation,
  CollateralAsset,
  CollateralAnalysis,
  Hex,
  LifecycleEvent,
  LifecyclePhase,
  PriorityRace,
  RaceSummary,
  RefinanceOpportunity,
} from "../precedence/types";

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

  // Priority races
  races: () => jget<{ ok: boolean; races: RaceSummary[] }>("/api/races"),

  race: (id: string, sinceSeq = 0) =>
    jget<{ ok: boolean; race: PriorityRace; events: LifecycleEvent[] }>(`/api/races/${id}?sinceSeq=${sinceSeq}`),

  createRace: (body: { initiatorId?: string; collateral?: CollateralAsset; requestedTotalUsd?: number; mode?: "auto" | "step" }) =>
    jpost<{ ok: boolean; id: string; race: PriorityRace }>("/api/races", body),

  advanceRace: (id: string, mode: "auto" | "step") =>
    jpost<{ ok: boolean; phase?: string; race?: PriorityRace }>(`/api/races/${id}/advance`, { mode }),

  // Attestations & proofs
  attestations: () => jget<{ ok: boolean; attestations: Attestation[] }>("/api/attestations"),

  /** One wallet's book, on both sides. Role is derived from position, never declared. */
  portfolio: (address: string) => jget<Portfolio>(`/api/portfolio?address=${address}`),

  // Refinance & top opportunities
  refinance: (collateralId: string) =>
    jget<{ ok: boolean; opportunity: RefinanceOpportunity | null }>(
      `/api/collateral/${encodeURIComponent(collateralId)}/refinance`,
    ),

  // Admin reset
  reset: () => jpost<{ ok: boolean; error?: string }>("/api/admin/reset", undefined, { "x-precedence-admin": adminToken() }),
};

/** Subscribe to a Priority Race's SSE lifecycle stream. */
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
  es.onerror = () => {};
  return () => es.close();
}
