/**
 * Run the prover for a settlement, from the app, so nobody has to open a terminal.
 *
 * @remarks The settlement page used to end at a command. Once Attestcoin had attested the source
 * block, everything the proof needs existed and nothing further happened — the interface printed
 * `cd worker && bun run src/cli.ts prove … --from-vault` and stopped. That is a fair description of
 * the architecture and a completely unreasonable thing to show a lender, who now has a real
 * position in a real facility that cannot finish because they do not have a checkout of the repo.
 *
 * The original reasoning still holds and is why this is a *job* rather than inline work: an
 * attestation wait is minutes long and does not belong in a web request. But by the time a
 * settlement reaches `PROOF_READY` that wait is already over. What remains — build the Merkle and
 * continuity proofs, send one Creditcoin transaction, read the result back — is bounded, so it can
 * be started by a request even though it must not be *awaited* by one.
 *
 * It spawns the worker rather than reimplementing it. Proving is the most security-sensitive code
 * in the project and there must be exactly one copy of it; the worker also owns the ethers-based
 * `@gluwa/usc-sdk` dependency that the web app deliberately does not carry. So the app runs the
 * same command it used to print, and the CLI stays the documented, supported path — which is the
 * point, because proving is permissionless and anyone may do it.
 *
 * State lives in memory on `globalThis`. A restart loses the progress log, not the settlement: the
 * proof is on Creditcoin either way, and the next status poll reads it back from the chain.
 */
import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

export type ProverJobState = "running" | "done" | "failed";

export interface ProverJob {
  raceId: string;
  collateralId: string;
  state: ProverJobState;
  startedAt: string;
  finishedAt?: string;
  /** The worker's most recent progress line, for the panel to show. */
  stage: string;
  /** Everything the worker printed, so a failure can be diagnosed without the terminal. */
  log: string[];
  settleTxHash?: string;
  explorerUrl?: string;
  crossCheckAgrees?: boolean;
  evidencePath?: string;
  error?: string;
}

const g = globalThis as unknown as { __precedenceProverJobs?: Map<string, ProverJob> };
const jobs = (g.__precedenceProverJobs ??= new Map<string, ProverJob>());

export function getProverJob(raceId: string): ProverJob | undefined {
  return jobs.get(raceId);
}

/** Where the worker lives, relative to the Next app's working directory. */
const WORKER_DIR = resolve(process.cwd(), "..", "worker");

/**
 * Whether this deployment can prove from the app at all.
 *
 * @remarks Reported rather than discovered on failure, so the UI can offer the button only where
 * pressing it would work, and explain itself where it would not. A hosted deployment with no
 * worker checkout is a legitimate configuration — the CLI path still exists for it.
 */
export function proverAvailable(): { ok: true } | { ok: false; why: string } {
  if (!existsSync(resolve(WORKER_DIR, "src/cli.ts"))) {
    return { ok: false, why: `No worker checkout at ${WORKER_DIR}, so this app cannot run the prover.` };
  }
  if (!existsSync(resolve(WORKER_DIR, "node_modules"))) {
    return { ok: false, why: "The worker's dependencies are not installed — run `cd worker && bun install`." };
  }
  // Read from the root env the worker itself reads, because it is the worker's key, not the app's.
  const root = resolve(process.cwd(), "..");
  const envPath = resolve(root, ".env.local");
  const env = existsSync(envPath) ? readFileSync(envPath, "utf8") : "";
  const hasKey = /^\s*PROVER_CC3_PK\s*=\s*0x[0-9a-fA-F]{64}/m.test(env) || !!process.env.PROVER_CC3_PK;
  if (!hasKey) {
    return { ok: false, why: "No PROVER_CC3_PK is configured, so there is no funded prover to submit with." };
  }
  return { ok: true };
}

export class ProverBusyError extends Error {}

/**
 * Start the prover. Returns immediately; progress is read back through the job.
 *
 * @remarks Deliberately does not await the process. Proving takes tens of seconds and an HTTP
 * request that waits for it is a request that times out on some hosts and blocks a connection on
 * the rest. The status endpoint the page already polls carries the progress instead.
 */
export function startProverJob(raceId: string, collateralId: string): ProverJob {
  const existing = jobs.get(raceId);
  if (existing?.state === "running") {
    throw new ProverBusyError("The prover is already running for this settlement.");
  }

  const job: ProverJob = {
    raceId,
    collateralId,
    state: "running",
    startedAt: new Date().toISOString(),
    stage: "starting the prover",
    log: [],
  };
  jobs.set(raceId, job);

  const bun = process.env.PRECEDENCE_BUN ?? "bun";
  const child = spawn(bun, ["run", "src/cli.ts", "prove", collateralId, "--from-vault", "--json"], {
    cwd: WORKER_DIR,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const absorb = (chunk: Buffer) => {
    for (const raw of chunk.toString("utf8").split("\n")) {
      const line = raw.trimEnd();
      if (!line.trim()) continue;
      // Cap the log. A stuck prover must not grow this without bound, and the tail is the part
      // that explains a failure.
      job.log.push(line);
      if (job.log.length > 200) job.log.splice(0, job.log.length - 200);

      if (line.startsWith("PRECEDENCE_RESULT ")) {
        try {
          const r = JSON.parse(line.slice("PRECEDENCE_RESULT ".length));
          job.settleTxHash = r.settleTxHash;
          job.explorerUrl = r.explorerUrl;
          job.crossCheckAgrees = r.crossCheckAgrees;
          job.evidencePath = r.evidencePath;
        } catch {
          /* a malformed result line is caught by the exit handler below */
        }
        continue;
      }
      // The worker prints progress as "  [stage] detail".
      const m = line.match(/^\s*\[([^\]]+)\]\s*(.*)$/);
      job.stage = m ? `${m[1]}${m[2] ? ` · ${m[2]}` : ""}` : line;
    }
  };

  child.stdout.on("data", absorb);
  child.stderr.on("data", absorb);

  child.on("error", (e) => {
    job.state = "failed";
    job.finishedAt = new Date().toISOString();
    job.error = `could not start the prover: ${e.message}`;
  });

  child.on("close", (code) => {
    job.finishedAt = new Date().toISOString();
    if (job.settleTxHash) {
      // A non-zero exit with a transaction hash means the cross-check disagreed — the proof landed
      // but the precompile and the explorer report different positions. That is a finding to
      // surface, not a failure to hide, and the settlement genuinely exists on chain.
      job.state = "done";
      job.stage = code === 0 ? "settled" : "settled, but the cross-check disagreed";
      return;
    }
    job.state = "failed";
    job.stage = "failed";
    job.error =
      job.log.slice(-6).join(" · ").slice(0, 600) || `the prover exited with code ${code} and printed nothing`;
  });

  return job;
}
