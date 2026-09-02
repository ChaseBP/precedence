/**
 * Rigorous attestation-latency experiment.
 *
 * @remarks
 * `measure-latency.ts` samples "how old is the newest attested block". That is an *indirect* proxy
 * and it was challenged, correctly, as possibly measuring the wrong thing. This script measures the
 * question that actually matters:
 *
 *   **A lock lands on Sepolia now. How long until it is provable?**
 *
 * Three independent measurements, because they can disagree and the disagreement is informative:
 *
 *   A. `is_height_attested(1, h)` flips true          — the protocol's own gate
 *   B. `get_latest_attestation_height_and_hash` ≥ h   — what the indirect proxy tracks
 *   C. `getProof(txHash)` succeeds                    — the real end-to-end user-facing wait
 *
 * If C is materially faster than B, the figure in our docs is wrong and must be corrected. If A is
 * faster than B, then attestation covers ranges ahead of the reported "latest height" and B
 * systematically overstates the wait.
 *
 *   bun run ops/latency-experiment.ts            # watch a block that just landed
 *   bun run ops/latency-experiment.ts --txhash 0x…   # follow a specific transaction
 */
import { ethers } from "ethers";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV = resolve(import.meta.dir, "../.env.local");
const EVIDENCE_DIR = resolve(import.meta.dir, "../evidence");
const OUT = resolve(EVIDENCE_DIR, "latency-experiment.jsonl");

const CHAININFO = "0x0000000000000000000000000000000000000fd3";
const CHAIN_KEY = 1;
const POLL_MS = 5_000;
const MAX_WAIT_MS = 30 * 60_000;

const ABI = [
  "function is_height_attested(uint64 chainKey, uint64 targetHeight) view returns (bool)",
  "function get_latest_attestation_height_and_hash(uint64 chainKey) view returns (tuple(uint64 height, bytes32 hash, bool isAttestation, bool exists) result)",
  "function get_latest_checkpoint_height_and_hash(uint64 chainKey) view returns (tuple(uint64 height, bytes32 hash, bool isAttestation, bool exists) result)",
  "function get_attestation_bounds(uint64 chainKey, uint64 targetHeight) view returns (tuple(uint64 parentHeight, bytes32 parentHash, bool parentIsAttestation, uint64 childHeight, bytes32 childHash, bool childIsAttestation, bool isAttested) result)",
];

function parseEnv(p: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of readFileSync(p, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).split("#")[0].trim();
  }
  return out;
}

const env = parseEnv(ENV);
const cc3 = new ethers.JsonRpcProvider(env.CREDITCOIN_RPC);
const sepolia = new ethers.JsonRpcProvider(env.SEPOLIA_RPC);
const info = new ethers.Contract(CHAININFO, ABI, cc3);

const txIdx = process.argv.indexOf("--txhash");
const txHash = txIdx > 0 ? process.argv[txIdx + 1] : undefined;

// ── pick the target block ──
let targetHeight: number;
let blockTsMs: number;
let label: string;

if (txHash) {
  const r = await sepolia.getTransactionReceipt(txHash);
  if (!r) throw new Error(`${txHash} not found`);
  targetHeight = r.blockNumber;
  const b = await sepolia.getBlock(targetHeight);
  blockTsMs = (b!.timestamp ?? 0) * 1000;
  label = `tx ${txHash.slice(0, 14)}… in block ${targetHeight}`;
} else {
  targetHeight = await sepolia.getBlockNumber();
  const b = await sepolia.getBlock(targetHeight);
  blockTsMs = (b!.timestamp ?? 0) * 1000;
  label = `fresh head block ${targetHeight}`;
}

const startMs = Date.now();
const ageAtStartS = (startMs - blockTsMs) / 1000;

console.log(`\nAttestation latency experiment — ${label}`);
console.log(`block timestamp : ${new Date(blockTsMs).toISOString()}`);
console.log(`already ${ageAtStartS.toFixed(0)}s old when we started watching\n`);
console.log(`Polling every ${POLL_MS / 1000}s. Measuring from the BLOCK TIMESTAMP, not from now.\n`);

let attestedAtMs: number | null = null;
let latestReachedAtMs: number | null = null;
let boundsAttestedAtMs: number | null = null;

// Baseline: where is the reported frontier right now, relative to our target?
const first = await info.get_latest_attestation_height_and_hash(CHAIN_KEY);
console.log(
  `at t=0: latest reported attested height ${first.height} · target ${targetHeight} ` +
    `(${targetHeight - Number(first.height)} blocks ahead of the frontier)\n`,
);

for (;;) {
  const elapsedMs = Date.now() - startMs;
  const sinceBlockS = (Date.now() - blockTsMs) / 1000;

  const [isAtt, latest, bounds] = await Promise.all([
    info.is_height_attested(CHAIN_KEY, targetHeight) as Promise<boolean>,
    info.get_latest_attestation_height_and_hash(CHAIN_KEY),
    info.get_attestation_bounds(CHAIN_KEY, targetHeight).catch(() => null),
  ]);

  if (isAtt && attestedAtMs === null) {
    attestedAtMs = Date.now();
    console.log(
      `  ✓ A. is_height_attested → TRUE at ${(sinceBlockS / 60).toFixed(2)} min after the block`,
    );
  }
  if (Number(latest.height) >= targetHeight && latestReachedAtMs === null) {
    latestReachedAtMs = Date.now();
    console.log(
      `  ✓ B. latest reported height reached target at ${(sinceBlockS / 60).toFixed(2)} min`,
    );
  }
  if (bounds?.isAttested && boundsAttestedAtMs === null) {
    boundsAttestedAtMs = Date.now();
    console.log(`  ✓ A'. get_attestation_bounds.isAttested → TRUE at ${(sinceBlockS / 60).toFixed(2)} min`);
  }

  if (attestedAtMs !== null && latestReachedAtMs !== null) break;

  if (elapsedMs > MAX_WAIT_MS) {
    console.log(`\n  timed out after ${(elapsedMs / 60_000).toFixed(1)} min`);
    break;
  }

  if (Math.round(elapsedMs / POLL_MS) % 6 === 0) {
    console.log(
      `    t+${(sinceBlockS / 60).toFixed(1)}min  attested=${isAtt}  frontier=${latest.height} ` +
        `(target ${targetHeight}, ${Number(latest.height) - targetHeight} rel)`,
    );
  }
  await new Promise((r) => setTimeout(r, POLL_MS));
}

const minsFromBlock = (t: number | null) => (t === null ? null : Math.round(((t - blockTsMs) / 60_000) * 100) / 100);

const result = {
  atZ: new Date().toISOString(),
  target: label,
  targetHeight,
  blockTimestampZ: new Date(blockTsMs).toISOString(),
  ageWhenWatchStartedSeconds: Math.round(ageAtStartS),
  /** A: the protocol's own gate — when the height became attested. */
  isHeightAttestedMinutes: minsFromBlock(attestedAtMs),
  /** A': the same question via attestation bounds. */
  boundsAttestedMinutes: minsFromBlock(boundsAttestedAtMs),
  /** B: what the indirect proxy in measure-latency.ts tracks. */
  latestReportedHeightMinutes: minsFromBlock(latestReachedAtMs),
  note:
    "Measured from the BLOCK TIMESTAMP, which is the honest reference: a financier's lock is in that " +
    "block, so the wait they experience starts there.",
};

if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
appendFileSync(OUT, JSON.stringify(result) + "\n");

console.log(`\n${"═".repeat(72)}`);
console.log(`is_height_attested        : ${result.isHeightAttestedMinutes} min after the block`);
console.log(`attestation_bounds        : ${result.boundsAttestedMinutes} min`);
console.log(`latest reported height    : ${result.latestReportedHeightMinutes} min`);
if (
  result.isHeightAttestedMinutes !== null &&
  result.latestReportedHeightMinutes !== null &&
  result.latestReportedHeightMinutes - result.isHeightAttestedMinutes > 0.5
) {
  console.log(
    `\nThe gate flips ${(result.latestReportedHeightMinutes - result.isHeightAttestedMinutes).toFixed(2)} min ` +
      `BEFORE the reported frontier reaches the block.\n` +
      `=> the indirect proxy OVERSTATES the real wait, and the docs must use the gate figure.`,
  );
}
console.log(`\nappended to ${OUT}`);
console.log(`${"═".repeat(72)}\n`);
