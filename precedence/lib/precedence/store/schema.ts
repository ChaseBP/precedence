/**
 * Store schema for PRECEDENCE.
 */
import type {
  Agent,
  Attestation,
  CollateralAsset,
  LifecycleEvent,
  PriorityRace,
  RefinanceOpportunity,
} from "../types";

export interface DbShape {
  agents: Agent[];
  collateral: CollateralAsset[];
  races: PriorityRace[];
  attestations: Attestation[];
  events: LifecycleEvent[];
  refinanceOpportunities: RefinanceOpportunity[];
}

export function emptyDb(): DbShape {
  return {
    agents: [],
    collateral: [],
    races: [],
    attestations: [],
    events: [],
    refinanceOpportunities: [],
  };
}
