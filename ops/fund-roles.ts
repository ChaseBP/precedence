/**
 * Fund the role accounts from the single funded account.
 *
 * Sepolia ETH is gas-only — pUSD covers principal — so the amounts here are small and deliberate.
 * CC3 gets tCTC for the prover and keeper specifically, because both must be able to act while
 * holding no privileges; an unfunded keeper cannot poke, and a keeper that cannot poke makes the
 * "permissionless unwind" claim untestable.
 *
 *   bun run ops/fund-roles.ts            # dry run — prints the plan, sends nothing
 *   bun run ops/fund-roles.ts --execute  # send
 *   bun run ops/fund-roles.ts --balances # just report current balances
 */
import { ethers } from "ethers";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(import.meta.dir, "../.env.local");
const execute = process.argv.includes("--execute");
const balancesOnly = process.argv.includes("--balances");

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

if (!existsSync(ENV_PATH)) {
  console.error("No .env.local — run: bun run ops/gen-keys.ts");
  process.exit(1);
}
const env = parseEnv(readFileSync(ENV_PATH, "utf8"));

/**
 * Sepolia gas allowances. Each financier does approve + lock (+ retries); the obligor does
 * draw + repay. Deploys stay on the funder, which is why nothing here needs much.
 */
const SEPOLIA_PLAN: { key: string; label: string; eth: string }[] = [
  { key: "OBLIGOR_PK", label: "obligor", eth: "0.012" },
  { key: "FIN_MERIDIAN_PK", label: "meridian", eth: "0.010" },
  { key: "FIN_VECTOR_PK", label: "vector", eth: "0.010" },
  { key: "FIN_NOVUM_PK", label: "novum", eth: "0.010" },
  { key: "FIN_REFINANCER_PK", label: "refinancer", eth: "0.010" },
];

/** CC3 is cheap (0.5 gwei, 75M limit) and the funder holds 10,000 CTC, so be generous. */
const CC3_PLAN: { key: string; label: string; ctc: string }[] = [
  { key: "PROVER_CC3_PK", label: "prover", ctc: "500" },
  { key: "KEEPER_CC3_PK", label: "keeper", ctc: "250" },
];

const sepolia = new ethers.JsonRpcProvider(env.SEPOLIA_RPC);
const cc3 = new ethers.JsonRpcProvider(env.CREDITCOIN_RPC);

const funderSep = new ethers.Wallet(env.FUNDER_PK, sepolia);
const funderCc3 = new ethers.Wallet(env.FUNDER_PK, cc3);

const addr = (k: string) => new ethers.Wallet(env[k]).address;

async function report() {
  console.log("\n── Sepolia ──");
  const fb = await sepolia.getBalance(funderSep.address);
  console.log(`  funder      ${funderSep.address}  ${ethers.formatEther(fb)} ETH`);
  for (const p of SEPOLIA_PLAN) {
    const b = await sepolia.getBalance(addr(p.key));
    console.log(`  ${p.label.padEnd(11)} ${addr(p.key)}  ${ethers.formatEther(b)} ETH`);
  }
  console.log("\n── Creditcoin CC3 ──");
  const cb = await cc3.getBalance(funderCc3.address);
  console.log(`  funder      ${funderCc3.address}  ${ethers.formatEther(cb)} CTC`);
  for (const p of CC3_PLAN) {
    const b = await cc3.getBalance(addr(p.key));
    console.log(`  ${p.label.padEnd(11)} ${addr(p.key)}  ${ethers.formatEther(b)} CTC`);
  }
}

if (balancesOnly) {
  await report();
  process.exit(0);
}

// ── plan ──
const sepTotal = SEPOLIA_PLAN.reduce((s, p) => s + Number(p.eth), 0);
const ctcTotal = CC3_PLAN.reduce((s, p) => s + Number(p.ctc), 0);

console.log(`\n${execute ? "EXECUTING" : "DRY RUN — nothing will be sent"}\n`);
console.log("Sepolia transfers (gas only; pUSD covers principal):");
for (const p of SEPOLIA_PLAN) console.log(`  ${p.eth.padStart(6)} ETH  →  ${p.label.padEnd(11)} ${addr(p.key)}`);
console.log(`  ${String(sepTotal.toFixed(3)).padStart(6)} ETH  total`);

console.log("\nCC3 transfers:");
for (const p of CC3_PLAN) console.log(`  ${p.ctc.padStart(6)} CTC  →  ${p.label.padEnd(11)} ${addr(p.key)}`);
console.log(`  ${String(ctcTotal).padStart(6)} CTC  total`);

const sepBal = await sepolia.getBalance(funderSep.address);
const ctcBal = await cc3.getBalance(funderCc3.address);
const sepNeed = ethers.parseEther(sepTotal.toFixed(6));
const ctcNeed = ethers.parseEther(String(ctcTotal));

console.log(
  `\nFunder Sepolia: ${ethers.formatEther(sepBal)} ETH · need ${ethers.formatEther(sepNeed)} + gas → ` +
    `${sepBal > sepNeed ? "OK" : "INSUFFICIENT"}`,
);
console.log(
  `Funder CC3:     ${ethers.formatEther(ctcBal)} CTC · need ${ethers.formatEther(ctcNeed)} + gas → ` +
    `${ctcBal > ctcNeed ? "OK" : "INSUFFICIENT"}`,
);

if (!execute) {
  console.log("\nRe-run with --execute to send.");
  process.exit(0);
}
if (sepBal <= sepNeed || ctcBal <= ctcNeed) {
  console.error("\nRefusing to execute: funder balance does not cover the plan.");
  process.exit(1);
}

// ── execute, sequentially, so a nonce collision cannot strand a transfer ──
console.log("\n── sending Sepolia ──");
for (const p of SEPOLIA_PLAN) {
  const to = addr(p.key);
  const tx = await funderSep.sendTransaction({ to, value: ethers.parseEther(p.eth) });
  const r = await tx.wait();
  console.log(`  ${p.label.padEnd(11)} ${p.eth} ETH  block ${r?.blockNumber}  ${tx.hash}`);
}

console.log("\n── sending CC3 ──");
for (const p of CC3_PLAN) {
  const to = addr(p.key);
  const tx = await funderCc3.sendTransaction({ to, value: ethers.parseEther(p.ctc) });
  const r = await tx.wait();
  console.log(`  ${p.label.padEnd(11)} ${p.ctc} CTC  block ${r?.blockNumber}  ${tx.hash}`);
}

await report();
console.log("\nFunding complete.");
