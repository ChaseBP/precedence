/**
 * Create and initialize a priority race against a collateral asset.
 */
import type { CollateralAsset, PriorityRace, RaceScenario } from "../types";
import { getCollateral, listCollateral, saveRace } from "../store/repositories";
import { analyzeCollateral } from "../domain/collateral";
import { runRace } from "./engine";

export interface CreateRaceParams {
  collateral?: CollateralAsset;
  collateralId?: string;
  requestedTotalUsd?: number;
  mode?: "auto" | "step";
  /**
   * Which storyline to run. `performing` is the happy path; `default` walks the deterministic
   * unwind; `breach` proves collateral movement then liquidates.
   *
   * This exists so the demo can trigger the failure act on command rather than waiting for a real
   * default — the failure branch is half the demo and cannot be left to chance.
   */
  scenario?: RaceScenario;
  /** Legacy: races have no initiating financier. Accepted and ignored. */
  initiatorId?: string;
}

export async function createRace(params: CreateRaceParams): Promise<PriorityRace> {
  let collateral = params.collateral;
  if (!collateral && params.collateralId) {
    collateral = await getCollateral(params.collateralId);
  }
  if (!collateral) {
    const list = await listCollateral();
    collateral = list[0];
  }
  if (!collateral) {
    throw new Error("No collateral assets available to open a settlement");
  }

  const requestedTotalUsd = params.requestedTotalUsd ?? collateral.financingRequestedUsd;
  const analysis = analyzeCollateral(collateral, requestedTotalUsd);
  const id = `race-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();

  const race: PriorityRace = {
    id,
    // A scripted race always runs on simulated adapters, so everything it produces — including
    // its transaction hashes — is fabricated. Recording that on the race is what lets the UI
    // refuse to present those hashes as explorer links.
    simulated: true,
    status: "COLLATERAL_REGISTERED",
    track: "PERFORMING",
    scenario: params.scenario ?? "performing",
    obligor: collateral.obligor,
    collateral,
    analysis,
    requestedTotalUsd,
    decisions: [],
    bids: [],
    locks: [],
    proverCalls: [],
    claims: [],
    createdAt: now,
    updatedAt: now,
  };

  await saveRace(race);

  if (params.mode !== "step") {
    void runRace(race.id);
  }

  return race;
}
