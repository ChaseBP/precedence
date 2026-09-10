/**
 * Lifecycle engine.
 *
 * Drives a race through the protocol state machine, persisting state and broadcasting SSE events.
 *
 * Unlike the linear pipeline this replaced, the machine BRANCHES: a handler may return an explicit
 * `next` state (ENCUMBERED → FROZEN_DRAW, PRIORITY_SETTLED → AUTO_REFUND, GRACE_PERIOD →
 * REPAYMENT_PROOF when cured) and every transition is validated against `canTransition` so a
 * manual step cannot walk the race somewhere the protocol does not allow.
 */
import type { Agent, EventLevel, LifecyclePhase, PriorityRace } from "@precedence/sdk/types";
import { getSimulationDeps } from "../config";
import { listAgents, getRace, saveRace } from "../store/repositories";
import { emitEvent } from "./events";
import { canTransition, isTerminal, nextPhase, PHASE_LABELS, trackOf } from "./lifecycle";
import {
  runAtomicRefinance,
  runAutoRefund,
  runBreached,
  runCapitalDrawn,
  runCollateralRegistered,
  runDutchLiquidation,
  runEncumbered,
  runFrozenDraw,
  runGracePeriod,
  runLienReleased,
  runPcrStabilization,
  runPrioritySettled,
  runRaceOpen,
  runRefiDiscovered,
  runRepaymentProof,
  runSettledClosed,
  runTerminatedDefault,
  type PhaseCtx,
  type StepOutcome,
} from "./steps";

type StepFn = (ctx: PhaseCtx) => Promise<StepOutcome>;

const STEP_FNS: Partial<Record<LifecyclePhase, StepFn>> = {
  // performing track
  COLLATERAL_REGISTERED: runCollateralRegistered,
  RACE_OPEN: runRaceOpen,
  PRIORITY_SETTLED: runPrioritySettled,
  CAPITAL_DRAWN: runCapitalDrawn,
  ENCUMBERED: runEncumbered,
  REFI_DISCOVERED: runRefiDiscovered,
  ATOMIC_REFINANCE: runAtomicRefinance,
  REPAYMENT_PROOF: runRepaymentProof,
  LIEN_RELEASED: runLienReleased,
  SETTLED_CLOSED: runSettledClosed,

  // distressed track — every one a permissionless keeper poke
  FROZEN_DRAW: runFrozenDraw,
  PCR_STABILIZATION: runPcrStabilization,
  GRACE_PERIOD: runGracePeriod,
  DUTCH_LIQUIDATION: runDutchLiquidation,
  TERMINATED_DEFAULT: runTerminatedDefault,
  BREACHED: runBreached,

  // utility
  AUTO_REFUND: runAutoRefund,
};

const g = globalThis as unknown as { __precedenceRunning?: Set<string> };
function running(): Set<string> {
  if (!g.__precedenceRunning) g.__precedenceRunning = new Set();
  return g.__precedenceRunning;
}

async function makeCtx(race: PriorityRace, agents: Agent[]): Promise<PhaseCtx> {
  return {
    race,
    agents,
    // A scripted race is a walkthrough, so it runs against simulated adapters even when the
    // registry reads are live. Real settlement is the worker's job and takes minutes.
    deps: getSimulationDeps(),
    emit: async (level: EventLevel, message: string, data?: unknown) => {
      await emitEvent(race.id, race.status, level, message, data);
    },
  };
}

async function abort(race: PriorityRace, reason: string): Promise<LifecyclePhase> {
  race.status = "ABORTED";
  race.aborted = { reason, at: new Date().toISOString() };
  race.updatedAt = new Date().toISOString();
  await saveRace(race);
  await emitEvent(race.id, "ABORTED", "error", reason);
  return "ABORTED";
}

/** Run the handler for the race's current state and move it to its successor. */
async function runOnePhase(race: PriorityRace, agents: Agent[]): Promise<LifecyclePhase> {
  const phase = race.status;
  const fn = STEP_FNS[phase];
  if (!fn) return phase;

  const ctx = await makeCtx(race, agents);

  let outcome: StepOutcome;
  try {
    outcome = await fn(ctx);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return abort(race, `Engine error in ${PHASE_LABELS[phase]}: ${msg}`);
  }

  if (!outcome.ok) {
    return abort(race, outcome.reason ?? `Phase "${PHASE_LABELS[phase]}" did not complete.`);
  }

  // A terminal state's handler runs once; there is nowhere to go afterwards.
  if (isTerminal(phase)) {
    race.updatedAt = new Date().toISOString();
    await saveRace(race);
    return phase;
  }

  const requested = outcome.next ?? nextPhase(phase);
  if (!requested) {
    race.updatedAt = new Date().toISOString();
    await saveRace(race);
    return phase;
  }

  if (!canTransition(phase, requested)) {
    return abort(
      race,
      `Illegal transition ${phase} → ${requested}. The protocol does not permit this move.`,
    );
  }

  race.status = requested;
  race.track = trackOf(requested);
  race.updatedAt = new Date().toISOString();
  await saveRace(race);

  if (isTerminal(requested) && requested !== "ABORTED" && !STEP_FNS[requested]) {
    await emitEvent(race.id, requested, "success", `Race reached ${PHASE_LABELS[requested]}.`);
  }

  return requested;
}

/** Run the full lifecycle to a terminal state. Fire-and-forget. */
export async function runRace(raceId: string): Promise<void> {
  if (running().has(raceId)) return;
  running().add(raceId);
  try {
    const agents = await listAgents();
    let current = await getRace(raceId);
    if (!current) return;

    // Bounded so a mis-specified branch can never spin forever.
    for (let guard = 0; guard < 32; guard++) {
      const before = current.status;
      const next = await runOnePhase(current, agents);

      // Terminal state reached and its handler has run.
      if (isTerminal(next) && next === before) break;
      if (next === "ABORTED") break;

      // Dwell between stages for SSE pacing / presentation.
      await new Promise((r) => setTimeout(r, 600));

      const fresh = await getRace(raceId);
      if (!fresh) break;
      current = fresh;
    }
  } finally {
    running().delete(raceId);
  }
}

/** Advance exactly one state. Used by the demo's manual stepping. */
export async function stepRace(raceId: string): Promise<LifecyclePhase> {
  const agents = await listAgents();
  const race = await getRace(raceId);
  if (!race) throw new Error(`Race ${raceId} not found`);
  if (race.status === "ABORTED") return race.status;
  return runOnePhase(race, agents);
}
