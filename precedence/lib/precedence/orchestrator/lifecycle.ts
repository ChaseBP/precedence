/**
 * PRECEDENCE protocol state machine.
 *
 * This is NOT a linear pipeline. Three tracks share one state union and a facility can leave the
 * performing track at ENCUMBERED:
 *
 *   COLLATERAL_REGISTERED → RACE_OPEN → PRIORITY_SETTLED → CAPITAL_DRAWN → ENCUMBERED
 *          │                                   │                                │
 *          │                            AUTO_REFUND (outpaced)                  ├─► REFI_DISCOVERED → ATOMIC_REFINANCE ─┐
 *          │                                                                    │                                       ▼
 *          ▼                                                                    │                            REPAYMENT_PROOF → LIEN_RELEASED → SETTLED_CLOSED
 *       ABORTED                                                                 │
 *                                                                               └─► FROZEN_DRAW → PCR_STABILIZATION → GRACE_PERIOD → DUTCH_LIQUIDATION → TERMINATED_DEFAULT
 *                                                                                        │
 *                                                                                   BREACHED ──► DUTCH_LIQUIDATION
 *
 * Every distressed transition is a permissionless, timestamp-gated keeper poke — the unwind is a
 * property of the contract, not of our uptime (`DECISIONS.md` Q5).
 */
import type { LifecyclePhase, RaceTrack } from "../types";

/** The performing storyline, in order. Drives the stage rail in the UI. */
export const PERFORMING_SEQUENCE: LifecyclePhase[] = [
  "COLLATERAL_REGISTERED",
  "RACE_OPEN",
  "PRIORITY_SETTLED",
  "CAPITAL_DRAWN",
  "ENCUMBERED",
  "REFI_DISCOVERED",
  "ATOMIC_REFINANCE",
  "REPAYMENT_PROOF",
  "LIEN_RELEASED",
  "SETTLED_CLOSED",
];

/** The deterministic unwind, in order. Half the live demo, not a stretch goal. */
export const DISTRESSED_SEQUENCE: LifecyclePhase[] = [
  "FROZEN_DRAW",
  "PCR_STABILIZATION",
  "GRACE_PERIOD",
  "DUTCH_LIQUIDATION",
  "TERMINATED_DEFAULT",
];

/** Back-compat: the default (performing) walk. */
export const PHASE_SEQUENCE: LifecyclePhase[] = PERFORMING_SEQUENCE;

/** Nothing runs after these. */
export const TERMINAL_PHASES: LifecyclePhase[] = [
  "SETTLED_CLOSED",
  "TERMINATED_DEFAULT",
  "AUTO_REFUND",
  "ABORTED",
];

export function isTerminal(p: LifecyclePhase): boolean {
  return TERMINAL_PHASES.includes(p);
}

export function trackOf(p: LifecyclePhase): RaceTrack {
  return DISTRESSED_SEQUENCE.includes(p) || p === "BREACHED" ? "DISTRESSED" : "PERFORMING";
}

export const PHASE_LABELS: Record<LifecyclePhase, string> = {
  COLLATERAL_REGISTERED: "Collateral Registered",
  RACE_OPEN: "Race Open",
  PRIORITY_SETTLED: "Priority Settled",
  CAPITAL_DRAWN: "Capital Drawn",
  ENCUMBERED: "Encumbered",
  REFI_DISCOVERED: "Refinance Discovered",
  ATOMIC_REFINANCE: "Atomic Refinance",
  REPAYMENT_PROOF: "Repayment Proven",
  LIEN_RELEASED: "Lien Released",
  SETTLED_CLOSED: "Settled & Closed",
  FROZEN_DRAW: "Draw Frozen",
  PCR_STABILIZATION: "Coverage Stabilization",
  GRACE_PERIOD: "Grace Period",
  DUTCH_LIQUIDATION: "Dutch Liquidation",
  TERMINATED_DEFAULT: "Terminated — Default",
  BREACHED: "Collateral Breach",
  AUTO_REFUND: "Capital Auto-Refunded",
  ABORTED: "Aborted",
};

/** One-line description of what the protocol is doing in each state. */
export const PHASE_STATUS_LINE: Record<LifecyclePhase, string> = {
  COLLATERAL_REGISTERED: "Hash-unique collateral NFT minted · verifying clear title…",
  RACE_OPEN: "Financing window open · competing financiers evaluating…",
  PRIORITY_SETTLED: "Locks proven at 0x0FD2 · priority settled by (height, txIndex)",
  CAPITAL_DRAWN: "Obligor drawing capital from the Sepolia vault…",
  ENCUMBERED: "Facility active · lien recorded on Creditcoin CC3",
  REFI_DISCOVERED: "Priority Agent scanning the registry for rate arbitrage…",
  ATOMIC_REFINANCE: "One block: old lien released + new lien created · no gap",
  REPAYMENT_PROOF: "Repayment proven on Sepolia · amount decoded from the verified tx",
  LIEN_RELEASED: "Strict seniority waterfall paid · claims burned",
  SETTLED_CLOSED: "Facility resolved · collateral returned to CLEAR",
  FROZEN_DRAW: "Draws frozen by keeper poke · capital protected",
  PCR_STABILIZATION: "Coverage below threshold · collateral top-up window open…",
  GRACE_PERIOD: "Repayment overdue · cure window running before liquidation",
  DUTCH_LIQUIDATION: "Descending-price auction of the collateral NFT…",
  TERMINATED_DEFAULT: "Unwind complete · loss allocated · obligor flagged DEFAULT",
  BREACHED: "Collateral movement proven · all claims frozen · legal escalation",
  AUTO_REFUND: "Outpaced capital returned · no lien created",
  ABORTED: "Priority race aborted",
};

/**
 * Default successor within whichever track `current` belongs to.
 * Step handlers may override this to branch (e.g. ENCUMBERED → FROZEN_DRAW).
 */
export function nextPhase(current: LifecyclePhase): LifecyclePhase | null {
  if (isTerminal(current)) return null;

  const seq = DISTRESSED_SEQUENCE.includes(current) ? DISTRESSED_SEQUENCE : PERFORMING_SEQUENCE;
  const i = seq.indexOf(current);
  if (i < 0) {
    // BREACHED is reachable out-of-band and unwinds through liquidation.
    if (current === "BREACHED") return "DUTCH_LIQUIDATION";
    return null;
  }
  if (i >= seq.length - 1) return null;
  return seq[i + 1];
}

/** Guard: is `to` a legal successor of `from`? Keeps the demo honest under manual stepping. */
export function canTransition(from: LifecyclePhase, to: LifecyclePhase): boolean {
  if (isTerminal(from)) return false;
  if (to === "ABORTED") return true;
  if (nextPhase(from) === to) return true;

  // Sanctioned branch points.
  if (from === "PRIORITY_SETTLED" && to === "AUTO_REFUND") return true;
  if (from === "ENCUMBERED" && to === "FROZEN_DRAW") return true;
  if (from === "ENCUMBERED" && to === "BREACHED") return true;
  if (from === "ATOMIC_REFINANCE" && to === "REPAYMENT_PROOF") return true;
  if (from === "GRACE_PERIOD" && to === "REPAYMENT_PROOF") return true; // cured in time
  if (from === "PCR_STABILIZATION" && to === "ENCUMBERED") return true; // top-up posted
  if (from === "BREACHED" && to === "DUTCH_LIQUIDATION") return true;
  return false;
}
