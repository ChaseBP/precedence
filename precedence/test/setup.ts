/**
 * Test preload: a deterministic environment, and the chain seams stubbed before anything loads.
 *
 * @remarks Registered as `[test] preload` in `bunfig.toml`, so this runs once per `bun test`
 * process before any test module is imported. Two jobs.
 *
 * **1. Pin the environment.** Every route's answer depends on `process.env`, and the ambient
 * shell here has the real deployment's variables in it. A suite that inherits them passes for the
 * wrong reason: an earlier bug in this project — inline `#` comments being parsed into every
 * private key — went undetected precisely because the environment had been sourced into the shell
 * that ran the check. So the variables the app reads are set here, explicitly, and the ones that
 * would point a test at a real chain are deleted rather than left to chance.
 *
 * `PRECEDENCE_STORE_PATH` in particular: `json-store.ts` reads it at module load, so it has to be
 * gone before the first import, or a test run would write over the deployment's own store.
 *
 * **2. Install the chain seams.** `mock.module` is process-wide in Bun and is *not* reset between
 * test files, so mocking per-file makes a suite's result depend on the order its files ran in.
 * Installing the complete set here once removes that hazard: every file sees the same seams, and
 * `resetFakes()` in a `beforeEach` is all a suite needs.
 */
import { mock } from "bun:test";
import { attest, deps, liveRace, prover, sepolia, upstream } from "./helpers/fakes";

// ───────────────────────────── 1. the environment ─────────────────────────────

// Memory-only. Set before any import so `json-store.ts` cannot see a path.
delete process.env.PRECEDENCE_STORE_PATH;

// Mock adapters. The chain seams below are what a test drives; these keep anything not stubbed —
// `getDeps()`'s own clients — off the network too.
process.env.PRECEDENCE_MODE = "mock";
process.env.PRECEDENCE_SEPOLIA = "mock";
process.env.PRECEDENCE_CREDITCOIN = "mock";
process.env.PRECEDENCE_RUNTIME = "local";

// No credentials, and no RPC that resolves.
delete process.env.SEPOLIA_RPC;
delete process.env.CREDITCOIN_RPC;
delete process.env.GEMINI_API_KEY;
for (const k of Object.keys(process.env)) if (k.endsWith("_PK")) delete process.env[k];

// `/api/config`'s canary fires on this, so it must start clear — the suite sets it deliberately.
delete process.env.PRECEDENCE_API_ORIGIN;
delete process.env.PRECEDENCE_ADMIN_TOKEN;

// Read at module load in `config.ts`, so pin them rather than inherit a deployment's.
process.env.SEPOLIA_EXPLORER = "https://sepolia.etherscan.io";
process.env.CREDITCOIN_EXPLORER = "https://creditcoin-testnet.blockscout.com";

// Fee basis points are quoted in responses; pin them so an assertion is about the route.
process.env.PRECEDENCE_PROTOCOL_FEE_BPS = "25";
process.env.PRECEDENCE_PROVER_FEE_BPS = "5";
process.env.PRECEDENCE_REFINANCE_FEE_BPS = "15";

// ───────────────────────────── 2. the Sepolia reader ─────────────────────────────

/**
 * Declared here rather than imported from the real module, so that every `instanceof` in the app
 * resolves to this one class.
 *
 * @remarks `live-race.ts` re-exports `NotVerifiableError` and the routes import it from there to
 * decide between 422 and 502. If the class a test throws were a different class from the one a
 * route checks, every "the chain answered and said no" test would silently assert 502 — the
 * status that tells a caller to retry something that will never succeed.
 */
class NotVerifiableError extends Error {}

mock.module("@/lib/precedence/adapters/sepolia/sepolia-reader", () => ({
  SEPOLIA_CHAIN_ID: 11155111,
  NotVerifiableError,
  SepoliaReader: class {
    get vaultAddress() {
      return sepolia.vaultAddress;
    }
  },
  getSepoliaReader: () =>
    sepolia.why !== null
      ? { reader: null, why: sepolia.why }
      : {
          reader: {
            get vaultAddress() {
              return sepolia.vaultAddress;
            },
            blockNumber: () => sepolia.blockNumber(),
            raceState: (id: string) => sepolia.raceState(id as `0x${string}`),
            verifyRaceOpen: (tx: string, id: string) =>
              sepolia.verifyRaceOpen(tx as `0x${string}`, id as `0x${string}`),
            verifyLock: (tx: string, id: string) =>
              sepolia.verifyLock(tx as `0x${string}`, id as `0x${string}`),
            locksFromChain: (id: string, n: number) =>
              sepolia.locksFromChain(id as `0x${string}`, n),
          },
        },
}));

// ───────────────────────────── 3. Attestcoin ─────────────────────────────

mock.module("@/lib/precedence/adapters/creditcoin/attestation-reader", () => ({
  SEPOLIA_CHAIN_KEY: 1n,
  AttestationReader: class {
    frontier() {
      return attest.frontier();
    }
    isAttested(height: number) {
      return attest.isAttested(height);
    }
  },
  creditcoinReadiness: (id: string) => attest.readiness(id as `0x${string}`),
  alreadySettledOnCreditcoin: (id: string) => attest.alreadySettled(id as `0x${string}`),
}));

// ───────────────────────────── 4. the prover ─────────────────────────────

class ProverBusyError extends Error {}

mock.module("@/lib/precedence/orchestrator/prover-job", () => ({
  ProverBusyError,
  proverAvailable: () => prover.available,
  getProverJob: () => prover.job,
  startProverJob: (raceId: string, collateralId: string) => {
    if (prover.startThrows) throw prover.startThrows;
    prover.started.push({ raceId, collateralId });
    return (prover.job ??= {
      raceId,
      collateralId,
      state: "running",
      stage: "starting",
      startedAt: new Date().toISOString(),
      log: [],
    });
  },
}));

/** Exported so a test can throw the class the route's `instanceof` actually checks. */
export { NotVerifiableError, ProverBusyError };

// ───────────────────────────── 5. config, by delegation ─────────────────────────────

/**
 * Config is mocked as a *pass-through* with overrides, not replaced.
 *
 * @remarks It exports verified network constants, the adapter builders and the dependency cache,
 * and a dozen modules import it. Replacing it wholesale would mean reimplementing it, and then the
 * suite would be testing the reimplementation. So the real module is imported first and its
 * exports are spread; only the three functions a test needs to steer are wrapped.
 *
 * `isLive()` is wrapped through a `Proxy` rather than by spreading the client, because these are
 * class instances — a spread would drop every method onto a bare object and the next call into
 * the adapter would fail for a reason unrelated to the test.
 */
/**
 * The real exports are captured into locals *before* the mock is installed.
 *
 * @remarks `mock.module` mutates the module's namespace object in place, so a factory that reads
 * `realConfig.getConfig` at call time reads its own wrapper and recurses until the stack goes.
 * Snapshotting the function references first is the whole fix, and it has to be a snapshot rather
 * than a namespace reference.
 */
const realConfigNs = await import("@/lib/precedence/config");
const realConfigExports = { ...realConfigNs };
const realGetConfig = realConfigNs.getConfig;
const realGetDeps = realConfigNs.getDeps;
const realLoadDeployedAddresses = realConfigNs.loadDeployedAddresses;

function withIsLive<T extends object>(target: T, live: () => boolean): T {
  return new Proxy(target, {
    get: (t, p, r) => (p === "isLive" ? live : Reflect.get(t, p, r)),
  });
}

mock.module("@/lib/precedence/config", () => ({
  ...realConfigExports,
  getConfig: () => ({ ...realGetConfig(), ...deps.config }),
  loadDeployedAddresses: () => deps.addresses ?? realLoadDeployedAddresses(),
  getDeps: () => {
    const real = realGetDeps();
    return {
      ...real,
      config: { ...real.config, ...deps.config },
      sepolia: withIsLive(real.sepolia, () => deps.sepoliaLive),
      creditcoin: withIsLive(real.creditcoin, () => deps.creditcoinLive),
      modeNotes: deps.notes,
      runtime: new Proxy(real.runtime, {
        get: (t, p, r) =>
          p === "proposeRegistration"
            ? (deps.proposeRegistration ?? undefined)
            : Reflect.get(t, p, r),
      }),
    };
  },
}));

// ───────────────────────────── 6. the settlement writer ─────────────────────────────

const realLiveRaceNs = await import("@/lib/precedence/orchestrator/live-race");
const realLiveRaceExports = { ...realLiveRaceNs };
const realApplyProvenSettlement = realLiveRaceNs.applyProvenSettlement;

mock.module("@/lib/precedence/orchestrator/live-race", () => ({
  ...realLiveRaceExports,
  NotVerifiableError,
  applyProvenSettlement: (raceId: string, evidencePath: string) => {
    liveRace.appliedWith.push({ raceId, evidencePath });
    return liveRace.applyProvenSettlement
      ? liveRace.applyProvenSettlement(raceId, evidencePath)
      : realApplyProvenSettlement(raceId, evidencePath);
  },
}));

// ───────────────────────────── 7. outbound fetch ─────────────────────────────

/**
 * The RPC proxy's whole behaviour is what it forwards and what it refuses, so the forward has to
 * be observable. Anything else calling out would be a bug in a unit test, and this makes it loud
 * rather than slow: an unexpected host throws instead of hanging.
 */
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (!/^https?:\/\/(rpc|test-upstream)/.test(url)) {
    throw new Error(`a test tried to fetch ${url} — unit tests must not reach the network`);
  }
  upstream.calls.push({
    url,
    body: init?.body ? JSON.parse(String(init.body)) : undefined,
    headers: (init?.headers ?? {}) as Record<string, string>,
  });
  if (upstream.throws) throw upstream.throws;
  return new Response(upstream.body, {
    status: upstream.status,
    headers: { "content-type": "application/json" },
  });
}) as typeof fetch;

/** Kept so a test that genuinely needs it can restore the real one. */
export { realFetch };
