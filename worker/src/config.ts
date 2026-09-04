/**
 * Worker configuration: env, providers, signers, contract handles.
 *
 * Deployed addresses come from `contracts/deployments/*.json`, written by the deploy scripts —
 * never from a hand-typed env var. A mistyped vault address would silently break the proof-to-vault
 * binding the whole security model rests on, and the failure would look like a verification error.
 */
import { ethers } from "ethers";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  AttestationGate_ABI,
  CollateralRegistry_ABI,
  PriorityEngine_ABI,
  PriorityVault_ABI,
  PUSD_ABI,
} from "./abis.generated";

const ROOT = resolve(import.meta.dir, "../..");

export const SEPOLIA_CHAIN_KEY = 1;
export const SEPOLIA_CHAIN_ID = 11155111;
export const CREDITCOIN_CHAIN_ID = 102031;
export const BLOCK_PROVER_PRECOMPILE = "0x0000000000000000000000000000000000000FD2";
export const CHAIN_INFO_PRECOMPILE = "0x0000000000000000000000000000000000000fd3";

/** MAX_BATCH_SIZE — one continuity proof covers at most this many transactions. */
export const MAX_BATCH_SIZE = 10;
/** MAX_BATCH_RANGE — and they must fall inside this many blocks. */
export const MAX_BATCH_RANGE = 1000;

function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).split("#")[0].trim();
  }
  return out;
}

export const env = { ...parseEnvFile(resolve(ROOT, ".env.local")), ...process.env } as Record<string, string>;

function required(key: string): string {
  const v = env[key];
  if (!v) throw new Error(`Missing ${key}. See the Setup section of the root README.`);
  return v;
}

export interface Deployments {
  sepolia: { PUSD: string; PriorityVault: string; lockEventSignature: string; repaymentEventSignature: string };
  creditcoin: {
    CollateralRegistry: string;
    ClaimToken: string;
    PriorityEngine: string;
    AttestationGate: string;
    RefinanceEngine: string;
  };
}

/**
 * Load deployed addresses. Fails loudly with the exact command to run rather than proceeding with
 * `undefined` and producing a confusing revert deep inside a proof submission.
 */
export function loadDeployments(): Deployments {
  const sepPath = resolve(ROOT, "contracts/deployments/sepolia.json");
  const ccPath = resolve(ROOT, "contracts/deployments/creditcoin.json");

  if (!existsSync(sepPath)) {
    throw new Error(`No ${sepPath}. Run: cd contracts && make deploy-sepolia`);
  }
  if (!existsSync(ccPath)) {
    throw new Error(`No ${ccPath}. Run: cd contracts && make deploy-creditcoin`);
  }
  return {
    sepolia: JSON.parse(readFileSync(sepPath, "utf8")),
    creditcoin: JSON.parse(readFileSync(ccPath, "utf8")),
  };
}

export function deploymentsExist(): boolean {
  return (
    existsSync(resolve(ROOT, "contracts/deployments/sepolia.json")) &&
    existsSync(resolve(ROOT, "contracts/deployments/creditcoin.json"))
  );
}

// ─────────────────────────────── providers ───────────────────────────────

export function sepoliaProvider(): ethers.JsonRpcProvider {
  const rpc = required("SEPOLIA_RPC");
  if (/rpc\.sepolia\.org/.test(rpc)) {
    // The worker polls event logs continuously; public endpoints rate-limit exactly that and drop
    // `eth_getLogs` under load. A dropped Lock during a demo looks like a protocol failure.
    console.warn("WARNING: SEPOLIA_RPC is a public endpoint. Use a dedicated one.");
  }
  return new ethers.JsonRpcProvider(rpc, SEPOLIA_CHAIN_ID, { staticNetwork: true });
}

export function creditcoinProvider(): ethers.JsonRpcProvider {
  return new ethers.JsonRpcProvider(
    env.CREDITCOIN_RPC ?? "https://rpc.cc3-testnet.creditcoin.network",
    CREDITCOIN_CHAIN_ID,
    { staticNetwork: true },
  );
}

export function proofBuilderUrl(): string {
  return env.PROOF_BUILDER_URL ?? "https://proof-gen-api.cc3-testnet.creditcoin.network";
}

// ─────────────────────────────── signers ───────────────────────────────

/** The prover. Deliberately NOT the deployer — permissionless truth delivery has to be checkable. */
export function proverSigner(): ethers.Wallet {
  return new ethers.Wallet(required("PROVER_CC3_PK"), creditcoinProvider());
}

/** The keeper. Holds no privileges at all; that is the point. */
export function keeperSigner(): ethers.Wallet {
  return new ethers.Wallet(required("KEEPER_CC3_PK"), creditcoinProvider());
}

export function sepoliaSigner(pkEnvKey: string): ethers.Wallet {
  return new ethers.Wallet(required(pkEnvKey), sepoliaProvider());
}

// ─────────────────────────────── contracts ───────────────────────────────

export function gate(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  const d = loadDeployments();
  return new ethers.Contract(
    d.creditcoin.AttestationGate,
    AttestationGate_ABI as unknown as ethers.InterfaceAbi,
    signerOrProvider ?? creditcoinProvider(),
  );
}

export function engine(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  const d = loadDeployments();
  return new ethers.Contract(
    d.creditcoin.PriorityEngine,
    PriorityEngine_ABI as unknown as ethers.InterfaceAbi,
    signerOrProvider ?? creditcoinProvider(),
  );
}

export function registry(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  const d = loadDeployments();
  return new ethers.Contract(
    d.creditcoin.CollateralRegistry,
    CollateralRegistry_ABI as unknown as ethers.InterfaceAbi,
    signerOrProvider ?? creditcoinProvider(),
  );
}

export function vault(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  const d = loadDeployments();
  return new ethers.Contract(
    d.sepolia.PriorityVault,
    PriorityVault_ABI as unknown as ethers.InterfaceAbi,
    signerOrProvider ?? sepoliaProvider(),
  );
}

export function pusd(signerOrProvider?: ethers.Signer | ethers.Provider): ethers.Contract {
  const d = loadDeployments();
  return new ethers.Contract(
    d.sepolia.PUSD,
    PUSD_ABI as unknown as ethers.InterfaceAbi,
    signerOrProvider ?? sepoliaProvider(),
  );
}

export const explorers = {
  sepoliaTx: (h: string) => `${env.SEPOLIA_EXPLORER ?? "https://sepolia.etherscan.io"}/tx/${h}`,
  sepoliaAddr: (a: string) => `${env.SEPOLIA_EXPLORER ?? "https://sepolia.etherscan.io"}/address/${a}`,
  // The REAL CC3 explorer. explorer.cc3-testnet.creditcoin.network does NOT resolve.
  cc3Tx: (h: string) => `${env.CREDITCOIN_EXPLORER ?? "https://creditcoin-testnet.blockscout.com"}/tx/${h}`,
  cc3Addr: (a: string) =>
    `${env.CREDITCOIN_EXPLORER ?? "https://creditcoin-testnet.blockscout.com"}/address/${a}`,
};
