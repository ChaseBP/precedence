/**
 * Verify the Attestcoin precompiles against the RUNNING Creditcoin CC3 chain.
 *
 * This exists because the precompile cannot be tested any other way. `0x0FD2` is a Substrate
 * runtime precompile with no EVM bytecode, so a Foundry fork fetches empty code and executes the
 * call as if against a plain account — every assertion about its behaviour would then pass or fail
 * for reasons unrelated to Attestcoin. Direct RPC against the live chain is the only honest route.
 *
 * Results are written to `evidence/precompile.json` so the claims in the docs and the submission
 * cite a dated measurement rather than a doc page.
 *
 *   bun run ops/verify-precompile.ts
 */
import { ethers } from "ethers";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_PATH = resolve(import.meta.dir, "../.env.local");
const EVIDENCE_DIR = resolve(import.meta.dir, "../evidence");
const OUT = resolve(EVIDENCE_DIR, "precompile.json");

const BLOCK_PROVER = "0x0000000000000000000000000000000000000FD2";
const CHAIN_INFO = "0x0000000000000000000000000000000000000fd3";
const SEPOLIA_CHAIN_KEY = 1;

/** On-chain the ChainInfo precompile uses snake_case; the SDK wraps it in camelCase. */
const CHAIN_INFO_ABI = [
  "function get_supported_chains() view returns ((uint64 chainKey, uint64 chainId, bytes chainName, uint8 chainEncoding)[] chains)",
  "function get_latest_attestation_height_and_hash(uint64 chainKey) view returns ((uint64 height, bytes32 hash, bool isAttestation, bool exists) result)",
  "function get_latest_checkpoint_height_and_hash(uint64 chainKey) view returns ((uint64 height, bytes32 hash, bool isAttestation, bool exists) result)",
  "function get_attestation_genesis_height(uint64 chainKey) view returns (uint64)",
  "function is_height_attested(uint64 chainKey, uint64 targetHeight) view returns (bool)",
];

const BLOCK_PROVER_ABI = [
  "function calculateTxIndex((bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof) view returns (uint64)",
  "function verify(uint64 chainKey, uint64 height, bytes encodedTransaction, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof, (bytes32 lowerEndpointDigest, bytes32[] roots) continuityProof) view returns (bool)",
  "function verify(uint64 chainKey, uint64[] heights, bytes[] encodedTransactions, (bytes32 root, (bytes32 hash, bool isLeft)[] siblings)[] merkleProofs, (bytes32 lowerEndpointDigest, bytes32[] roots) sharedContinuityProof) view returns (bool)",
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

const env = parseEnv(readFileSync(ENV_PATH, "utf8"));
const cc3 = new ethers.JsonRpcProvider(env.CREDITCOIN_RPC);
const sepolia = new ethers.JsonRpcProvider(env.SEPOLIA_RPC);

const results: { check: string; ok: boolean; detail: string }[] = [];
function record(check: string, ok: boolean, detail: string) {
  results.push({ check, ok, detail });
  console.log(`  ${ok ? "✓" : "✗"} ${check}`);
  console.log(`      ${detail}`);
}

const emptyMerkle = { root: ethers.ZeroHash, siblings: [] as { hash: string; isLeft: boolean }[] };
const emptyCont = { lowerEndpointDigest: ethers.ZeroHash, roots: [] as string[] };

console.log("\nAttestcoin precompile verification — live Creditcoin CC3\n");

const net = await cc3.getNetwork();
const head = await cc3.getBlockNumber();
const blk = await cc3.getBlock(head);
record(
  "CC3 reachable",
  net.chainId === 102031n,
  `chainId ${net.chainId} · head ${head} · gasLimit ${blk?.gasLimit} · baseFee ${blk?.baseFeePerGas} wei`,
);

// ── ChainInfo 0x0FD3 ──
const info = new ethers.Contract(CHAIN_INFO, CHAIN_INFO_ABI, cc3);
const chains = await info.get_supported_chains();
const sepoliaEntry = chains.find((c: any) => Number(c.chainKey) === SEPOLIA_CHAIN_KEY);
record(
  "Sepolia is chainKey 1, read from 0x0FD3 itself",
  !!sepoliaEntry && Number(sepoliaEntry.chainId) === 11155111,
  chains
    .map((c: any) => `chainKey ${c.chainKey} = ${ethers.toUtf8String(c.chainName)} (chainId ${c.chainId})`)
    .join(" · "),
);

const genesis = await info.get_attestation_genesis_height(SEPOLIA_CHAIN_KEY);
const latestAtt = await info.get_latest_attestation_height_and_hash(SEPOLIA_CHAIN_KEY);
const latestCkpt = await info.get_latest_checkpoint_height_and_hash(SEPOLIA_CHAIN_KEY);
record(
  "attestation state is live",
  latestAtt.exists,
  `genesis ${genesis} · latest attestation ${latestAtt.height} · latest checkpoint ${latestCkpt.height}`,
);

// ── the honest two-stage latency ──
const sepHead = await sepolia.getBlockNumber();
const attBlock = await sepolia.getBlock(Number(latestAtt.height));
const lagBlocks = sepHead - Number(latestAtt.height);
const lagMinutes = attBlock ? (Date.now() / 1000 - attBlock.timestamp) / 60 : 0;
record(
  "attestation lags the source chain (proofs are NOT instant)",
  lagBlocks > 0,
  `Sepolia head ${sepHead} vs attested ${latestAtt.height} = ${lagBlocks} blocks / ${lagMinutes.toFixed(2)} min behind`,
);

const futureAttested = await info.is_height_attested(SEPOLIA_CHAIN_KEY, Number(latestAtt.height) + 10_000);
record(
  "a future height is not yet attested",
  futureAttested === false,
  `is_height_attested(1, ${Number(latestAtt.height) + 10_000}) = ${futureAttested} — this gap IS the wait`,
);

// ── BlockProver 0x0FD2 ──
const prover = new ethers.Contract(BLOCK_PROVER, BLOCK_PROVER_ABI, cc3);

// calculateTxIndex: the function the whole priority mechanism rests on.
const idxEmpty = await prover.calculateTxIndex(emptyMerkle);
record(
  "calculateTxIndex is live and callable",
  idxEmpty === 0n,
  `calculateTxIndex(empty path) = ${idxEmpty} — this is what orders two locks inside ONE Sepolia block`,
);

const path3 = {
  root: ethers.keccak256(ethers.toUtf8Bytes("root")),
  siblings: [
    { hash: ethers.keccak256(ethers.toUtf8Bytes("a")), isLeft: true },
    { hash: ethers.keccak256(ethers.toUtf8Bytes("b")), isLeft: false },
    { hash: ethers.keccak256(ethers.toUtf8Bytes("c")), isLeft: true },
  ],
};
const idxPath = await prover.calculateTxIndex(path3);
record(
  "calculateTxIndex derives a position from the proof path",
  idxPath !== idxEmpty,
  `a 3-step path derives index ${idxPath} — the position comes out of the proof, not from anyone's claim`,
);

/**
 * Probe whether an overload EXISTS on the deployed precompile.
 *
 * A semantic revert ("Continuity chain cannot be empty") proves the selector decoded and the
 * implementation executed. A missing function would fail differently — so a revert with a
 * *validation* message is positive evidence of existence.
 */
async function probeOverload(sig: string, args: unknown[], label: string) {
  try {
    const r = await (prover as any)[sig](...args);
    record(label, true, `returned ${r} without reverting`);
  } catch (e: any) {
    const msg: string = e.shortMessage || e.message || String(e);
    const semantic = /cannot be empty|invalid|continuity|transaction data|proof/i.test(msg);
    record(
      label,
      semantic,
      semantic
        ? `reverted with a VALIDATION error, which means the selector decoded and ran: "${msg.slice(0, 90)}"`
        : `unexpected failure: ${msg.slice(0, 140)}`,
    );
  }
}

await probeOverload(
  "verify(uint64,uint64,bytes,(bytes32,(bytes32,bool)[]),(bytes32,bytes32[]))",
  [SEPOLIA_CHAIN_KEY, Number(latestAtt.height), "0x", emptyMerkle, emptyCont],
  "single verify() exists on the deployed precompile",
);

await probeOverload(
  "verify(uint64,uint64[],bytes[],(bytes32,(bytes32,bool)[])[],(bytes32,bytes32[]))",
  [SEPOLIA_CHAIN_KEY, [Number(latestAtt.height)], ["0x"], [emptyMerkle], emptyCont],
  "BATCH verify() exists on the deployed precompile",
);

// ── PUSH0 / EVM version, which decides whether our bytecode deploys at all ──
async function estimatable(data: string): Promise<boolean> {
  try {
    await cc3.estimateGas({ from: new ethers.Wallet(env.FUNDER_PK).address, data });
    return true;
  } catch {
    return false;
  }
}
const push0 = await estimatable("0x5f5ff3"); // PUSH0 PUSH0 RETURN
record(
  "CC3 supports PUSH0 (Shanghai+), so default-profile bytecode deploys",
  push0,
  push0
    ? "eth_estimateGas on PUSH0 init code succeeded — no need to downgrade evm_version for deployment"
    : "PUSH0 rejected — set evm_version to paris before deploying",
);

// ── write the evidence ──
if (!existsSync(EVIDENCE_DIR)) mkdirSync(EVIDENCE_DIR, { recursive: true });
const evidence = {
  measuredAtZ: new Date().toISOString(),
  creditcoin: {
    rpc: env.CREDITCOIN_RPC,
    chainId: Number(net.chainId),
    head,
    gasLimit: blk?.gasLimit?.toString(),
    baseFeePerGasWei: blk?.baseFeePerGas?.toString(),
    blockProverPrecompile: BLOCK_PROVER,
    chainInfoPrecompile: CHAIN_INFO,
    supportsPush0: push0,
  },
  sepolia: {
    chainKey: SEPOLIA_CHAIN_KEY,
    chainId: 11155111,
    head: sepHead,
    attestationGenesisHeight: Number(genesis),
    latestAttestedHeight: Number(latestAtt.height),
    latestCheckpointHeight: Number(latestCkpt.height),
    lagBlocks,
    lagMinutes: Math.round(lagMinutes * 100) / 100,
  },
  calculateTxIndex: {
    emptyPath: idxEmpty.toString(),
    threeStepPath: idxPath.toString(),
    note: "Derives the intra-block transaction position from the Merkle path. Without it, two locks in one Sepolia block cannot be ordered and the protocol has no mechanism.",
  },
  checks: results,
  allPassed: results.every((r) => r.ok),
  note: "Verified by direct RPC. A Foundry fork CANNOT test these: 0x0FD2 is a Substrate runtime precompile with no EVM bytecode, so a fork executes the call against an empty account.",
};
writeFileSync(OUT, JSON.stringify(evidence, null, 2));

const failed = results.filter((r) => !r.ok);
console.log(`\n${"═".repeat(70)}`);
console.log(failed.length === 0 ? "ALL CHECKS PASSED" : `${failed.length} CHECK(S) FAILED`);
console.log(`evidence → ${OUT}`);
console.log(`${"═".repeat(70)}\n`);
process.exit(failed.length === 0 ? 0 : 1);
