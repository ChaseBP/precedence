/**
 * Central configuration and dependency injection.
 *
 * The `mock | chain` switch is the honesty mechanism, so it is built to be hard to get wrong:
 *
 *  - The UI never reads these env vars to decide what to claim. It reads each adapter's own
 *    `isLive()`, so a misconfigured environment produces a *degraded* demo, never a *dishonest*
 *    one — simulated data cannot render as on-chain.
 *  - Selecting `chain` without deployed addresses does not throw and does not silently pretend.
 *    It falls back to the mock and records WHY in `modeNotes`, which `/api/config` exposes.
 *
 * All network constants below were verified live — see `../../ATTESTCOIN_FACTS.md` §0.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Address } from "viem";
import type { SepoliaClient } from "./adapters/sepolia/sepolia-client";
import { MockSepoliaClient } from "./adapters/sepolia/mock-sepolia-client";
import { ChainSepoliaClient } from "./adapters/sepolia/chain-sepolia-client";
import type { CreditcoinClient } from "./adapters/creditcoin/creditcoin-client";
import { MockCreditcoinClient } from "./adapters/creditcoin/mock-creditcoin-client";
import { ChainCreditcoinClient } from "./adapters/creditcoin/chain-creditcoin-client";
import type { AgentRuntime } from "./adapters/agent/agent-runtime";
import { LocalRuntime } from "./adapters/agent/local-runtime";
import { LlmRuntime } from "./adapters/agent/llm-runtime";
import { ProverWorker } from "./adapters/agent/prover-worker";
import type { Hex } from "./types";

// ───────────────────────────── verified network constants ─────────────────────────────

/** Creditcoin CC3 testnet — chainId 102031, 15.0s blocks, 75,000,000 block gas limit. */
export const CREDITCOIN_RPC_DEFAULT = "https://rpc.cc3-testnet.creditcoin.network";
/**
 * The REAL CC3 testnet explorer, verified reachable.
 * `explorer.cc3-testnet.creditcoin.network` DOES NOT RESOLVE — never use it.
 */
export const CREDITCOIN_EXPLORER_DEFAULT = "https://creditcoin-testnet.blockscout.com";
/** Substrate-level view, if extrinsic detail is ever wanted. */
export const CREDITCOIN_SUBSCAN = "https://creditcoin3-testnet.subscan.io";
/** Canonical proof generator. (`prover.cc3-testnet…` also resolves but this is the one to use.) */
export const PROOF_BUILDER_URL_DEFAULT = "https://proof-gen-api.cc3-testnet.creditcoin.network";
export const SEPOLIA_EXPLORER_DEFAULT = "https://sepolia.etherscan.io";

export const CREDITCOIN_EXPLORER = process.env.CREDITCOIN_EXPLORER ?? CREDITCOIN_EXPLORER_DEFAULT;
export const SEPOLIA_EXPLORER = process.env.SEPOLIA_EXPLORER ?? SEPOLIA_EXPLORER_DEFAULT;

export type AdapterMode = "chain" | "mock";
export type RuntimeMode = "agent" | "local";

/** Accepts the legacy `viem` value as an alias for `chain`, so old .env files do not break. */
function adapterMode(raw: string | undefined, fallback: AdapterMode): AdapterMode {
  if (raw === "chain" || raw === "viem") return "chain";
  if (raw === "mock") return "mock";
  return fallback;
}

// ───────────────────────────── deployed addresses ─────────────────────────────

export interface DeployedAddresses {
  sepolia?: { PUSD: Address; PriorityVault: Address };
  creditcoin?: {
    CollateralRegistry: Address;
    ClaimToken: Address;
    PriorityEngine: Address;
    AttestationGate: Address;
    RefinanceEngine: Address;
  };
}

/**
 * Read deployed addresses from the generated deployment files.
 *
 * @remarks Deliberately file-based rather than env-based. The deploy scripts write these, so an
 * address can never be mistyped — and a mistyped vault address would break the proof-to-vault
 * binding the security model rests on while looking like a verification failure.
 */
export function loadDeployedAddresses(): DeployedAddresses {
  const root = resolve(process.cwd(), "..");
  const read = (p: string) => {
    try {
      const full = resolve(root, p);
      return existsSync(full) ? JSON.parse(readFileSync(full, "utf8")) : undefined;
    } catch {
      return undefined;
    }
  };
  const sep = read("contracts/deployments/sepolia.json");
  const cc = read("contracts/deployments/creditcoin.json");
  return {
    sepolia: sep ? { PUSD: sep.PUSD, PriorityVault: sep.PriorityVault } : undefined,
    creditcoin: cc
      ? {
          CollateralRegistry: cc.CollateralRegistry,
          ClaimToken: cc.ClaimToken,
          PriorityEngine: cc.PriorityEngine,
          AttestationGate: cc.AttestationGate,
          RefinanceEngine: cc.RefinanceEngine,
        }
      : undefined,
  };
}

export interface PrecedenceConfig {
  /** Master switch. Individual adapters may be overridden below it. */
  mode: AdapterMode;
  sepoliaMode: AdapterMode;
  creditcoinMode: AdapterMode;
  /**
   * `local` = deterministic policy only.
   * `agent` = an LLM additionally available for collateral-document interpretation, bid narration
   * and refinance PROPOSALS — all ratified by `domain/policy.ts` before anything on-chain happens.
   * Settlement never depends on a model.
   */
  runtimeMode: RuntimeMode;
  protocolFeeBps: number; // 25 bps on settled financing volume
  proverFeeBps: number; // 5 bps per valid proof
  refinanceFeeBps: number; // 15 bps on refinanced notional
  payoutCurrency: string;
  sepoliaRpc: string;
  creditcoinRpc: string;
  proofBuilderUrl: string;
  explorerBaseSepolia: string;
  explorerBaseCreditcoin: string;
}

export function getConfig(): PrecedenceConfig {
  const master = adapterMode(process.env.PRECEDENCE_MODE, "mock");
  return {
    mode: master,
    sepoliaMode: adapterMode(process.env.PRECEDENCE_SEPOLIA, master),
    creditcoinMode: adapterMode(process.env.PRECEDENCE_CREDITCOIN, master),
    runtimeMode: (process.env.PRECEDENCE_RUNTIME as RuntimeMode) ?? "local",
    protocolFeeBps: Number(process.env.PRECEDENCE_PROTOCOL_FEE_BPS ?? 25),
    proverFeeBps: Number(process.env.PRECEDENCE_PROVER_FEE_BPS ?? 5),
    refinanceFeeBps: Number(process.env.PRECEDENCE_REFINANCE_FEE_BPS ?? 15),
    payoutCurrency: "pUSD",
    sepoliaRpc: process.env.SEPOLIA_RPC ?? "",
    creditcoinRpc: process.env.CREDITCOIN_RPC ?? CREDITCOIN_RPC_DEFAULT,
    proofBuilderUrl: process.env.PROOF_BUILDER_URL ?? PROOF_BUILDER_URL_DEFAULT,
    explorerBaseSepolia: SEPOLIA_EXPLORER,
    explorerBaseCreditcoin: CREDITCOIN_EXPLORER,
  };
}

export interface PrecedenceDeps {
  config: PrecedenceConfig;
  sepolia: SepoliaClient;
  creditcoin: CreditcoinClient;
  runtime: AgentRuntime;
  prover: ProverWorker;
  /** Why each adapter ended up in the mode it is in. Surfaced by `/api/config`. */
  modeNotes: { sepolia: string; creditcoin: string };
}

const g = globalThis as unknown as { __precedenceDeps?: PrecedenceDeps };

function buildSepolia(cfg: PrecedenceConfig, addrs: DeployedAddresses): { client: SepoliaClient; note: string } {
  if (cfg.sepoliaMode !== "chain") {
    return { client: new MockSepoliaClient(), note: "mock requested" };
  }
  if (!cfg.sepoliaRpc) {
    return { client: new MockSepoliaClient(), note: "chain requested but SEPOLIA_RPC is not set — using mock" };
  }
  if (!addrs.sepolia?.PriorityVault) {
    return {
      client: new MockSepoliaClient(),
      note: "chain requested but contracts/deployments/sepolia.json is missing — run `make deploy-sepolia`",
    };
  }
  try {
    return {
      client: new ChainSepoliaClient({
        rpcUrl: cfg.sepoliaRpc,
        vaultAddress: addrs.sepolia.PriorityVault,
        pusdAddress: addrs.sepolia.PUSD,
        keys: {
          obligor: process.env.OBLIGOR_PK as Hex | undefined,
          meridian: process.env.FIN_MERIDIAN_PK as Hex | undefined,
          vector: process.env.FIN_VECTOR_PK as Hex | undefined,
          novum: process.env.FIN_NOVUM_PK as Hex | undefined,
          refinancer: process.env.FIN_REFINANCER_PK as Hex | undefined,
        },
      }),
      note: `live at ${addrs.sepolia.PriorityVault}`,
    };
  } catch (e) {
    return { client: new MockSepoliaClient(), note: `chain adapter failed to construct: ${(e as Error).message}` };
  }
}

function buildCreditcoin(
  cfg: PrecedenceConfig,
  addrs: DeployedAddresses,
): { client: CreditcoinClient; note: string } {
  if (cfg.creditcoinMode !== "chain") {
    return { client: new MockCreditcoinClient(), note: "mock requested" };
  }
  if (!addrs.creditcoin?.AttestationGate) {
    return {
      client: new MockCreditcoinClient(),
      note: "chain requested but contracts/deployments/creditcoin.json is missing — run `make deploy-creditcoin`",
    };
  }
  try {
    return {
      client: new ChainCreditcoinClient({
        rpcUrl: cfg.creditcoinRpc,
        gateAddress: addrs.creditcoin.AttestationGate,
        engineAddress: addrs.creditcoin.PriorityEngine,
        registryAddress: addrs.creditcoin.CollateralRegistry,
        claimTokenAddress: addrs.creditcoin.ClaimToken,
        refinanceEngineAddress: addrs.creditcoin.RefinanceEngine,
      }),
      note: `live at ${addrs.creditcoin.AttestationGate}`,
    };
  } catch (e) {
    return { client: new MockCreditcoinClient(), note: `chain adapter failed to construct: ${(e as Error).message}` };
  }
}

export function getDeps(): PrecedenceDeps {
  if (g.__precedenceDeps) return g.__precedenceDeps;

  const config = getConfig();
  const addrs = loadDeployedAddresses();
  const sep = buildSepolia(config, addrs);
  const cc = buildCreditcoin(config, addrs);

  // `agent` mode adds document interpretation and narration. It does NOT change how bids are
  // decided — LlmRuntime.decide() calls the same deterministic policy as LocalRuntime, because the
  // settlement path must never depend on a model.
  const runtime =
    config.runtimeMode === "agent"
      ? new LlmRuntime({ apiKey: process.env.GEMINI_API_KEY })
      : new LocalRuntime();

  const deps: PrecedenceDeps = {
    config,
    sepolia: sep.client,
    creditcoin: cc.client,
    runtime,
    prover: new ProverWorker(),
    modeNotes: { sepolia: sep.note, creditcoin: cc.note },
  };
  g.__precedenceDeps = deps;
  return deps;
}

export function resetDeps(): void {
  delete g.__precedenceDeps;
}
