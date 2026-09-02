/**
 * End-to-end probe of the Attestcoin proof path against REAL, already-existing Sepolia
 * transactions — no deployment required.
 *
 * @dev This is the strongest evidence obtainable before deploying, because it exercises every
 * assumption the worker rests on against the live services rather than a mock:
 *
 *   1. `new ProofBuilder(chainKey, url)` is the right constructor
 *   2. `waitUntilHeightAttested` behaves as documented
 *   3. `getBatchProof(txHashes)` accepts HASHES and returns one shared continuity proof
 *   4. the real response's nested-map shape flattens correctly — the mock in the unit tests is my
 *      own guess at that shape, so agreeing with it proves nothing on its own
 *   5. `PrecompileBlockProver.verifyBatch` returns TRUE for the resulting proof, which means the
 *      proof our contract would receive actually verifies at `0x0FD2`
 *
 * Step 5 is the one that matters most: it verifies the real proof through the real precompile via
 * `eth_call`, so a green run here means the on-chain path will work when the gate is deployed.
 */
import { ethers } from "ethers";
import { blockProver, proofProvider } from "@gluwa/usc-sdk";
import { BLOCK_PROVER_PRECOMPILE, SEPOLIA_CHAIN_KEY, creditcoinProvider, explorers, sepoliaProvider } from "./config";
import { attestationStatus, builder, chainInfo, flattenBatchProof, estimateVerifyCostCtc } from "./proof";
import { writeEvidence } from "./evidence";

export interface ProbeResult {
  ok: boolean;
  txHashes: string[];
  heights: number[];
  txIndices: number[];
  continuityRoots: number;
  offChainVerified: boolean;
  indexCrossCheck: { txHash: string; proofTxIndex: number; receiptTxIndex: number; agrees: boolean }[];
  precompileTxIndexAgrees: boolean;
  estCostCtc: string;
  evidencePath: string;
}

export async function probeProof(txHashes: string[]): Promise<ProbeResult> {
  const sepolia = sepoliaProvider();
  const cc3 = creditcoinProvider();

  console.log(`\nProbing the Attestcoin proof path with ${txHashes.length} real Sepolia transaction(s)\n`);

  // ── 1. receipts, and the status check the precompile does not do ──
  const receipts = await Promise.all(txHashes.map((h) => sepolia.getTransactionReceipt(h)));
  receipts.forEach((r, i) => {
    if (!r) throw new Error(`${txHashes[i]} not found on Sepolia`);
    if (r.status !== 1) throw new Error(`${txHashes[i]} reverted — the dApp must reject it, so we do`);
  });
  const heights = receipts.map((r) => r!.blockNumber);
  const maxHeight = Math.max(...heights);
  console.log(`  [receipts]    all status 1 · blocks ${Math.min(...heights)}–${maxHeight}`);
  receipts.forEach((r, i) =>
    console.log(`                ${txHashes[i].slice(0, 14)}… block ${r!.blockNumber} txIndex ${r!.index}`),
  );

  // ── 2. attestation ──
  const att = await attestationStatus(sepolia);
  console.log(
    `\n  [attestation] latest attested ${att.latestAttestedHeight} · ` +
      `${att.lagBlocks} blocks / ${att.lagMinutes} min behind head`,
  );
  if (att.latestAttestedHeight < maxHeight) {
    console.log(`                height ${maxHeight} NOT yet attested — waiting (this takes minutes)`);
    await chainInfo().waitUntilHeightAttested(SEPOLIA_CHAIN_KEY, maxHeight);
    console.log(`                attested`);
  } else {
    console.log(`                height ${maxHeight} already attested — no wait needed`);
  }

  // ── 3. one shared continuity proof, from real transaction HASHES ──
  const result = await builder().getBatchProof(txHashes);
  if (!result.success || !result.data) {
    throw new Error(`getBatchProof failed: ${result.error ?? "unknown"}`);
  }
  const data = result.data;
  console.log(
    `\n  [proof]       getBatchProof OK · chainKey ${data.chainKey} · headers ${data.fromHeader}–${data.toHeader}` +
      ` · cached ${data.cached}`,
  );
  console.log(
    `                continuity: lowerEndpointDigest ${data.continuityProof.lowerEndpointDigest.slice(0, 18)}… ` +
      `+ ${data.continuityProof.roots.length} roots (ONE proof for the whole batch)`,
  );

  // ── 4. does the REAL response flatten the way the unit tests assume? ──
  const { proof, ordered } = flattenBatchProof(data as never);
  console.log(
    `\n  [flatten]     ${ordered.length} proofs in proven order: ` +
      ordered.map((t) => `${t.height}:${t.txIndex}`).join(" → "),
  );
  if (proof.heights.length !== proof.encodedTxs.length || proof.heights.length !== proof.merkleProofs.length) {
    throw new Error("flattened arrays are not index-aligned — the gate would verify the wrong pairing");
  }
  console.log(`                arrays index-aligned (${proof.heights.length} each)`);
  ordered.forEach((t) =>
    console.log(
      `                ${t.txHash.slice(0, 14)}… root ${t.merkleProof.root.slice(0, 14)}… ` +
        `${t.merkleProof.siblings.length} siblings · ${t.encodedTx.length / 2 - 1} bytes encoded`,
    ),
  );

  // The proof service reports a txIndex; the receipt reports one independently. They must agree, or
  // the ordering the protocol settles on is not the chain's ordering.
  const indexCrossCheck = ordered.map((t) => {
    const r = receipts.find((x) => x!.hash.toLowerCase() === t.txHash.toLowerCase());
    const receiptTxIndex = r ? r.index : -1;
    return {
      txHash: t.txHash,
      proofTxIndex: t.txIndex,
      receiptTxIndex,
      agrees: t.txIndex === receiptTxIndex,
    };
  });
  const allAgree = indexCrossCheck.every((c) => c.agrees);
  console.log(`\n  [cross-check] proof txIndex vs receipt transactionIndex:`);
  for (const c of indexCrossCheck) {
    console.log(
      `                ${c.txHash.slice(0, 14)}… proof ${c.proofTxIndex} · receipt ${c.receiptTxIndex} · ` +
        `${c.agrees ? "AGREE" : "MISMATCH"}`,
    );
  }

  // ── 5. does calculateTxIndex ON THE PRECOMPILE agree with the canonical chain? ──
  //
  // This is the definitive check. Steps above compared the proof SERVICE's reported index against
  // the receipt; that is useful but it is two off-chain sources agreeing. The protocol's priority
  // does not come from either — it comes from `calculateTxIndex(merkleProof)` executed at 0x0FD2.
  // So call the precompile with the REAL Merkle proofs and confirm it derives the true positions.
  const verifierAbi = [
    "function calculateTxIndex((bytes32 root, (bytes32 hash, bool isLeft)[] siblings) merkleProof) view returns (uint64)",
  ];
  const verifier = new ethers.Contract(BLOCK_PROVER_PRECOMPILE, verifierAbi, cc3);
  const precompileIndices: { txHash: string; derived: number; receiptTxIndex: number; agrees: boolean }[] = [];
  console.log(`\n  [txIndex]     calculateTxIndex at ${BLOCK_PROVER_PRECOMPILE} on the REAL Merkle proofs:`);
  for (const t of ordered) {
    const derived = Number(await verifier.calculateTxIndex(t.merkleProof));
    const r = receipts.find((x) => x!.hash.toLowerCase() === t.txHash.toLowerCase());
    const receiptTxIndex = r ? r.index : -1;
    const agrees = derived === receiptTxIndex;
    precompileIndices.push({ txHash: t.txHash, derived, receiptTxIndex, agrees });
    console.log(
      `                ${t.txHash.slice(0, 14)}… precompile ${derived} · chain ${receiptTxIndex} · ` +
        `${agrees ? "AGREE" : "MISMATCH"}`,
    );
  }
  const precompileAgrees = precompileIndices.every((c) => c.agrees);
  if (precompileAgrees) {
    console.log(
      `                the precompile derives the canonical position from the Merkle path alone —` +
        `\n                this is the ordering priority settles on, and it is a proven fact`,
    );
  }

  // ── 6. does the batch actually verify at the precompile? ──
  const prover = new blockProver.PrecompileBlockProver(cc3, BLOCK_PROVER_PRECOMPILE);
  let offChainVerified = false;
  try {
    offChainVerified = await prover.verifyBatch(
      SEPOLIA_CHAIN_KEY,
      proof.heights,
      proof.encodedTxs,
      proof.merkleProofs.map((m) => new proofProvider.merkle.TransactionMerkleProof(
        m.root,
        m.siblings.map((s) => new proofProvider.merkle.MerkleProofEntry(s.hash, s.isLeft)),
      )),
      proof.sharedProof,
    );
    console.log(
      `\n  [verify]      PrecompileBlockProver.verifyBatch at ${BLOCK_PROVER_PRECOMPILE} → ${offChainVerified}`,
    );
    if (offChainVerified) {
      console.log(`                the real proof VERIFIES at the real precompile — the on-chain path will work`);
    }
  } catch (e) {
    console.log(`\n  [verify]      verifyBatch threw: ${(e as Error).message.slice(0, 200)}`);
  }

  const estCostCtc = estimateVerifyCostCtc(data.continuityProof.roots.length).toExponential(2);
  console.log(`\n  [cost]        ~${estCostCtc} CTC to verify (grows with proof AGE)`);

  const evidence = {
    kind: "proof-path-probe",
    capturedAtZ: new Date().toISOString(),
    note:
      "End-to-end probe of the Attestcoin proof path against real, pre-existing Sepolia transactions. " +
      "Runs without any PRECEDENCE contract deployed, so it isolates the protocol integration from our own code.",
    chainKey: SEPOLIA_CHAIN_KEY,
    txHashes,
    sourceTransactions: receipts.map((r, i) => ({
      txHash: txHashes[i],
      blockNumber: r!.blockNumber,
      transactionIndex: r!.index,
      status: r!.status,
      explorerUrl: explorers.sepoliaTx(txHashes[i]),
    })),
    batchProof: {
      fromHeader: Number(data.fromHeader),
      toHeader: Number(data.toHeader),
      continuityRoots: data.continuityProof.roots.length,
      sharedContinuityProof: true,
      merkleProofCount: proof.merkleProofs.length,
    },
    provenOrder: ordered.map((t) => ({ txHash: t.txHash, height: t.height, txIndex: t.txIndex })),
    indexCrossCheck,
    indexCrossCheckAgrees: allAgree,
    /** THE claim: the precompile itself derives the canonical position from the Merkle path. */
    precompileCalculateTxIndex: precompileIndices,
    precompileTxIndexAgrees: precompileAgrees,
    offChainVerifiedAtPrecompile: offChainVerified,
    estimatedVerifyCostCtc: estCostCtc,
    allPassed: allAgree && precompileAgrees && offChainVerified,
  };
  const evidencePath = writeEvidence("proof-path-probe", evidence);

  const ok = allAgree && precompileAgrees && offChainVerified;
  console.log(`\n${"═".repeat(72)}`);
  console.log(ok ? "PROOF PATH VERIFIED END-TO-END" : "PROOF PATH INCOMPLETE — see above");
  console.log(`evidence → ${evidencePath}`);
  console.log(`${"═".repeat(72)}\n`);

  return {
    ok,
    txHashes,
    heights: proof.heights,
    txIndices: ordered.map((t) => t.txIndex),
    continuityRoots: data.continuityProof.roots.length,
    offChainVerified,
    indexCrossCheck,
    precompileTxIndexAgrees: precompileAgrees,
    estCostCtc,
    evidencePath,
  };
}
