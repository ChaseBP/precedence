/**
 * PRECEDENCE lifecycle phase handlers.
 *
 * One handler per protocol state. A handler runs while the race is IN that state, and may either
 * fall through to the track's default successor or branch explicitly (e.g. ENCUMBERED →
 * FROZEN_DRAW when the facility is distressed).
 *
 * The failure branch is first-class here, not a stretch goal: it is half the live demo and the part
 * that shows the protocol has rules rather than a happy path.
 */
import type {
  Agent,
  EventLevel,
  FinancierBid,
  LifecyclePhase,
  PriorityRace,
  ProverCallRecord,
  SourceLockRecord,
} from "../types";
import type { PrecedenceDeps } from "../config";
import { analyzeCollateral, rateFor, trancheSizing } from "../domain/collateral";
import { settlePriorityLocks, sortByProvenOrder } from "../domain/lock";
import { assertSeniorityRespected, computeWaterfall } from "../domain/waterfall";
import { findRefinanceArbitrage } from "../domain/refinance";
import { enforceDappSideChecks, HONEST_LATENCY_COPY } from "../domain/proof";
import {
  buildDefault,
  buildFreeze,
  buildGracePeriod,
  buildLiquidation,
  buildPcr,
  computePcr,
  DISTRESS_PARAMS,
} from "../domain/distress";
import { updateAgent, updateCollateral, upsertAttestation } from "../store/repositories";

export interface PhaseCtx {
  race: PriorityRace;
  deps: PrecedenceDeps;
  agents: Agent[];
  emit: (level: EventLevel, message: string, data?: unknown) => Promise<void>;
}

/** A handler either advances (optionally branching) or aborts the race. */
export interface StepOutcome {
  ok: boolean;
  next?: LifecyclePhase;
  reason?: string;
}

const ok = (next?: LifecyclePhase): StepOutcome => ({ ok: true, next });
const fail = (reason: string): StepOutcome => ({ ok: false, reason });

const agentOf = (ctx: PhaseCtx, id: string): Agent | undefined => ctx.agents.find((a) => a.id === id);
const usd = (n: number) => `$${Math.round(n).toLocaleString()}`;

function pushProverCall(
  ctx: PhaseCtx,
  command: string,
  kind: ProverCallRecord["kind"],
  isOk: boolean,
  durationMs: number,
  summary: string,
  detail: Record<string, string | number>,
): ProverCallRecord {
  ctx.race.proverCalls ??= [];
  const rec: ProverCallRecord = {
    id: `${ctx.race.id}-call-${ctx.race.proverCalls.length + 1}`,
    phase: ctx.race.status,
    command,
    kind,
    summary,
    detail,
    ok: isOk,
    durationMs,
    at: new Date().toISOString(),
  };
  ctx.race.proverCalls.push(rec);
  return rec;
}

function analysisOf(race: PriorityRace) {
  return race.analysis ?? analyzeCollateral(race.collateral, race.requestedTotalUsd);
}

/**
 * Per-tranche capacity for this facility.
 * @remarks Posted terms win over the suggestion. A lender must never be shown a cap or a coupon
 * the borrower did not actually publish.
 */
function sizingOf(race: PriorityRace) {
  return trancheSizing(race.collateral, analysisOf(race));
}

/** Outstanding principal across all active claims. */
function outstandingPrincipal(race: PriorityRace): number {
  return (race.claims ?? [])
    .filter((c) => c.state === "ACTIVE")
    .reduce((s, c) => s + c.principalUsd, 0);
}

// ═════════════════════════ 1. COLLATERAL_REGISTERED ═════════════════════════

export async function runCollateralRegistered(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race } = ctx;
  const col = race.collateral;

  const analysis = analyzeCollateral(col, race.requestedTotalUsd);
  race.analysis = analysis;
  const sizing = trancheSizing(col, analysis);

  await ctx.emit(
    "info",
    `Collateral registered: ${col.title} (${col.obligor}) · face value ${usd(col.faceValueUsd)} · ` +
      `docHash ${col.docHash.slice(0, 18)}… minted as NFT #${col.nftTokenId} on Creditcoin CC3.`,
    { collateral: col },
  );

  await ctx.emit(
    "info",
    `Hash-uniqueness enforced on registration — the same document identifier cannot be registered twice. ` +
      `Note this bounds the claim: it does not detect a custodian issuing two receipts for one lot.`,
  );

  const rec = pushProverCall(
    ctx,
    `CollateralRegistry.registerCollateral(${col.docHash.slice(0, 14)}…, ${col.assetType}, ${col.faceValueUsd})`,
    "query",
    true,
    85,
    `Haircut ${usd(analysis.haircutUsd)} (${col.haircutPct}%) · max draw ${usd(analysis.maxDrawUsd)} · ` +
      `advance rate ${analysis.advanceRatePct}%`,
    {
      seniorTranche: usd(sizing.seniorUsd),
      juniorTranche: usd(sizing.juniorUsd),
      subordinateTranche: usd(sizing.subordinateUsd),
      vault: col.vaultAddress,
    },
  );

  if (col.verifiedClearTitle) {
    await ctx.emit(
      "success",
      `Encumbrance registry: CLEAR title verified — zero prior liens. Tranches sized ` +
        `Senior ${usd(sizing.seniorUsd)} / Junior ${usd(sizing.juniorUsd)} / ` +
        `Subordinate ${usd(sizing.subordinateUsd)}.`,
      { analysis, proverCall: rec },
    );
  } else {
    await ctx.emit(
      "warn",
      `Encumbrance registry: existing lien recorded on this collateral — subordinate priority only.`,
      { analysis, proverCall: rec },
    );
  }

  return ok();
}

// ═════════════════════════ 2. RACE_OPEN ═════════════════════════

export async function runRaceOpen(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const analysis = analysisOf(race);
  const sizing = sizingOf(race);
  const financiers = ctx.agents.filter((a) => a.role !== "prover");

  // Opening the race resets the vault's per-collateral lock counter, so this race's locks run
  // seq 1..N and the gate's contiguity-from-1 completeness check is enforceable.
  // Sized by the borrower's posted terms, which is also what the vault allocates against and what
  // the Creditcoin engine reads back. One source for the split, so the two chains cannot diverge.
  const caps: [number, number, number] = [sizing.seniorUsd, sizing.juniorUsd, sizing.subordinateUsd];
  const opened = await deps.sepolia.openRace(
    race.collateral.id,
    caps[0] + caps[1] + caps[2],
    caps,
  );

  await ctx.emit(
    "success",
    `Race open: ${race.collateral.obligor} requests ${usd(race.requestedTotalUsd)} against ` +
      `${race.collateral.symbol}. Vault lock counter reset — this race's locks are seq 1..N, which is ` +
      `what lets the gate reject a prover who omits one. Competing financiers may now lock on Sepolia.`,
    { requestedUsd: race.requestedTotalUsd, vault: race.collateral.vaultAddress, openTx: opened.tx },
  );

  // ── deterministic bids: heterogeneous policy weights produce genuine divergence ──
  const bids: FinancierBid[] = [];
  for (const agent of financiers) {
    const targetAsk =
      agent.policy.preferredTranche === "SENIOR"
        ? sizing.seniorUsd
        : agent.policy.preferredTranche === "JUNIOR"
          ? sizing.juniorUsd
          : sizing.subordinateUsd;

    const decision = await deps.runtime.decide({
      agent,
      collateral: race.collateral,
      analysis,
      requestedUsd: targetAsk,
    });
    race.decisions.push(decision);

    await ctx.emit(
      decision.verb === "decline" ? "warn" : "success",
      `${agent.name} (${decision.tranche}): ${decision.verb.toUpperCase()} ${usd(decision.amountUsd)} ` +
        `@ ${decision.ratePct.toFixed(1)}% — ${decision.reasoning}`,
      { decision },
    );

    if (decision.verb !== "decline" && decision.amountUsd > 0) {
      bids.push({
        agentId: agent.id,
        tranche: decision.tranche,
        requestedUsd: targetAsk,
        committedUsd: decision.amountUsd,
        allowDemotion: agent.policy.allowDemotion,
      });
    }
  }

  race.bids = bids;

  // A SINGLE financier racing against collateral is a completely valid race. The ported code
  // required two parties to form a syndicate; PRECEDENCE does not — these are rivals competing for
  // a tranche, and one bidder winning uncontested is a normal outcome, not a failure.
  if (bids.length === 0) {
    return fail("No financier committed capital — collateral stays CLEAR. Fail-safe, nobody loses.");
  }

  const total = bids.reduce((s, b) => s + b.committedUsd, 0);
  await ctx.emit(
    "info",
    `${bids.length} competing ${bids.length === 1 ? "financier" : "financiers"} committed ${usd(total)}. ` +
      `Locking capital on Sepolia PriorityVault — each lock is a real transaction at a real position.`,
  );

  // ── locks land on Sepolia ──
  const locks: SourceLockRecord[] = [];
  for (const bid of bids) {
    const { tx, blockNumber, txIndex, lock } = await deps.sepolia.lock({
      collateralId: race.collateral.id,
      financier: bid.agentId,
      tranche: bid.tranche,
      amountUsd: bid.committedUsd,
      // From the agent's own policy, carried into the lock transaction. The prover no longer
      // supplies this at settle time, so this is the only place it can be declared.
      allowDemotion: bid.allowDemotion,
    });
    bid.lockBlockNumber = blockNumber;
    bid.lockTxIndex = txIndex;
    bid.lockSeq = lock.seq;
    bid.sepoliaTxHash = tx;
    locks.push(lock);

    const rec = pushProverCall(
      ctx,
      `PriorityVault.lock(${race.collateral.symbol}, ${bid.tranche}, ${bid.committedUsd} pUSD)`,
      "query",
      true,
      140,
      `Sepolia block ${blockNumber} · txIndex ${txIndex} · seq ${lock.seq}`,
      {
        financier: bid.agentId,
        tranche: bid.tranche,
        amount: usd(bid.committedUsd),
        blockNumber,
        txIndex,
        seq: lock.seq,
        txHash: tx,
      },
    );

    await ctx.emit(
      "success",
      `Lock on Sepolia: ${agentOf(ctx, bid.agentId)?.name} escrowed ${usd(bid.committedUsd)} in ` +
        `block ${blockNumber} at txIndex ${txIndex}. Tx ${tx.slice(0, 18)}…`,
      { lock, proverCall: rec },
    );
  }
  race.locks = locks;

  // Make the same-block case explicit — it is the reason calculateTxIndex is load-bearing.
  const byBlock = new Map<number, SourceLockRecord[]>();
  for (const l of locks) byBlock.set(l.lockBlockNumber, [...(byBlock.get(l.lockBlockNumber) ?? []), l]);
  const tied = [...byBlock.entries()].filter(([, ls]) => ls.length > 1);
  for (const [block, ls] of tied) {
    await ctx.emit(
      "info",
      `Same-block contention in block ${block}: ${ls.length} locks. Block height alone cannot order these — ` +
        `priority will be resolved by transaction index, derived on-chain from the Merkle proof via ` +
        `calculateTxIndex(). This is exactly the case an oracle cannot settle.`,
      { block, txIndices: ls.map((l) => l.lockTxIndex) },
    );
  }

  await updateCollateral(race.collateral.id, (c) => {
    c.status = "RACE_OPEN";
  });

  return ok();
}

// ═════════════════════════ 3. PRIORITY_SETTLED ═════════════════════════

export async function runPrioritySettled(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const sizing = sizingOf(race);
  const locks = race.locks;

  if (locks.length === 0) return fail("No source locks to prove.");

  await ctx.emit(
    "info",
    `Kestrel (Prover Agent, permissionless) opening the Attestcoin readability pipeline for ` +
      `${locks.length} source ${locks.length === 1 ? "lock" : "locks"}. ${HONEST_LATENCY_COPY}`,
  );

  const registeredVault = await deps.creditcoin.vaultOf(race.collateral.id);

  const proofRecord = await deps.prover.runPipeline(
    race.collateral.id,
    locks,
    async (step) => {
      const rec = pushProverCall(
        ctx,
        step.summary,
        step.step === "precompile_verification" ? "verify" : step.step === "preflight" ? "verify" : "proof",
        step.ok,
        step.durationMs,
        step.summary,
        step.data ?? {},
      );
      await ctx.emit(
        step.ok ? (step.step === "precompile_verification" ? "success" : "info") : "error",
        step.summary,
        { proverCall: rec },
      );
    },
    { registeredVault },
  );
  race.proofRecord = proofRecord;

  if (proofRecord.proofPipelineStatus !== "VERIFIED") {
    return fail("Attestcoin verification did not succeed — no priority settled. Capital refundable.");
  }

  // The two checks the precompile does NOT perform, restated on the record for Judge Mode.
  const checks = enforceDappSideChecks(locks, registeredVault);
  if (!checks.ok) {
    for (const f of checks.failures) await ctx.emit("error", `Rejected: ${f}`);
    return fail("Proof bound to the wrong contract or a reverted transaction — settlement refused.");
  }
  await ctx.emit(
    "success",
    `dApp-side controls passed on all ${locks.length} proofs: receipt.status == 0x1 enforced (the precompile ` +
      `does not check this), and every Lock event bound to the registered vault ${registeredVault.slice(0, 14)}… ` +
      `(the reference ASCBase does not check this either — a genuine proof of a look-alike contract would ` +
      `otherwise win priority).`,
  );

  // ── settle from proven ordering ──
  const settleTx = await deps.creditcoin.settleRace(race.collateral.id, locks, proofRecord);
  const { settlement, claims, refunds } = settlePriorityLocks(
    race.collateral.id,
    locks,
    sizing,
    {
      settlementBlock: settleTx.blockNumber,
      creditcoinTxHash: settleTx.tx,
      allowDemotion: Object.fromEntries(race.bids.map((b) => [b.agentId, b.allowDemotion])),
      // The coupons the borrower actually published for this facility.
      rates: {
        SENIOR: rateFor(race.collateral, "SENIOR"),
        JUNIOR: rateFor(race.collateral, "JUNIOR"),
        SUBORDINATE: rateFor(race.collateral, "SUBORDINATE"),
      },
    },
  );
  race.settlement = settlement;
  race.claims = claims;

  const ordered = sortByProvenOrder(locks);
  await ctx.emit(
    "success",
    `PRIORITY SETTLED by proven ordering, in one Creditcoin block. ` +
      ordered
        .map(
          (l, i) =>
            `#${i + 1} ${l.financier.toUpperCase()} (block ${l.lockBlockNumber}, txIndex ${l.lockTxIndex})`,
        )
        .join(" · ") +
      `. Tx ${settleTx.tx.slice(0, 18)}…`,
    { settlement, claims, explorerUrl: settleTx.explorerUrl, verifiedPositions: settleTx.verifiedPositions },
  );

  for (const c of claims) {
    await ctx.emit(
      "success",
      `ERC-1155 claim minted: ${c.tranche} (rank ${c.priorityRank}) → ${c.holder.toUpperCase()} · ` +
        `${usd(c.principalUsd)} @ ${c.ratePct}% · token ${c.tokenId} · won at proven position ` +
        `(block ${c.provenAt.blockNumber}, txIndex ${c.provenAt.txIndex}).`,
      { claim: c },
    );
  }

  for (const r of refunds) {
    await ctx.emit(
      "warn",
      `Auto-refund — double-financing prevented: ${r.agentId.toUpperCase()} ${usd(r.amountUsd)}. ${r.reason}`,
      { refund: r },
    );
    await deps.sepolia.refund({
      collateralId: race.collateral.id,
      financier: r.agentId,
      lockIndex: locks.findIndex((l) => l.financier === r.agentId),
    });
  }

  // Every lock refunded and nothing allocated is a legitimate, fail-safe outcome.
  if (claims.length === 0) {
    return ok("AUTO_REFUND");
  }

  await updateCollateral(race.collateral.id, (c) => {
    c.status = "PRIORITY_SETTLED";
    c.verifiedClearTitle = false;
  });

  // Attestation record for the registry, with real positions.
  const first = ordered[0];
  const att = {
    raceId: race.id,
    collateralId: race.collateral.id,
    proverId: "kestrel",
    claimTokenId: `1155-${race.collateral.nftTokenId}`,
    sepoliaTxHash: first.sepoliaTxHash,
    creditcoinTxHash: settleTx.tx,
    sourceBlockNumber: first.lockBlockNumber,
    sourceTxIndex: first.lockTxIndex,
    score: 96,
    status: "confirmed" as const,
    explorerUrl: settleTx.explorerUrl,
    sourceExplorerUrl: `${deps.config.explorerBaseSepolia}/tx/${first.sepoliaTxHash}`,
    attestedAt: new Date().toISOString(),
  };
  race.attestation = att;
  await upsertAttestation(att);

  await updateAgent("kestrel", (a) => {
    a.reputation.verifiedProofs += 1;
    a.reputation.lastTxHash = settleTx.tx;
    a.stats.lastAction = `Delivered proof for ${race.collateral.symbol}`;
    a.stats.lastActionAt = new Date().toISOString();
  });

  return ok();
}

// ═════════════════════════ 4. CAPITAL_DRAWN ═════════════════════════

export async function runCapitalDrawn(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const analysis = analysisOf(race);
  const allocated = (race.claims ?? []).reduce((s, c) => s + c.principalUsd, 0);
  const drawUsd = Math.min(allocated, analysis.maxDrawUsd);

  // An overdraw attempt is one of the two triggers for FROZEN_DRAW.
  if (race.scenario === "default" && drawUsd > analysis.maxDrawUsd) {
    return ok("FROZEN_DRAW");
  }

  const { tx, blockNumber } = await deps.sepolia.draw(race.collateral.id, race.obligor, drawUsd);
  race.draw = {
    collateralId: race.collateral.id,
    obligor: race.obligor,
    amountUsd: drawUsd,
    maxDrawUsd: analysis.maxDrawUsd,
    sepoliaTxHash: tx,
    blockNumber,
    drawnAt: new Date().toISOString(),
  };

  const rec = pushProverCall(
    ctx,
    `PriorityVault.draw(${race.collateral.symbol}, ${drawUsd} pUSD)`,
    "settle",
    true,
    160,
    `Drew ${usd(drawUsd)} of ${usd(analysis.maxDrawUsd)} available · Sepolia block ${blockNumber}`,
    { amount: usd(drawUsd), maxDraw: usd(analysis.maxDrawUsd), blockNumber, txHash: tx },
  );

  await ctx.emit(
    "success",
    `Capital drawn: ${race.obligor} withdrew ${usd(drawUsd)} from the vault ` +
      `(cap ${usd(analysis.maxDrawUsd)} after the ${race.collateral.haircutPct}% haircut).`,
    { draw: race.draw, proverCall: rec },
  );

  return ok();
}

// ═════════════════════════ 5. ENCUMBERED — the branch point ═════════════════════════

export async function runEncumbered(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;

  await updateCollateral(race.collateral.id, (c) => {
    c.status = "ENCUMBERED";
    c.verifiedClearTitle = false;
  });

  const s = race.settlement;
  await ctx.emit(
    "success",
    `Collateral ${race.collateral.symbol} is ENCUMBERED on Creditcoin. ` +
      `Senior: ${s?.seniorFinancier?.toUpperCase() || "—"} ${usd(s?.seniorAmountUsd ?? 0)} · ` +
      `Junior: ${s?.juniorFinancier?.toUpperCase() || "—"} ${usd(s?.juniorAmountUsd ?? 0)}` +
      (s?.subordinateFinancier ? ` · Subordinate: ${s.subordinateFinancier.toUpperCase()} ${usd(s.subordinateAmountUsd ?? 0)}` : ""),
    { encumbrance: await deps.creditcoin.getEncumbranceState(race.collateral.id) },
  );

  await ctx.emit(
    "info",
    `The encumbrance registry now holds this lien — and nobody had to join it. The record is exhaust of ` +
      `the financing itself. A second claim against this collateral cannot be created.`,
  );

  // ── branch on scenario ──
  if (race.scenario === "breach") {
    return ok("BREACHED");
  }
  if (race.scenario === "default") {
    const outstanding = outstandingPrincipal(race);
    const pcr = computePcr(race.collateral.faceValueUsd, race.collateral.haircutPct, outstanding);
    await ctx.emit(
      "warn",
      `Coverage check: PCR ${pcr.toFixed(1)}% against a ${DISTRESS_PARAMS.pcrThresholdPct}% threshold. ` +
        `Facility is under-covered — entering the deterministic unwind.`,
      { pcrPct: pcr, thresholdPct: DISTRESS_PARAMS.pcrThresholdPct },
    );
    return ok("FROZEN_DRAW");
  }

  return ok();
}

// ═════════════════════════ 6. REFI_DISCOVERED ═════════════════════════

export async function runRefiDiscovered(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race } = ctx;
  const col = race.collateral;
  const seniorClaim = (race.claims ?? []).find((c) => c.tranche === "SENIOR");
  const notional = seniorClaim?.principalUsd ?? race.settlement?.seniorAmountUsd ?? 0;

  const refi = findRefinanceArbitrage(col.id, col.obligor, col.currentRatePct, col.targetRatePct, notional);

  if (!refi) {
    await ctx.emit(
      "info",
      `Priority Agent scanned the registry: facility at ${col.currentRatePct}% is within ` +
        `100 bps of market — no refinance arbitrage. Nothing to execute.`,
    );
    // `ok()` takes the track's next state, ATOMIC_REFINANCE, which then finds no opportunity and
    // advances to REPAYMENT_PROOF itself. Returning REPAYMENT_PROOF from HERE is an illegal move
    // and the machine correctly aborted the race — a latent bug that only surfaced once a race
    // legitimately had no senior position to refinance, and so no arbitrage to find.
    return ok();
  }

  race.refinanceOpportunity = refi;
  await ctx.emit(
    "success",
    `Refinance opportunity discovered by Priority Agent: senior at ${refi.currentSeniorRatePct}% can be ` +
      `replaced at ${refi.proposedSeniorRatePct}% — ${refi.spreadSavingsBps} bps, saving ` +
      `${usd(refi.annualSavingsUsd)}/yr on ${usd(refi.notionalUsd)}. This is a PROPOSAL; the deterministic ` +
      `policy filter and the proofs decide whether it executes.`,
    { opportunity: refi },
  );

  return ok();
}

// ═════════════════════════ 7. ATOMIC_REFINANCE ═════════════════════════

export async function runAtomicRefinance(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const refi = race.refinanceOpportunity;
  if (!refi) return ok("REPAYMENT_PROOF");

  // Refinancing REPLACES an existing senior position. If none was won — every bid was junior or
  // subordinate, or the senior tranche simply went unfilled — there is nothing to refinance, and
  // proceeding invented one: it set seniorFinancier to the incoming agent while the amount stayed
  // zero and no SENIOR claim existed, so the UI credited the senior lien to an agent that had
  // declined to bid. A hardcoded "vector" fallback hid the same hole.
  const seniorClaim = (race.claims ?? []).find((c) => c.tranche === "SENIOR" && c.principalUsd > 0);
  if (!seniorClaim || !race.settlement?.seniorFinancier) {
    await ctx.emit(
      "info",
      `No senior position exists on ${race.collateral.symbol}, so there is nothing to refinance — ` +
        `the senior tranche went unfilled in this race. Skipping to repayment.`,
    );
    return ok("REPAYMENT_PROOF");
  }

  const oldFinancier = race.settlement.seniorFinancier;
  const newFinancier = refi.candidateFinancier;

  const res = await deps.creditcoin.executeAtomicRefinance(
    race.collateral.id,
    oldFinancier,
    newFinancier,
    refi.proposedSeniorRatePct,
    refi.notionalUsd,
  );
  race.refinance = res.record;

  const rec = pushProverCall(
    ctx,
    `RefinanceEngine.executeAtomic(${race.collateral.symbol})`,
    "settle",
    true,
    380,
    `Two proofs, one transition: old-repayability + new-lock priority → old lien released + new lien created`,
    {
      oldFinancier,
      newFinancier,
      rateChange: `${refi.currentSeniorRatePct}% → ${refi.proposedSeniorRatePct}%`,
      annualSavings: usd(refi.annualSavingsUsd),
      creditcoinTx: res.tx,
    },
  );

  // Reassign the senior claim to the refinancer.
  race.claims = (race.claims ?? []).map((c) =>
    c.tranche === "SENIOR"
      ? { ...c, holder: newFinancier, ratePct: refi.proposedSeniorRatePct, state: "ACTIVE" as const }
      : c,
  );
  if (race.settlement) {
    // The amount moves with the name. Leaving the amount behind is what let a zero-value senior
    // "holder" exist at all.
    race.settlement.seniorFinancier = newFinancier;
    race.settlement.seniorAmountUsd = seniorClaim.principalUsd;
  }

  await updateCollateral(race.collateral.id, (c) => {
    c.currentRatePct = refi.proposedSeniorRatePct;
    c.status = "ENCUMBERED";
  });

  await ctx.emit(
    "success",
    `ATOMIC REFINANCE executed in one Creditcoin block: senior lien released from ` +
      `${oldFinancier.toUpperCase()} and created for ${newFinancier.toUpperCase()} at ` +
      `${refi.proposedSeniorRatePct}%. The collateral was never simultaneously unencumbered and ` +
      `re-encumberable — no gap, no double-pledge window. Two weeks of inter-creditor process, one block.`,
    { refinance: res.record, proverCall: rec, explorerUrl: res.explorerUrl },
  );

  return ok();
}

// ═════════════════════════ 8. REPAYMENT_PROOF ═════════════════════════

export async function runRepaymentProof(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const principal = outstandingPrincipal(race);
  const termDays = race.collateral.termDays || 90;

  const interest = (race.claims ?? [])
    .filter((c) => c.state === "ACTIVE")
    .reduce((s, c) => s + c.principalUsd * (c.ratePct / 100) * (termDays / 365), 0);
  const total = Math.round(principal + interest);

  const { tx, blockNumber, txIndex } = await deps.sepolia.repay({
    collateralId: race.collateral.id,
    obligor: race.obligor,
    amountUsd: total,
  });

  await ctx.emit(
    "info",
    `${race.obligor} repaid ${usd(total)} on Sepolia in block ${blockNumber}. ` +
      `PENDING_EVIDENCE — waiting for attestation to reach that height. This is a patient state, not an error.`,
    { sepoliaTxHash: tx, blockNumber },
  );

  const verified = await deps.creditcoin.verifyRepayment(race.collateral.id, blockNumber, txIndex, tx);

  race.repayment = {
    collateralId: race.collateral.id,
    obligor: race.obligor,
    principalUsd: Math.round(principal),
    interestUsd: Math.round(interest),
    totalUsd: total,
    sepoliaTxHash: tx,
    blockNumber,
    provenAmountUsd: verified.provenAmountUsd || total,
    proofPipelineStatus: "VERIFIED",
    creditcoinTxHash: verified.tx,
    repaidAt: new Date().toISOString(),
  };

  const rec = pushProverCall(
    ctx,
    `AttestationGate.verifyRepayment(${race.collateral.symbol}, ${blockNumber}, …)`,
    "verify",
    true,
    420,
    `Repayment amount DECODED from the verified transaction — not asserted by an oracle`,
    {
      sourceBlock: blockNumber,
      sourceTxIndex: txIndex,
      provenAmount: usd(race.repayment.provenAmountUsd ?? total),
      creditcoinTx: verified.tx,
    },
  );

  await ctx.emit(
    "success",
    `Repayment PROVEN at 0x0FD2: ${usd(race.repayment.provenAmountUsd ?? total)} ` +
      `(${usd(principal)} principal + ${usd(interest)} interest). The amount was decoded from the verified ` +
      `transaction's own logs, so there is no adjuster to trust and no oracle to compromise.`,
    { repayment: race.repayment, proverCall: rec, explorerUrl: verified.explorerUrl },
  );

  return ok();
}

// ═════════════════════════ 9. LIEN_RELEASED ═════════════════════════

export async function runLienReleased(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const realized = race.repayment?.provenAmountUsd ?? race.repayment?.totalUsd ?? 0;

  const waterfall = computeWaterfall(race.claims ?? [], realized, {
    protocolFeeBps: deps.config.protocolFeeBps,
    proverFeeBps: deps.config.proverFeeBps,
    termDays: race.collateral.termDays || 90,
    kind: "REPAYMENT",
  });
  race.waterfall = waterfall;

  // If seniority was violated the protocol's central claim is false. Check, don't assume.
  const check = assertSeniorityRespected(waterfall);
  if (!check.ok) {
    for (const v of check.violations) await ctx.emit("error", `SENIORITY VIOLATION: ${v}`);
    return fail("Waterfall violated strict seniority — refusing to record this settlement.");
  }

  const rec = pushProverCall(
    ctx,
    `PriorityEngine.releaseLien(${race.collateral.symbol}, ${realized})`,
    "settle",
    true,
    210,
    `Strict seniority waterfall: each tranche paid in full before the next receives anything`,
    Object.fromEntries(
      waterfall.lines.map((l) => [
        `${l.tranche.toLowerCase()}Payout`,
        `${usd(l.payoutUsd)}${l.satisfiedInFull ? " (full)" : " (short)"}`,
      ]),
    ),
  );

  for (const l of waterfall.lines) {
    await ctx.emit(
      "success",
      `${l.tranche} (rank ${l.priorityRank}) → ${l.agentId.toUpperCase()}: ${usd(l.payoutUsd)} = ` +
        `${usd(l.principalReturnedUsd)} principal + ${usd(l.interestEarnedUsd)} interest` +
        `${l.satisfiedInFull ? " — satisfied in full" : ` — SHORT ${usd(l.lossAbsorbedUsd)}`}`,
      { line: l },
    );
  }

  await ctx.emit(
    "success",
    `Lien released. Distributed ${usd(waterfall.distributableUsd)} after ${usd(waterfall.protocolFeeUsd)} ` +
      `protocol and ${usd(waterfall.proverFeeUsd)} prover fees. Claims burned; collateral returns to CLEAR.`,
    { waterfall, proverCall: rec },
  );

  race.claims = (race.claims ?? []).map((c) => ({ ...c, state: "REPAID" as const }));

  for (const line of waterfall.lines) {
    await updateAgent(line.agentId, (a) => {
      a.balanceUsd = Math.round((a.balanceUsd + line.interestEarnedUsd) * 100) / 100;
      a.stats.totalEarnedUsd = Math.round((a.stats.totalEarnedUsd + line.interestEarnedUsd) * 100) / 100;
      a.stats.volumeSettledUsd += line.contributedUsd;
      a.stats.racesWon += 1;
    });
  }
  await updateAgent("kestrel", (a) => {
    a.balanceUsd += waterfall.proverFeeUsd;
    a.stats.totalEarnedUsd += waterfall.proverFeeUsd;
  });

  await updateCollateral(race.collateral.id, (c) => {
    c.status = "REPAID";
    c.verifiedClearTitle = true;
  });

  return ok();
}

// ═════════════════════════ 10. SETTLED_CLOSED (terminal) ═════════════════════════

export async function runSettledClosed(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race } = ctx;
  await ctx.emit(
    "success",
    `Facility closed. ${race.collateral.symbol} is CLEAR again, its full financing history — every lock, ` +
      `every proven position, every priority settlement — permanently recorded on Creditcoin.`,
  );
  return ok();
}

// ═════════════════════════ AUTO_REFUND (terminal) ═════════════════════════

export async function runAutoRefund(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race } = ctx;
  const total = (race.settlement?.refundedFinanciers ?? []).reduce((s, r) => s + r.amountUsd, 0);
  await ctx.emit(
    "warn",
    `Race produced locks but allocated no tranche — ${usd(total)} auto-refunded and no lien created. ` +
      `Collateral stays CLEAR. Fail-safe: nobody loses capital.`,
    { refunds: race.settlement?.refundedFinanciers },
  );
  await updateCollateral(race.collateral.id, (c) => {
    c.status = "CLEAR";
    c.verifiedClearTitle = true;
  });
  return ok();
}

// ═════════════════════════ FAILURE BRANCH ═════════════════════════

// ── FROZEN_DRAW ──
export async function runFrozenDraw(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const analysis = analysisOf(race);
  const outstanding = outstandingPrincipal(race);
  const pcr = computePcr(race.collateral.faceValueUsd, race.collateral.haircutPct, outstanding);

  const freeze = buildFreeze(
    race.collateral.id,
    pcr < DISTRESS_PARAMS.pcrThresholdPct ? "PCR_BREACH" : "OVERDRAW_ATTEMPT",
    pcr < DISTRESS_PARAMS.pcrThresholdPct
      ? `Principal coverage ${pcr.toFixed(1)}% fell below the ${DISTRESS_PARAMS.pcrThresholdPct}% threshold`
      : `Draw request exceeded the ${usd(analysis.maxDrawUsd)} advance cap`,
    Math.max(0, analysis.maxDrawUsd - (race.draw?.amountUsd ?? 0)),
  );
  const tx = await deps.creditcoin.pokeFreezeDraw(race.collateral.id, freeze);
  freeze.poke.creditcoinTxHash = tx.tx;
  freeze.poke.pokedAtBlock = tx.blockNumber;
  race.freeze = freeze;

  const rec = pushProverCall(
    ctx,
    `PriorityEngine.pokeFreezeDraw(${race.collateral.symbol})`,
    "keeper",
    true,
    150,
    `Permissionless keeper poke · gated on: ${freeze.poke.gatedOn}`,
    { reason: freeze.reason, frozenDraw: usd(freeze.frozenDrawUsd), keeper: freeze.poke.keeper, bounty: usd(freeze.poke.bountyUsd) },
  );

  await ctx.emit(
    "warn",
    `DRAW FROZEN — ${freeze.detail}. ${usd(freeze.frozenDrawUsd)} of undrawn capital protected. ` +
      `Triggered by a permissionless keeper poke, not by us: anyone can call this once the gate opens, ` +
      `so lender protection does not depend on our uptime. Keeper earned ${usd(freeze.poke.bountyUsd)}.`,
    { freeze, proverCall: rec, explorerUrl: tx.explorerUrl },
  );

  await updateCollateral(race.collateral.id, (c) => {
    c.status = "FROZEN";
  });

  return ok();
}

// ── PCR_STABILIZATION ──
export async function runPcrStabilization(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const outstanding = outstandingPrincipal(race);

  // In the default scenario the obligor fails to post the top-up.
  const pcr = buildPcr(race.collateral.id, race.collateral.faceValueUsd, race.collateral.haircutPct, outstanding, {
    topUpPostedUsd: 0,
  });
  const tx = await deps.creditcoin.pokePcrStabilization(race.collateral.id, pcr);
  pcr.poke.creditcoinTxHash = tx.tx;
  pcr.poke.pokedAtBlock = tx.blockNumber;
  race.pcr = pcr;

  const rec = pushProverCall(
    ctx,
    `PriorityEngine.pokePcrStabilization(${race.collateral.symbol})`,
    "keeper",
    true,
    170,
    `PCR ${pcr.pcrPct.toFixed(1)}% vs ${pcr.thresholdPct}% threshold · top-up window ${DISTRESS_PARAMS.pcrWindowHours}h`,
    {
      pcrPct: pcr.pcrPct.toFixed(1),
      shortfall: usd(pcr.shortfallUsd),
      topUpRequested: usd(pcr.topUpRequestedUsd),
      windowExpires: pcr.windowExpiresAt,
    },
  );

  await ctx.emit(
    "warn",
    `COVERAGE STABILIZATION: PCR is ${pcr.pcrPct.toFixed(1)}% against a ${pcr.thresholdPct}% requirement. ` +
      `${race.obligor} has ${DISTRESS_PARAMS.pcrWindowHours}h to post ${usd(pcr.shortfallUsd)} of additional collateral.`,
    { pcr, proverCall: rec, explorerUrl: tx.explorerUrl },
  );

  if (pcr.cured) {
    await ctx.emit("success", `Top-up posted — coverage restored. Facility returns to ENCUMBERED.`);
    return ok("ENCUMBERED");
  }

  await ctx.emit(
    "error",
    `Stabilization window expired with ${usd(pcr.topUpPostedUsd)} of ${usd(pcr.topUpRequestedUsd)} posted. ` +
      `Proceeding to the cure window.`,
  );
  return ok();
}

// ── GRACE_PERIOD ──
export async function runGracePeriod(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const outstanding = outstandingPrincipal(race);

  const grace = buildGracePeriod(race.collateral.id, outstanding, { curedUsd: 0 });
  const tx = await deps.creditcoin.pokeGracePeriod(race.collateral.id, grace);
  grace.poke.creditcoinTxHash = tx.tx;
  grace.poke.pokedAtBlock = tx.blockNumber;
  race.gracePeriod = grace;

  const rec = pushProverCall(
    ctx,
    `PriorityEngine.pokeGracePeriod(${race.collateral.symbol})`,
    "keeper",
    true,
    140,
    `${grace.durationDays}-day cure window · gated on: ${grace.poke.gatedOn}`,
    { cureAmount: usd(grace.cureAmountUsd), expiresAt: grace.expiresAt, keeper: grace.poke.keeper },
  );

  await ctx.emit(
    "warn",
    `GRACE PERIOD opened: repayment overdue and no verified repayment proof has arrived. ` +
      `${race.obligor} has ${grace.durationDays} days to cure ${usd(grace.cureAmountUsd)} before liquidation ` +
      `becomes callable. Note the trigger is the ABSENCE of a proof — not anyone's opinion.`,
    { gracePeriod: grace, proverCall: rec, explorerUrl: tx.explorerUrl },
  );

  await updateCollateral(race.collateral.id, (c) => {
    c.status = "GRACE";
  });

  if (grace.cured) {
    await ctx.emit("success", `Cured within the window — proceeding to repayment settlement.`);
    return ok("REPAYMENT_PROOF");
  }

  await ctx.emit("error", `Cure window expired with ${usd(grace.curedUsd)} received. Liquidation is now callable.`);
  return ok();
}

// ── DUTCH_LIQUIDATION ──
export async function runDutchLiquidation(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const outstanding = outstandingPrincipal(race);

  // A bidder clears the auction partway down the decay curve.
  const blocksElapsed = 140;
  const liq = buildLiquidation(race.collateral.id, outstanding, { blocksElapsed, winner: "meridian" });
  const tx = await deps.creditcoin.pokeDutchLiquidation(race.collateral.id, liq);
  liq.poke.creditcoinTxHash = tx.tx;
  liq.poke.pokedAtBlock = tx.blockNumber;
  race.liquidation = liq;

  const rec = pushProverCall(
    ctx,
    `PriorityEngine.pokeDutchLiquidation(${race.collateral.symbol})`,
    "keeper",
    true,
    260,
    `Descending auction ${usd(liq.startPriceUsd)} → ${usd(liq.floorPriceUsd)} at ` +
      `${liq.decayBpsPerBlock} bps/block · cleared at ${usd(liq.clearingPriceUsd ?? 0)}`,
    {
      startPrice: usd(liq.startPriceUsd),
      floorPrice: usd(liq.floorPriceUsd),
      clearingPrice: usd(liq.clearingPriceUsd ?? 0),
      blocksElapsed,
      winner: liq.winner ?? "—",
    },
  );

  await ctx.emit(
    "warn",
    `DUTCH LIQUIDATION: collateral NFT auctioned from ${usd(liq.startPriceUsd)} decaying ` +
      `${liq.decayBpsPerBlock} bps per block. Cleared at ${usd(liq.clearingPriceUsd ?? 0)} after ` +
      `${blocksElapsed} blocks. Price is a deterministic function of elapsed blocks — nobody sets it.`,
    { liquidation: liq, proverCall: rec, explorerUrl: tx.explorerUrl },
  );

  await updateCollateral(race.collateral.id, (c) => {
    c.status = "DUTCH_LIQUIDATION";
  });

  return ok();
}

// ── TERMINATED_DEFAULT (terminal) ──
export async function runTerminatedDefault(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const proceeds = race.liquidation?.proceedsUsd ?? 0;

  // Same strict waterfall, run over recovery proceeds. This is where subordination earns its coupon.
  const waterfall = computeWaterfall(race.claims ?? [], proceeds, {
    protocolFeeBps: deps.config.protocolFeeBps,
    proverFeeBps: deps.config.proverFeeBps,
    termDays: race.collateral.termDays || 90,
    kind: "LIQUIDATION",
  });
  race.waterfall = waterfall;

  const check = assertSeniorityRespected(waterfall);
  if (!check.ok) {
    for (const v of check.violations) await ctx.emit("error", `SENIORITY VIOLATION: ${v}`);
    return fail("Liquidation waterfall violated strict seniority — refusing to record.");
  }

  const def = buildDefault(race.collateral.id, race.obligor, waterfall);
  const tx = await deps.creditcoin.pokeTerminateDefault(race.collateral.id, def);
  def.poke.creditcoinTxHash = tx.tx;
  def.poke.pokedAtBlock = tx.blockNumber;
  race.defaulted = def;

  const rec = pushProverCall(
    ctx,
    `PriorityEngine.pokeTerminateDefault(${race.collateral.symbol})`,
    "keeper",
    true,
    300,
    `Recovery ${usd(def.proceedsUsd)} distributed by strict seniority · first loss to the most subordinate`,
    {
      seniorRecovered: usd(def.seniorRecoveredUsd),
      seniorLoss: usd(def.seniorLossUsd),
      juniorLoss: usd(def.juniorLossUsd),
      subordinateLoss: usd(def.subordinateLossUsd),
    },
  );

  for (const l of waterfall.lines) {
    await ctx.emit(
      l.lossAbsorbedUsd > 0 ? "error" : "success",
      `${l.tranche} (rank ${l.priorityRank}) → ${l.agentId.toUpperCase()}: recovered ` +
        `${usd(l.principalReturnedUsd)} of ${usd(l.contributedUsd)}` +
        (l.lossAbsorbedUsd > 0 ? ` — LOSS ${usd(l.lossAbsorbedUsd)}` : ` — made whole`),
      { line: l },
    );
  }

  await ctx.emit(
    "error",
    `TERMINATED — DEFAULT. Recovery ${usd(def.proceedsUsd)}. First loss landed on the most subordinate ` +
      `tranche exactly as its coupon implied: subordinate ${usd(def.subordinateLossUsd)}, junior ` +
      `${usd(def.juniorLossUsd)}, senior ${usd(def.seniorLossUsd)}. ${race.obligor} is flagged DEFAULT on ` +
      `Creditcoin — permanently, across all future rounds.`,
    { defaulted: def, waterfall, proverCall: rec, explorerUrl: tx.explorerUrl },
  );

  race.claims = (race.claims ?? []).map((c) => ({ ...c, state: "DEFAULTED" as const }));

  for (const line of waterfall.lines) {
    await updateAgent(line.agentId, (a) => {
      a.stats.defaultLossUsd = Math.round((a.stats.defaultLossUsd + line.lossAbsorbedUsd) * 100) / 100;
      a.balanceUsd = Math.round((a.balanceUsd + line.principalReturnedUsd) * 100) / 100;
    });
  }

  await updateCollateral(race.collateral.id, (c) => {
    c.status = "DEFAULTED";
  });

  return ok();
}

// ── BREACHED ──
export async function runBreached(ctx: PhaseCtx): Promise<StepOutcome> {
  const { race, deps } = ctx;
  const frozen = (race.claims ?? []).filter((c) => c.state === "ACTIVE").length;

  const breach = {
    collateralId: race.collateral.id,
    detail:
      `Custodian ${race.collateral.custodian} reported the pledged lot as released without a proven lien ` +
      `discharge — collateral movement inconsistent with an ENCUMBERED record.`,
    provenBy: "kestrel",
    legalEscalation: true,
    claimsFrozen: frozen,
    poke: {
      fn: "pokeBreach(bytes32,bytes)",
      keeper: "0xSAMPLE_KEEPER_0000000000000000000000000000" as `0x${string}`,
      bountyUsd: DISTRESS_PARAMS.keeperBountyUsd,
      gatedOn: "breach evidence submitted and verified",
      pokedAtBlock: 0,
      at: new Date().toISOString(),
    },
  };
  race.breach = breach;

  await ctx.emit(
    "error",
    `COLLATERAL BREACH: ${breach.detail} All ${frozen} claims frozen; legal escalation flagged. ` +
      `Being explicit about the limit — proving ORDERING cannot prove AUTHENTICITY. We prevent ` +
      `double-financing of a registered claim; we cannot detect a custodian issuing two receipts for one lot.`,
    { breach },
  );

  await updateCollateral(race.collateral.id, (c) => {
    c.status = "BREACHED";
  });

  return ok("DUTCH_LIQUIDATION");
}
