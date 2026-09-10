/**
 * Measure real Attestcoin attestation latency and append it to evidence/latency.jsonl.
 *
 * Attestcoin does not document this figure anywhere. The project's own first estimate asserted
 * ~8–10 minutes with no source. Three samples on 2026-09-01 put it at 7.2–8.7 min, and showed the
 * lag is a SAWTOOTH — attestation advances in batches, so the gap grows until the next batch lands
 * and then snaps back. A single number would misrepresent it either way.
 *
 * This probe runs long enough to produce a distribution, which is what the docs and the demo
 * timing should be built on.
 *
 *   bun run ops/measure-latency.ts                 # sample every 60s until stopped
 *   bun run ops/measure-latency.ts --once          # single sample
 *   bun run ops/measure-latency.ts --summary       # summarise what has been collected
 *   bun run ops/measure-latency.ts --interval 30   # custom interval in seconds
 */
import { ethers } from "ethers";
import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(import.meta.dir, "../.env.local");
const EVIDENCE_DIR = resolve(import.meta.dir, "../evidence");
const OUT = resolve(EVIDENCE_DIR, "latency.jsonl");

const SEPOLIA_CHAIN_KEY = 1;
const CHAININFO = "0x0000000000000000000000000000000000000fd3";

/** The on-chain ChainInfo precompile uses snake_case names. */
const CHAININFO_ABI = [
  "function get_latest_attestation_height_and_hash(uint64 chainKey) view returns (tuple(uint64 height, bytes32 hash, bool isAttestation, bool exists) result)",
  "function get_latest_checkpoint_height_and_hash(uint64 chainKey) view returns (tuple(uint64 height, bytes32 hash, bool isAttestation, bool exists) result)",
  "function is_height_attested(uint64 chainKey, uint64 targetHeight) view returns (bool isAttested)",
];

function parseEnv(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i > 0) out[t.slice(0, i).trim()] = t.slice(i + 1).split("#")[0].trim();
  }
  return out;
}

interface Sample {
  atZ: string;
  attestedHeight: number;
  checkpointHeight: number;
  sepoliaHead: number;
  lagBlocks: number;
  /** Wall clock now minus the attested block's own timestamp. The honest figure. */
  lagMinutes: number;
  attestedBlockTsZ: string;
}

function summarise() {
  if (!existsSync(OUT)) {
    console.log("No samples yet.");
    return;
  }
  const rows: Sample[] = readFileSync(OUT, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
  if (!rows.length) return console.log("No samples yet.");

  const lags = rows.map((r) => r.lagMinutes).sort((a, b) => a - b);
  const q = (p: number) => lags[Math.min(lags.length - 1, Math.floor(p * lags.length))];
  const mean = lags.reduce((s, v) => s + v, 0) / lags.length;

  const lastAt = new Date(rows[rows.length - 1].atZ).getTime();
  const staleMinutes = (Date.now() - lastAt) / 60_000;

  console.log(`\nAttestcoin attestation latency — Sepolia (chainKey ${SEPOLIA_CHAIN_KEY})`);
  console.log(`samples : ${rows.length}`);
  console.log(`window  : ${rows[0].atZ} → ${rows[rows.length - 1].atZ}`);
  if (staleMinutes > 10) {
    console.log(
      `\n!! STALE: the newest sample is ${staleMinutes.toFixed(0)} minutes old, so the sampler is not ` +
        `running.\n   Restart it before quoting these figures:\n` +
        `   nohup bun run ops/measure-latency.ts --interval 60 >> evidence/latency.log 2>&1 &\n`,
    );
  }
  console.log(`min     : ${lags[0].toFixed(2)} min`);
  console.log(`p50     : ${q(0.5).toFixed(2)} min`);
  console.log(`p90     : ${q(0.9).toFixed(2)} min`);
  console.log(`p99     : ${q(0.99).toFixed(2)} min`);
  console.log(`max     : ${lags[lags.length - 1].toFixed(2)} min`);
  console.log(`mean    : ${mean.toFixed(2)} min`);
  console.log(
    `\nQuote as a RANGE: "${lags[0].toFixed(1)}–${lags[lags.length - 1].toFixed(1)} minutes, measured over ` +
      `${rows.length} samples". Attestation advances in batches, so the lag is a sawtooth, not a constant.`,
  );
  console.log(`\nDemo staging: pre-stage source transactions at least ${Math.ceil(q(0.9)) + 3} minutes ahead (p90 + 3 min buffer).`);
}

if (process.argv.includes("--summary")) {
  summarise();
  process.exit(0);
}

const env = parseEnv(readFileSync(ENV_PATH, "utf8"));
const cc3 = new ethers.JsonRpcProvider(env.CREDITCOIN_RPC);
const sepolia = new ethers.JsonRpcProvider(env.SEPOLIA_RPC);
const info = new ethers.Contract(CHAININFO, CHAININFO_ABI, cc3);

if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });

async function sample(): Promise<Sample | null> {
  try {
    const [att, ckpt] = await Promise.all([
      info.get_latest_attestation_height_and_hash(SEPOLIA_CHAIN_KEY),
      info.get_latest_checkpoint_height_and_hash(SEPOLIA_CHAIN_KEY),
    ]);
    const attestedHeight = Number(att.height);
    const sepoliaHead = await sepolia.getBlockNumber();
    const blk = await sepolia.getBlock(attestedHeight);
    if (!blk) return null;

    const s: Sample = {
      atZ: new Date().toISOString(),
      attestedHeight,
      checkpointHeight: Number(ckpt.height),
      sepoliaHead,
      lagBlocks: sepoliaHead - attestedHeight,
      lagMinutes: Math.round(((Date.now() / 1000 - blk.timestamp) / 60) * 100) / 100,
      attestedBlockTsZ: new Date(blk.timestamp * 1000).toISOString(),
    };
    appendFileSync(OUT, JSON.stringify(s) + "\n");
    return s;
  } catch (e) {
    console.error(`[${new Date().toISOString()}] sample failed:`, (e as Error).message.slice(0, 120));
    return null;
  }
}

const once = process.argv.includes("--once");
const iIdx = process.argv.indexOf("--interval");
const intervalMs = (iIdx > 0 ? Number(process.argv[iIdx + 1]) : 60) * 1000;

const first = await sample();
if (first) {
  console.log(
    `[${first.atZ}] attested ${first.attestedHeight} · head ${first.sepoliaHead} · ` +
      `lag ${first.lagBlocks} blocks / ${first.lagMinutes} min`,
  );
}

if (once) {
  summarise();
  process.exit(0);
}

console.log(`Sampling every ${intervalMs / 1000}s → ${OUT}. Ctrl-C to stop; --summary to report.`);
setInterval(async () => {
  const s = await sample();
  if (s) {
    console.log(
      `[${s.atZ}] attested ${s.attestedHeight} · head ${s.sepoliaHead} · ` +
        `lag ${s.lagBlocks} blocks / ${s.lagMinutes} min`,
    );
  }
}, intervalMs);
