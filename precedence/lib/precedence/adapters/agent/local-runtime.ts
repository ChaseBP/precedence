/**
 * Local Deterministic Financier Policy Runtime for PRECEDENCE.
 */
import type { AgentDecision, Hex } from "../../types";
import type { AgentRuntime, DecideParams } from "./agent-runtime";
import { evaluate } from "../../domain/policy";
import { deriveFinancierAccount } from "../../domain/lock";

export class LocalRuntime implements AgentRuntime {
  async decide({ agent, collateral, analysis, requestedUsd }: DecideParams): Promise<AgentDecision> {
    return evaluate(agent, collateral, analysis, requestedUsd);
  }

  async signLock(agentId: string, collateralId: string, amountUsd: number): Promise<Hex> {
    const account = deriveFinancierAccount(agentId);
    return account.signMessage({ message: { raw: `0x${Buffer.from(`${collateralId}:${amountUsd}`).toString("hex")}` as Hex } });
  }
}
