/**
 * Financier & Prover Agent Runtime Interface for PRECEDENCE.
 */
import type { Agent, AgentDecision, CollateralAnalysis, CollateralAsset, Hex,
  RegistrationProposal,
} from "../../types";

export interface DecideParams {
  agent: Agent;
  collateral: CollateralAsset;
  analysis: CollateralAnalysis;
  requestedUsd: number;
}

export interface AgentRuntime {
  decide(params: DecideParams): Promise<AgentDecision>;
  signLock(agentId: string, collateralId: string, amountUsd: number): Promise<Hex>;
  /**
   * Read an unregistered document and propose form values.
   *
   * @remarks Optional on purpose. `LocalRuntime` has no model and therefore no honest answer, so
   * it does not implement this rather than returning empty fields that look like a failed read.
   * Callers feature-detect and say plainly that no model is configured.
   */
  proposeRegistration?(documentText: string): Promise<RegistrationProposal>;
}
