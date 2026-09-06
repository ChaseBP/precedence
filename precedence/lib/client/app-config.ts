"use client";

/**
 * `/api/config`, fetched once per page load however many components want it.
 *
 * @remarks Five components ask for this — `LockCapital`, `OpenRace`, `ServiceFacility`, the
 * registration wizard and `useAdapterTruth` in the shell — each with its own `useEffect` and its
 * own copy of the response. On a facility page, where four of them mount together, that measured
 * as **seven requests for the same document on one page load**. Nothing was wrong with any single
 * one of them; the cost only exists in aggregate, which is why it survived several reviews.
 *
 * The response is static for the life of the server process: deployed addresses come from files
 * written by the deploy scripts, and adapter modes come from the environment. So one in-flight
 * promise shared by every caller is not a cache with an invalidation problem — it is the request
 * that should always have been made once.
 *
 * A failure clears the promise, so a component mounting later retries rather than inheriting a
 * rejection forever.
 */

import type { Address } from "viem";

export interface AppConfig {
  mode?: "chain" | "mixed" | "mock";
  sepolia?: { requested?: string; live?: boolean; note?: string };
  creditcoin?: { requested?: string; live?: boolean; note?: string };
  runtime?: string;
  store?: { persistent?: boolean; path?: string | null };
  explorers?: { sepolia?: string; creditcoin?: string };
  proofBuilderUrl?: string;
  addresses?: {
    sepolia?: { PUSD: Address; PriorityVault: Address };
    creditcoin?: {
      CollateralRegistry: Address;
      ClaimToken: Address;
      PriorityEngine: Address;
      AttestationGate: Address;
      RefinanceEngine: Address;
    };
  };
  chainIds?: { sepolia: number; creditcoin: number };
}

let inflight: Promise<AppConfig> | null = null;

export function fetchAppConfig(): Promise<AppConfig> {
  inflight ??= fetch("/api/config", { cache: "no-store" })
    .then((r) => r.json() as Promise<AppConfig>)
    .catch((e) => {
      // Do not leave a rejected promise memoised — the next component to mount should get a fresh
      // attempt rather than inheriting a failure it had no part in.
      inflight = null;
      throw e;
    });
  return inflight;
}
