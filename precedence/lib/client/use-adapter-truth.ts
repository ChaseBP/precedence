"use client";

/**
 * What each chain adapter reports about itself, read once per mount.
 *
 * @remarks Extracted from `Shell` because a second surface needed it and the alternative was a
 * second copy. The landing page had typed its mode claim as prose — "Sepolia is simulated in this
 * deployment" — and the moment Sepolia went live that sentence became a false statement sitting in
 * the footer of the front page. A claim about what is live has to be *derived* from the adapters,
 * never authored, or it is only true until someone changes an environment variable.
 *
 * Returns `null` while loading. Callers must render nothing rather than a default: guessing in the
 * reassuring direction is the one failure this hook exists to prevent.
 */

import { useEffect, useState } from "react";
import { fetchAppConfig } from "./app-config";

export interface AdapterTruth {
  sepoliaLive: boolean;
  creditcoinLive: boolean;
  agentRuntime: boolean;
  /** The long form, e.g. "Sepolia live · Creditcoin CC3 live · Financier AI". */
  chip: string;
  /**
   * Set when the deployment says its API is elsewhere but answered locally anyway.
   *
   * @remarks A distinct state from "simulated", and the distinction matters. Simulated is a
   * deliberate configuration and is safe to display. This is a routing failure whose answers are
   * meaningless, and showing it as "simulated" would be reporting a broken deployment as a working
   * one in a degraded mode.
   */
  misconfigured?: string;
}

export function useAdapterTruth(): AdapterTruth | null {
  const [truth, setTruth] = useState<AdapterTruth | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const c = await fetchAppConfig();
        if (cancelled) return;
        if ((c as { misconfigured?: string })?.misconfigured) {
          setTruth({
            sepoliaLive: false,
            creditcoinLive: false,
            agentRuntime: false,
            chip: "API not reachable — deployment misconfigured",
            misconfigured: (c as { misconfigured?: string }).misconfigured,
          });
          return;
        }
        const sepoliaLive = Boolean(c?.sepolia?.live);
        const creditcoinLive = Boolean(c?.creditcoin?.live);
        const agentRuntime = c?.runtime === "agent";
        if (cancelled) return;
        setTruth({
          sepoliaLive,
          creditcoinLive,
          agentRuntime,
          chip: [
            sepoliaLive ? "Sepolia live" : "Sepolia simulated",
            creditcoinLive ? "Creditcoin CC3 live" : "Creditcoin CC3 simulated",
            agentRuntime ? "Financier AI" : "Policy Engine",
          ].join(" · "),
        });
      } catch {
        if (!cancelled) setTruth(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return truth;
}

/**
 * One sentence naming what is live and what is not, for a page that has to state it in prose.
 *
 * @remarks Deliberately spells out both chains rather than collapsing to "live" or "simulated".
 * A reader deciding whether to trust a figure needs to know which half of the stack produced it.
 */
export function chainStatusSentence(truth: AdapterTruth | null): string {
  if (!truth) return "Testnet only.";
  if (truth.misconfigured) {
    return "This deployment cannot reach its API, so nothing here can be verified.";
  }
  const { sepoliaLive, creditcoinLive } = truth;
  if (sepoliaLive && creditcoinLive) {
    return "Testnet only. Both Ethereum Sepolia and Creditcoin CC3 are live in this deployment.";
  }
  if (!sepoliaLive && !creditcoinLive) {
    return "Testnet only. Both chains are simulated in this deployment.";
  }
  return sepoliaLive
    ? "Testnet only. Ethereum Sepolia is live in this deployment; Creditcoin CC3 is simulated."
    : "Testnet only. Creditcoin CC3 is live in this deployment; Ethereum Sepolia is simulated.";
}
