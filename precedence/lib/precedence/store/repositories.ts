/**
 * Repositories for PRECEDENCE store.
 */
import type {
  Agent,
  Attestation,
  CollateralAsset,
  LifecycleEvent,
  PriorityRace,
  RaceSummary,
  RefinanceOpportunity,
} from "../types";
import { getDb, persist, resetDb } from "./json-store";
import { resetDeps } from "../config";
import { toRaceSummary } from "./seed";

export async function listAgents(): Promise<Agent[]> {
  return getDb().agents;
}

export async function getAgent(id: string): Promise<Agent | undefined> {
  return getDb().agents.find((a) => a.id === id);
}

export async function updateAgent(id: string, mutate: (a: Agent) => void): Promise<Agent | undefined> {
  const agent = getDb().agents.find((a) => a.id === id);
  if (agent) {
    mutate(agent);
    persist();
  }
  return agent;
}

export async function listCollateral(): Promise<CollateralAsset[]> {
  return getDb().collateral;
}

export async function getCollateral(id: string): Promise<CollateralAsset | undefined> {
  return getDb().collateral.find((c) => c.id === id || c.symbol === id);
}

/**
 * Add a newly registered asset.
 *
 * @remarks Prepended so the thing someone just registered is the first thing they see, rather
 * than buried under the fixtures. Rejects a duplicate id instead of silently overwriting: two
 * registrations of one asset is precisely the condition this protocol exists to make detectable,
 * so quietly merging them here would be the wrong instinct.
 */
export async function addCollateral(asset: CollateralAsset): Promise<CollateralAsset> {
  const db = getDb();
  if (db.collateral.some((c) => c.id === asset.id || c.docHash === asset.docHash)) {
    throw new Error(`collateral ${asset.id} is already registered`);
  }
  db.collateral.unshift(asset);
  persist();
  return asset;
}

export async function updateCollateral(id: string, mutate: (c: CollateralAsset) => void): Promise<CollateralAsset | undefined> {
  const col = getDb().collateral.find((c) => c.id === id);
  if (col) {
    mutate(col);
    persist();
  }
  return col;
}

export async function listRaces(): Promise<RaceSummary[]> {
  return getDb().races.map(toRaceSummary);
}

export async function getRace(id: string): Promise<PriorityRace | undefined> {
  return getDb().races.find((r) => r.id === id);
}

export async function saveRace(race: PriorityRace): Promise<PriorityRace> {
  const db = getDb();
  const idx = db.races.findIndex((r) => r.id === race.id);
  if (idx >= 0) db.races[idx] = race;
  else db.races.push(race);
  persist();
  return race;
}

export async function listAttestations(): Promise<Attestation[]> {
  return getDb().attestations;
}

export async function upsertAttestation(att: Attestation): Promise<Attestation> {
  const db = getDb();
  const idx = db.attestations.findIndex((a) => a.raceId === att.raceId);
  if (idx >= 0) db.attestations[idx] = att;
  else db.attestations.push(att);
  persist();
  return att;
}

export async function listRefinanceOpportunities(): Promise<RefinanceOpportunity[]> {
  return getDb().refinanceOpportunities;
}

export async function getEventsSince(raceId: string, sinceSeq = 0): Promise<LifecycleEvent[]> {
  return getDb().events.filter((e) => e.raceId === raceId && e.seq > sinceSeq);
}

export async function appendEvent(event: LifecycleEvent): Promise<void> {
  getDb().events.push(event);
  persist();
}

export async function resetStore(): Promise<void> {
  // Adapters hold per-collateral state (vault lock counters), so a store reset must reset them too
  // or the next race inherits the previous one's sequence numbers.
  resetDeps();
  resetDb();
}
