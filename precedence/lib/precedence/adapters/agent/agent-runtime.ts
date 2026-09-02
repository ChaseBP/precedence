/**
 * Financier & Prover Agent Runtime Interface for PRECEDENCE.
 */
import type { Agent, AgentDecision, CollateralAnalysis, CollateralAsset, Hex } from "../../types";

export interface DecideParams {
  agent: Agent;
  collateral: CollateralAsset;
  analysis: CollateralAnalysis;
  requestedUsd: number;
}

export interface AgentRuntime {
  decide(params: DecideParams): Promise<AgentDecision>;
  signLock(agentId: string, collateralId: string, amountUsd: number): Promise<Hex>;
}
