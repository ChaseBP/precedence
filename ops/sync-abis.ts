/**
 * Copy compiled ABIs out of the Foundry build into the worker and the app.
 *
 * Hand-maintained ABIs drift silently: a changed event signature makes the gate stop finding Lock
 * events, and the failure looks like a proof problem rather than a stale ABI. So they are generated,
 * and the generated files carry a header saying so.
 *
 *   bun run ops/sync-abis.ts
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");
const OUT_DIR = resolve(ROOT, "contracts/out");

const CONTRACTS = [
  { name: "PUSD", file: "PUSD.sol" },
  { name: "PriorityVault", file: "PriorityVault.sol" },
  { name: "CollateralRegistry", file: "CollateralRegistry.sol" },
  { name: "ClaimToken", file: "ClaimToken.sol" },
  { name: "PriorityEngine", file: "PriorityEngine.sol" },
  { name: "AttestationGate", file: "AttestationGate.sol" },
  { name: "RefinanceEngine", file: "RefinanceEngine.sol" },
];

if (!existsSync(OUT_DIR)) {
  console.error(`No build output at ${OUT_DIR}. Run: cd contracts && make build`);
  process.exit(1);
}

const abis: Record<string, unknown[]> = {};
for (const c of CONTRACTS) {
  const path = resolve(OUT_DIR, c.file, `${c.name}.json`);
  if (!existsSync(path)) {
    console.error(`missing ${path} — run: cd contracts && make build`);
    process.exit(1);
  }
  const artifact = JSON.parse(readFileSync(path, "utf8"));
  abis[c.name] = artifact.abi;
  console.log(`  ${c.name.padEnd(20)} ${artifact.abi.length} entries`);
}

const header = `/**
 * GENERATED FILE — DO NOT EDIT.
 *
 * Produced by \`bun run ops/sync-abis.ts\` from the Foundry build in \`contracts/out\`.
 * Regenerate after any contract change; a stale ABI fails in ways that look like proof errors.
 *
 * Generated: ${new Date().toISOString()}
 */

`;

// ── worker ──
const workerPath = resolve(ROOT, "worker/src/abis.generated.ts");
let ts = header;
for (const [name, abi] of Object.entries(abis)) {
  ts += `export const ${name}_ABI = ${JSON.stringify(abi, null, 2)} as const;\n\n`;
}
writeFileSync(workerPath, ts);
console.log(`\nwrote ${workerPath}`);

// ── app: only the read-side ABIs it needs, kept small ──
const appDir = resolve(ROOT, "precedence/lib/precedence/adapters/generated");
if (!existsSync(appDir)) mkdirSync(appDir, { recursive: true });
const appPath = resolve(appDir, "abis.ts");
writeFileSync(appPath, ts);
console.log(`wrote ${appPath}`);
