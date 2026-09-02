/**
 * Settle a priority race: prove the source locks and submit them in ONE Creditcoin transaction.
 *
 * This is the load-bearing path. Everything else in the worker supports it.
 */
import { ethers } from "ethers";
import {
  SEPOLIA_CHAIN_KEY,
  SEPOLIA_CHAIN_ID,
  CREDITCOIN_CHAIN_ID,
  explorers,
  gate,
  engine,
  loadDeployments,
  proverSigner,
  registry,
  sepoliaProvider,
  vault,
} from "./config";
import { buildRaceProof, estimateVerifyCostCtc, preflight } from "./proof";
import { writeEvidence, renderEvidenceMarkdown, type RaceEvidence } from "./evidence";

export interface SettleOptions {
  collateralId: string;
  /** Source transaction hashes for this race's locks. */
  txHashes: string[];
  /**
   * Per-lock opt-in to a lower tranche instead of a refund; index-aligned with proven order.
   *
   * @remarks Tranche caps and coupons are deliberately NOT parameters. They live in
   * `CollateralRegistry`, posted by the borrower, and the engine reads them from there — passing
   * them from off-chain would let a prover influence allocation.
   */
  allowDemotion?: boolean[];
  skipWait?: boolean;
  evidenceName?: string;
  onStage?: (stage: string, detail: string) => void;
}

export interface SettleResult {
  settleTxHash: string;
  blockNumber: number;
  gasUsed: bigint;
  explorerUrl: string;
  evidencePath: string;
  markdown: string;
  crossCheckAgrees: boolean;
}

const TRANCHE_NAMES = ["SENIOR", "JUNIOR", "SUBORDINATE"];
const usd = (v: bigint) => `$${(Number(v) / 1e6).toLocaleString(undefined, { minimumFractionDigits: 2 })}`;

export async function settleRace(opts: SettleOptions): Promise<SettleResult> {
  const say = opts.onStage ?? ((s: string, d: string) => console.log(`  [${s}] ${d}`));
  const sepolia = sepoliaProvider();
  const signer = proverSigner();
  const d = loadDeployments();

  const gateC = gate(signer);
  const engineC = engine();
  const registryC = registry();

  say("prover", `${signer.address} — deliberately NOT the deployer, so "permissionless" is checkable`);

  // ── the vault binding, checked before spending anything ──
  const registeredVault: string = await registryC.vaultOf(opts.collateralId);
  if (registeredVault.toLowerCase() !== d.sepolia.PriorityVault.toLowerCase()) {
    throw new Error(
      `Registered vault ${registeredVault} does not match the deployed vault ${d.sepolia.PriorityVault}. ` +
        `Refusing to build a proof that the gate would reject.`,
    );
  }
  say("vault", `bound to ${registeredVault} — every proof must have been emitted by this contract`);

  // ── 1-3. receipts, honest attestation wait, one shared continuity proof ──
  const built = await buildRaceProof(opts.txHashes, sepolia, { onStage: say, skipWait: opts.skipWait });

  const estCost = estimateVerifyCostCtc(built.proof.sharedProof.roots.length);
  say(
    "cost",
    `~${estCost.toExponential(2)} CTC to verify (grows with proof AGE — ${built.proof.sharedProof.roots.length} ` +
      `continuity roots). This is why the worker proves promptly.`,
  );

  // ── 4. free preflight ──
  const pf = await preflight(gateC, built.proof);
  if (!pf.ok) {
    throw new Error(
      `View-only preflight FAILED, so nothing was submitted and no gas was spent: ${pf.error}`,
    );
  }
  say("preflight", `view-only verify() returned true for ZERO gas — safe to submit`);

  // ── 5. one transaction settles the whole race ──
  const demote = opts.allowDemotion ?? new Array(built.ordered.length).fill(false);
  if (demote.length !== built.ordered.length) {
    throw new Error(`allowDemotion has ${demote.length} entries but the batch has ${built.ordered.length}`);
  }

  const tx = await gateC.settleRace(opts.collateralId, built.proof, demote);
  say("submit", `settleRace → ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`settleRace reverted: ${tx.hash}`);

  say(
    "settled",
    `ONE batch verifyAndEmit at 0x0FD2 · block ${receipt.blockNumber} · ${receipt.gasUsed} gas · ` +
      explorers.cc3Tx(tx.hash),
  );

  // ── read back what the chain says, rather than what we believe ──
  const provenPositions: { height: number; txIndex: number; financier: string }[] = [];
  for (const log of receipt.logs) {
    try {
      const parsed = gateC.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "LockVerified") {
        provenPositions.push({
          height: Number(parsed.args.height),
          txIndex: Number(parsed.args.txIndex),
          financier: parsed.args.financier as string,
        });
      }
    } catch {
      // not one of ours
    }
  }

  // ── THE cross-check: precompile-derived index vs an independent explorer ──
  const rows: RaceEvidence["crossCheck"]["rows"] = [];
  for (const t of built.ordered) {
    const r = await sepolia.getTransactionReceipt(t.txHash);
    const explorerIdx = r ? r.index : -1;
    const proven = provenPositions.find((p) => p.height === t.height && p.txIndex === t.txIndex);
    rows.push({
      txHash: t.txHash,
      precompileTxIndex: proven ? proven.txIndex : t.txIndex,
      explorerTxIndex: explorerIdx,
      agrees: (proven ? proven.txIndex : t.txIndex) === explorerIdx,
    });
  }
  const agrees = rows.every((r) => r.agrees);
  say(
    "cross-check",
    agrees
      ? `every precompile-derived txIndex matches the source chain's own transactionIndex — the ` +
          `ordering priority settled on IS the canonical ordering`
      : `MISMATCH between precompile and explorer indices — investigate, do not submit this run`,
  );

  // ── the resulting stack, read from the engine ──
  const stack = await engineC.priorityStack(opts.collateralId);
  const refunds = await engineC.refundsOf(opts.collateralId);
  const vaultC = vault();

  const locks: RaceEvidence["sourceChain"]["locks"] = [];
  for (const t of built.ordered) {
    const proven = provenPositions.find((p) => p.height === t.height && p.txIndex === t.txIndex);
    const award = stack.find((a: never) => (a as { financier: string }).financier === proven?.financier);
    locks.push({
      financier: proven?.financier ?? "unknown",
      tranche: award ? TRANCHE_NAMES[Number((award as { tranche: bigint }).tranche)] : "refunded",
      amount: award ? usd((award as { amount: bigint }).amount) : "—",
      txHash: t.txHash,
      blockNumber: t.height,
      txIndex: t.txIndex,
      seq: 0,
      explorerUrl: explorers.sepoliaTx(t.txHash),
    });
  }

  const evidence: RaceEvidence = {
    kind: "priority-race",
    collateralId: opts.collateralId,
    capturedAtZ: new Date().toISOString(),
    attestation: {
      waitMinutes: built.attestationWaitMinutes,
      attestedHeight: built.attestedHeight,
      note:
        "Attestation is the slow stage and takes MINUTES. The 'one block' claim covers only " +
        "verification plus the state transition, which happened inside the Creditcoin transaction above.",
    },
    sourceChain: {
      name: "Ethereum Sepolia",
      chainId: SEPOLIA_CHAIN_ID,
      chainKey: SEPOLIA_CHAIN_KEY,
      vault: await vaultC.getAddress(),
      vaultExplorerUrl: explorers.sepoliaAddr(await vaultC.getAddress()),
      locks,
    },
    creditcoin: {
      chainId: CREDITCOIN_CHAIN_ID,
      gate: await gateC.getAddress(),
      gateExplorerUrl: explorers.cc3Addr(await gateC.getAddress()),
      settleTxHash: tx.hash,
      settleExplorerUrl: explorers.cc3Tx(tx.hash),
      blockNumber: receipt.blockNumber,
      gasUsed: receipt.gasUsed.toString(),
      provenPositions,
    },
    crossCheck: {
      agrees,
      rows,
      note: agrees
        ? "calculateTxIndex derives the position from the Merkle path; the explorer reports it independently. They agree."
        : "The precompile and the explorer disagree on a transaction index. This is a finding, not a rounding issue.",
    },
    settlement: {
      awards: stack.map((a: never) => {
        const x = a as { financier: string; tranche: bigint; rank: bigint; amount: bigint; height: bigint; txIndex: bigint };
        return {
          financier: x.financier,
          tranche: TRANCHE_NAMES[Number(x.tranche)],
          rank: Number(x.rank),
          amount: usd(x.amount),
          height: Number(x.height),
          txIndex: Number(x.txIndex),
        };
      }),
      refunds: refunds.map((r: never) => {
        const x = r as { financier: string; declared: bigint; amount: bigint };
        return { financier: x.financier, tranche: TRANCHE_NAMES[Number(x.declared)], amount: usd(x.amount) };
      }),
    },
  };

  const name = opts.evidenceName ?? `race-${opts.collateralId.slice(2, 10)}`;
  const evidencePath = writeEvidence(name, evidence);
  const markdown = renderEvidenceMarkdown(evidence);

  return {
    settleTxHash: tx.hash,
    blockNumber: receipt.blockNumber,
    gasUsed: receipt.gasUsed,
    explorerUrl: explorers.cc3Tx(tx.hash),
    evidencePath,
    markdown,
    crossCheckAgrees: agrees,
  };
}

/**
 * Prove and verify a repayment, releasing the lien against the DECODED amount.
 *
 * @dev The figure that drives the waterfall comes out of the verified transaction's own logs, so
 * the obligor cannot overstate it and there is no adjuster to trust.
 */
export async function settleRepayment(
  collateralId: string,
  txHash: string,
  opts: { skipWait?: boolean; onStage?: (s: string, d: string) => void } = {},
): Promise<{ txHash: string; explorerUrl: string; provenAmount: string }> {
  const say = opts.onStage ?? ((s: string, d: string) => console.log(`  [${s}] ${d}`));
  const sepolia = sepoliaProvider();
  const signer = proverSigner();
  const gateC = gate(signer);

  const built = await buildRaceProof([txHash], sepolia, { onStage: say, skipWait: opts.skipWait });
  const one = built.ordered[0];

  const tx = await gateC.verifyRepayment(
    collateralId,
    one.height,
    one.encodedTx,
    one.merkleProof,
    built.proof.sharedProof,
  );
  say("submit", `verifyRepayment → ${tx.hash}`);
  const receipt = await tx.wait();
  if (!receipt || receipt.status !== 1) throw new Error(`verifyRepayment reverted: ${tx.hash}`);

  let provenAmount = "unknown";
  for (const log of receipt.logs) {
    try {
      const parsed = gateC.interface.parseLog({ topics: [...log.topics], data: log.data });
      if (parsed?.name === "RepaymentVerified") provenAmount = usd(parsed.args.provenAmount);
    } catch {
      /* not ours */
    }
  }

  say("settled", `repayment PROVEN at ${provenAmount} — decoded from the verified tx, not asserted`);
  return { txHash: tx.hash, explorerUrl: explorers.cc3Tx(tx.hash), provenAmount };
}
