/**
 * The seams every API route test drives.
 *
 * @remarks A route's job is to turn what the chains say into a status code and a body, so a test
 * has to be able to say what the chains say. That is all this file is: mutable knobs, plus
 * `resetFakes()` to put them back.
 *
 * Nothing here reaches a network, and that is the point rather than a convenience. A unit test
 * that could reach Sepolia would pass or fail for reasons that have nothing to do with the code
 * under test — a throttled public RPC, an unattested block, a testnet reorg — and the one thing
 * this suite is for is telling a real regression apart from weather. The live path is covered
 * elsewhere: `contracts/` tests the settlement rules, `ops/verify-precompile.ts` tests the
 * precompile against CC3, and `evidence/` holds what actually happened on chain.
 *
 * Installed process-wide by `test/setup.ts` before any test module loads. Mocking there rather
 * than per-file is deliberate: `mock.module` in Bun is not undone between test files, so a mock
 * installed by one file leaks into every file that runs after it. One complete installation, and
 * that ordering hazard cannot exist.
 */
import type { Address } from "viem";
import type {
  AdapterMode,
  DeployedAddresses,
  PrecedenceConfig,
  RuntimeMode,
} from "@/lib/precedence/config";
import type {
  OnChainRaceState,
  VerifiedLock,
  VerifiedRaceOpen,
} from "@/lib/precedence/adapters/sepolia/sepolia-reader";
import type { AttestationFrontier } from "@/lib/precedence/adapters/creditcoin/attestation-reader";
import type { ProverJob } from "@/lib/precedence/orchestrator/prover-job";
import type { Hex, PriorityRace, RegistrationProposal, SourceLockRecord } from "@precedence/sdk/types";

/** A stand-in vault address. Deliberately not any address this project has deployed. */
export const FAKE_VAULT = "0x1111111111111111111111111111111111111111" as Address;
/** A stand-in obligor wallet, distinct from the vault so a mix-up shows up as a failure. */
export const FAKE_OBLIGOR = "0x2222222222222222222222222222222222222222" as Address;
export const FAKE_LENDER = "0x3333333333333333333333333333333333333333" as Address;
export const FAKE_LENDER_2 = "0x4444444444444444444444444444444444444444" as Address;
export const FAKE_TOKEN = "0x5555555555555555555555555555555555555555" as Address;

/** A 32-byte document hash that passes the `^0x[0-9a-f]{64}$` check the seed fixtures fail. */
export const REAL_DOC_HASH = ("0x" + "ab".repeat(32)) as Hex;
export const OTHER_DOC_HASH = ("0x" + "cd".repeat(32)) as Hex;

/** A 32-byte transaction hash, parameterised so a test can tell two of them apart. */
export const txHash = (n: number): Hex =>
  ("0x" + n.toString(16).padStart(2, "0").repeat(32).slice(0, 64)) as Hex;

// ───────────────────────────── the Sepolia reader ─────────────────────────────

/** The vault's storage, as `raceState` would report it. */
export function vaultState(over: Partial<OnChainRaceState> = {}): OnChainRaceState {
  return {
    obligor: FAKE_OBLIGOR,
    registered: true,
    raceOpen: true,
    raceNonce: 1,
    lockCount: 0,
    facilitySizeUsd: 100_000,
    totalLockedUsd: 0,
    // Far enough ahead that a test never races the clock.
    raceDeadline: Math.floor(Date.now() / 1000) + 3600,
    totalDrawnUsd: 0,
    totalRepaidUsd: 0,
    drawDeadline: 0,
    ...over,
  };
}

export function verifiedOpen(over: Partial<VerifiedRaceOpen> = {}): VerifiedRaceOpen {
  return {
    collateralId: REAL_DOC_HASH,
    raceNonce: 1,
    facilitySizeUsd: 100_000,
    deadline: Math.floor(Date.now() / 1000) + 3600,
    blockNumber: 9_000_000,
    txIndex: 12,
    txHash: txHash(1),
    emittedBy: FAKE_VAULT,
    ...over,
  };
}

export function verifiedLock(over: Partial<VerifiedLock> = {}): VerifiedLock {
  return {
    collateralId: REAL_DOC_HASH,
    financier: FAKE_LENDER,
    tranche: "SENIOR",
    amountUsd: 60_000,
    token: FAKE_TOKEN,
    raceNonce: 1,
    seq: 1,
    eventBlockNumber: 9_000_010,
    allowDemotion: false,
    blockNumber: 9_000_010,
    txIndex: 71,
    txHash: txHash(2),
    emittedBy: FAKE_VAULT,
    ...over,
  };
}

/**
 * Everything `SepoliaReader` is asked for, as replaceable functions.
 *
 * @remarks Functions rather than values so a test can throw, count calls, or answer differently
 * per collateral. `sepolia.why` standing in for the whole reader covers the case a deployment
 * without `contracts/deployments/sepolia.json` is actually in.
 */
export const sepolia = {
  /** Set to a reason string to make `getSepoliaReader()` report no reader at all. */
  why: null as string | null,
  vaultAddress: FAKE_VAULT,
  blockNumber: async (): Promise<number> => 9_000_042,
  raceState: async (_collateralId: Hex): Promise<OnChainRaceState> => vaultState(),
  verifyRaceOpen: async (_tx: Hex, _collateralId: Hex): Promise<VerifiedRaceOpen> => verifiedOpen(),
  verifyLock: async (_tx: Hex, _collateralId: Hex): Promise<VerifiedLock> => verifiedLock(),
  locksFromChain: async (_collateralId: Hex, _nonce: number): Promise<SourceLockRecord[]> => [],
};

// ───────────────────────────── Attestcoin ─────────────────────────────

export function frontier(over: Partial<AttestationFrontier> = {}): AttestationFrontier {
  return {
    chainKey: 1n,
    attestedHeight: 9_000_000,
    checkpointHeight: 9_000_000,
    ...over,
  } as AttestationFrontier;
}

export const attest = {
  frontier: async (): Promise<AttestationFrontier> => frontier(),
  isAttested: async (_height: number): Promise<boolean> => true,
  readiness: async (_collateralId: Hex): Promise<{ ok: true } | { ok: false; why: string }> => ({
    ok: true,
  }),
  alreadySettled: async (_collateralId: Hex): Promise<boolean> => false,
};

// ───────────────────────────── the prover ─────────────────────────────

export function proverJob(over: Partial<ProverJob> = {}): ProverJob {
  return {
    raceId: "live-abababab-1",
    collateralId: REAL_DOC_HASH,
    state: "running",
    stage: "building the proof",
    startedAt: new Date().toISOString(),
    log: [],
    ...over,
  } as ProverJob;
}

export const prover = {
  available: { ok: true } as { ok: true } | { ok: false; why: string },
  /** The job `getProverJob` reports, keyed loosely: one job is enough for a route test. */
  job: undefined as ProverJob | undefined,
  /** Set to make `startProverJob` throw — `ProverBusyError` is the interesting one. */
  startThrows: null as Error | null,
  started: [] as { raceId: string; collateralId: string }[],
};

// ───────────────────────────── config and adapters ─────────────────────────────

/**
 * Overrides for `getConfig()`, `getDeps()` and `loadDeployedAddresses()`.
 *
 * @remarks `sepoliaLive`/`creditcoinLive` are the two that matter most. The whole honesty
 * mechanism is that the UI reads an adapter's own `isLive()` rather than an env var, so the
 * routes that report provenance have three states to get right and no way to reach two of them
 * from a test that cannot deploy contracts.
 */
export const deps = {
  sepoliaLive: false,
  creditcoinLive: false,
  notes: {
    sepolia: "mock requested",
    creditcoin: "mock requested",
  },
  /** Merged over the real `getConfig()` result. */
  config: {} as Partial<PrecedenceConfig>,
  /** `null` passes through to the real deployment files; an object replaces them. */
  addresses: null as DeployedAddresses | null,
  /** Present = the runtime can read documents, which is what `/api/collateral/parse` checks. */
  proposeRegistration: null as ((text: string) => Promise<RegistrationProposal>) | null,
};

export function proposal(over: Partial<RegistrationProposal> = {}): RegistrationProposal {
  return {
    assetType: "warehouse-receipt",
    title: "40 tonnes copper cathode",
    docIdentifier: "WR-2026-441",
    obligor: "Northwind Metals Ltd",
    custodian: "Antwerp Bonded Storage",
    custodianLocation: "Antwerp, Belgium",
    faceValueUsd: 480_000,
    termDays: 90,
    confidence: 0.95,
    concerns: [],
    model: "test-double",
    extractedAt: new Date().toISOString(),
    ...over,
  };
}

// ───────────────────────────── the settlement writer ─────────────────────────────

/**
 * `applyProvenSettlement` reads the prover's evidence file and re-verifies the settlement
 * transaction against Creditcoin before it will write a settlement. Both of those are correct and
 * neither belongs in a route test, so the status route's "a prover finished since the last poll"
 * branch drives this instead. `null` runs the real thing.
 */
export const liveRace = {
  applyProvenSettlement: null as
    | ((raceId: string, evidencePath: string) => Promise<PriorityRace | undefined>)
    | null,
  appliedWith: [] as { raceId: string; evidencePath: string }[],
};

// ───────────────────────────── outbound fetch ─────────────────────────────

/**
 * What the RPC proxy's upstream answers. The proxy is the one route whose whole job is a
 * `fetch`, so the fetch has to be the thing a test controls.
 */
export const upstream = {
  calls: [] as { url: string; body: unknown; headers: Record<string, string> }[],
  status: 200,
  body: JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0xa4b1" }),
  throws: null as Error | null,
};

// ───────────────────────────── reset ─────────────────────────────

/**
 * Put every knob back. Called from each suite's `beforeEach`, because a knob left set by one
 * test is the kind of failure that only appears when the file is run in a different order.
 */
export function resetFakes(): void {
  sepolia.why = null;
  sepolia.vaultAddress = FAKE_VAULT;
  sepolia.blockNumber = async () => 9_000_042;
  sepolia.raceState = async () => vaultState();
  sepolia.verifyRaceOpen = async () => verifiedOpen();
  sepolia.verifyLock = async () => verifiedLock();
  sepolia.locksFromChain = async () => [];

  attest.frontier = async () => frontier();
  attest.isAttested = async () => true;
  attest.readiness = async () => ({ ok: true });
  attest.alreadySettled = async () => false;

  prover.available = { ok: true };
  prover.job = undefined;
  prover.startThrows = null;
  prover.started = [];

  deps.sepoliaLive = false;
  deps.creditcoinLive = false;
  deps.notes = { sepolia: "mock requested", creditcoin: "mock requested" };
  deps.config = {};
  deps.addresses = null;
  deps.proposeRegistration = null;

  liveRace.applyProvenSettlement = null;
  liveRace.appliedWith = [];

  upstream.calls = [];
  upstream.status = 200;
  upstream.body = JSON.stringify({ jsonrpc: "2.0", id: 1, result: "0xa4b1" });
  upstream.throws = null;
}

/** Type re-exports so a test file needs one import for the shapes it builds. */
export type { AdapterMode, DeployedAddresses, PriorityRace, RuntimeMode };
