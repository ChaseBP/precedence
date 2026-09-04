/**
 * Pre-submission gate.
 *
 * Non-negotiable #1 is that no invented transaction hash, address, block number or explorer link
 * ever reaches a judge presented as real — a single dead link ends the submission. Checking that by
 * eye across five documents does not scale, so it is checked mechanically.
 *
 * Three passes:
 *   1. every URL in the docs resolves — EXCEPT ones the docs themselves label as dead
 *   2. every `0x…` literal is either a verified-real value, a visible SAMPLE, or a truncation
 *   3. required submission deliverables exist
 *
 *   bun run ops/check-submission.ts
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ROOT = resolve(import.meta.dir, "..");

const DOCS = [
  "README.md",
  "ATTESTCOIN_INTEGRATION.md",
  "PREREQUISITES.md",
  "IMPLEMENTATION_PLAN.md",
  "precedence/README.md",
  "worker/README.md",
];

/**
 * Values that are genuinely real and verifiable on a block explorer, or official Attestcoin
 * addresses. Anything else hex-shaped in the docs must be a visible SAMPLE.
 */
const REAL_VALUES = new Set(
  [
    // funding transactions we actually broadcast
    "0x144bc395f407d98d722e780d805786125e07283e141006c6c9bfafa64c5f6f78",
    "0xc58e9177d4dea9a25dc205d80e458da11efb56635f73900e2ae413ad699f77cf",
    "0xf2b901f9898354cfbb01af86150105eceb1cc04d93a5365066f12fd3a6b6bd09",
    "0x51e1ab0be5092cc7f0f71b80d22b8f46fa8e5824f559177d8839ab49c2dfb8ba",
    "0x22c10e8c911c46a391baf3aa9242698d4b03022cab379b7d53a8d6779d85697a",
    "0x8f2de8b2d245d570e53f489e4a93968395c043c48a2a921df6e912c0a25d16cf",
    "0xa7533750b364152675862f1fe2d42926550593fcd369e9550081fa47ef43e204",
    "0x9650aeb1f625e00aa2f8983d3cc5a533eef761afa8b82b4b1e334a4ae6547ebe",
    // funded role addresses
    "0xd267C91BF81207222cC8d7300D11CD1849bd98Da",
    "0x83577Fb91c16C76333865061f97AF57d0E0E7505",
    "0x537fC71385e01619a23e5C60Cf9A729A11dDCaBD",
    "0x8E83a933390BffD0618E0d0c3Ab2DAdab6683225",
    "0x4f3F60128e3d3BafccE3A5361091435d1f5b65FE",
    "0x78a5C38cB0194Ca4e7cf5742248a92b7e15Efc1C",
    "0x58E1FCB15a8Eb467C4424C2a021B44D721d2FF7E",
    "0xB37a8eaf636F98D53051459FdFd9210B45cC7B12",
    // official Attestcoin / Creditcoin addresses
    "0x0000000000000000000000000000000000000FD2",
    "0x0000000000000000000000000000000000000fd3",
    "0x0000000000000000000000000000000000000fD3",
    "0x731c345d79Fb8BbDC541f9DF3b6317585F849F9f",
  ].map((v) => v.toLowerCase()),
);

/** Hosts the docs deliberately mention as broken, or that are not web pages. */
const EXPECTED_UNREACHABLE = [
  // Documented as dead on purpose, so a future reader does not reintroduce it.
  { pattern: /explorer\.cc3-testnet\.creditcoin\.network/, why: "documented as dead — that IS the point" },
  // Only ever cited as "do not use this"; it is a JSON-RPC endpoint, not a page.
  { pattern: /rpc\.sepolia\.org/, why: "cited only as the endpoint NOT to use" },
  // Local dev instruction, not a claim about anything.
  { pattern: /localhost/, why: "local dev instruction" },
];

const REQUIRED_FILES = [
  { path: "README.md", why: "repo front page (submission requirement)" },
  { path: "ATTESTCOIN_INTEGRATION.md", why: "Attestcoin integration summary (submission requirement)" },
  { path: "LICENSE", why: "licence" },
  { path: "rohan-plan.md", why: "whitepaper source" },
  { path: "contracts/src/creditcoin/AttestationGate.sol", why: "the integration itself" },
  { path: "worker/src/proof.ts", why: "the readability worker" },
  { path: "evidence/precompile.json", why: "live precompile evidence" },
  { path: "evidence/proof-path-probe.json", why: "end-to-end proof-path evidence" },
  { path: "evidence/latency.jsonl", why: "measured attestation latency" },
];

let failures = 0;
const warn = (m: string) => console.log(`  ~ ${m}`);
const pass = (m: string) => console.log(`  ✓ ${m}`);
const fail = (m: string) => {
  failures++;
  console.log(`  ✗ ${m}`);
};

// ─────────────────────── 1. links ───────────────────────

console.log("\n1. Every documented URL resolves\n");

const urls = new Map<string, string[]>();
for (const doc of DOCS) {
  const p = resolve(ROOT, doc);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, "utf8");
  for (const m of text.matchAll(/https?:\/\/[^\s)\]|`>"']+/g)) {
    const u = m[0].replace(/[.,;:]+$/, "");
    if (/SAMPLE/i.test(u)) continue;
    if (!urls.has(u)) urls.set(u, []);
    urls.get(u)!.push(doc);
  }
}

for (const [url, inDocs] of [...urls].sort()) {
  const expected = EXPECTED_UNREACHABLE.find((e) => e.pattern.test(url));
  let status: number | string;
  try {
    const res = await fetch(url, {
      method: "HEAD",
      signal: AbortSignal.timeout(15_000),
      headers: { "user-agent": "Mozilla/5.0" },
    });
    status = res.status;
  } catch (e) {
    status = `ERR ${(e as Error).name}`;
  }

  const reachable = typeof status === "number" && [200, 301, 302, 403, 405].includes(status);

  if (reachable) {
    pass(`${String(status).padStart(3)} ${url}`);
  } else if (expected) {
    warn(`${String(status).padStart(3)} ${url}  (${expected.why})`);
  } else {
    fail(`${String(status).padStart(3)} ${url}  — cited in ${inDocs.join(", ")}`);
  }
}

// ─────────────────────── 2. no fabricated evidence ───────────────────────

console.log("\n2. No fabricated hashes, addresses or links\n");

let hexFindings = 0;
for (const doc of DOCS) {
  const p = resolve(ROOT, doc);
  if (!existsSync(p)) continue;
  const text = readFileSync(p, "utf8");

  for (const m of text.matchAll(/0x[0-9a-fA-F]{8,}/g)) {
    const hex = m[0];
    const lower = hex.toLowerCase();
    if (REAL_VALUES.has(lower)) continue;

    // A visible SAMPLE label anywhere nearby is an explicit "this is not real".
    const context = text.slice(Math.max(0, m.index! - 60), m.index! + hex.length + 60);
    if (/SAMPLE/i.test(context)) continue;

    // Truncated display forms of real values (`0x144bc395f407…`) are fine.
    if ([...REAL_VALUES].some((r) => r.startsWith(lower))) continue;

    hexFindings++;
    fail(`${doc}: ${hex} is neither verified-real nor labelled SAMPLE`);
  }
}
if (hexFindings === 0) {
  pass("every 0x literal is verified-real, a visible SAMPLE, or a truncation of a real value");
}

// ─────────────────────── 3. deliverables ───────────────────────

console.log("\n3. Required deliverables present\n");

for (const f of REQUIRED_FILES) {
  if (existsSync(resolve(ROOT, f.path))) pass(`${f.path.padEnd(46)} ${f.why}`);
  else fail(`${f.path.padEnd(46)} MISSING — ${f.why}`);
}

// Things only a human can supply. Reported, never failed.
console.log("\n   Still needs a human (see PREREQUISITES.md §7):");
for (const item of [
  "project logo (PNG/SVG)",
  "whitepaper/deck as a hosted PDF URL",
  "demo video URL",
  "per-member: name, email, bio, role, country of residence, country of citizenship",
  "public GitHub repo URL",
  "confirm the prior-work rule with the organisers (UI scaffolding is prior work)",
]) {
  console.log(`     - ${item}`);
}

// ─────────────────────── verdict ───────────────────────

console.log(`\n${"═".repeat(72)}`);
console.log(failures === 0 ? "SUBMISSION CHECKS PASSED" : `${failures} CHECK(S) FAILED`);
console.log(`${"═".repeat(72)}\n`);
process.exit(failures === 0 ? 0 : 1);
