/**
 * Protocol state-machine smoke test.
 *
 * Runs all three storylines end to end and asserts the invariants the protocol's claims rest on.
 * A green run here is what "the state machine works" means — not that it compiled.
 *
 *   bun run scripts/smoke.ts
 */
import { createRace } from "../lib/precedence/orchestrator/create";
import { runRace } from "../lib/precedence/orchestrator/engine";
import { getRace, getEventsSince, resetStore, listCollateral } from "../lib/precedence/store/repositories";
import { isTerminal, PHASE_LABELS } from "../lib/precedence/orchestrator/lifecycle";
import { assertSeniorityRespected } from "../lib/precedence/domain/waterfall";
import { ratifyExtraction } from "../lib/precedence/domain/ratify";
import { validateTerms } from "../lib/precedence/domain/collateral";
import { checkSeqContiguity, checkStrictOrdering, sortByProvenOrder } from "../lib/precedence/domain/lock";
import type { PriorityRace, RaceScenario } from "../lib/precedence/types";

let failures = 0;
function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    console.log(`  ✓ ${name}`);
  } else {
    failures++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function run(scenario: RaceScenario): Promise<PriorityRace | undefined> {
  await resetStore();
  const collateral = (await listCollateral())[0];
  // mode "step" so the race does not auto-start; then await the engine to completion. Polling for a
  // terminal STATUS is wrong here: the status flips to a terminal state one transition before that
  // state's own handler has run.
  const race = await createRace({ collateral, requestedTotalUsd: 8500, mode: "step", scenario });
  await runRace(race.id);
  return getRace(race.id);
}

// ══════════════════════════════════════════════════════════════════════
console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  SCENARIO 1 — performing: race → settle → draw → repay   ║");
console.log("╚══════════════════════════════════════════════════════════╝");

const perf = await run("performing");
if (!perf) {
  console.log("  ✗ race not found");
  failures++;
} else {
  const events = await getEventsSince(perf.id, 0);
  const phases = [...new Set(events.map((e) => e.phase))];
  console.log(`\n  final: ${perf.status} (${PHASE_LABELS[perf.status]})  ·  track: ${perf.track}`);
  console.log(`  states visited: ${phases.join(" → ")}\n`);

  check("reaches SETTLED_CLOSED", perf.status === "SETTLED_CLOSED", perf.aborted?.reason);
  check("stays on the PERFORMING track", perf.track === "PERFORMING");
  check("locks landed on Sepolia", perf.locks.length > 0);
  check("proof VERIFIED", perf.proofRecord?.proofPipelineStatus === "VERIFIED");
  check("proof preflighted off-chain before submitting", perf.proofRecord?.preflightVerified === true);
  check("one shared continuity proof for the batch", (perf.proofRecord?.continuityProof.roots.length ?? 0) > 0);
  check(
    "every lock carries a txIndex (the same-block tie-break)",
    perf.locks.every((l) => typeof l.lockTxIndex === "number"),
  );
  check("priority settled", !!perf.settlement);
  check("claims minted", (perf.claims?.length ?? 0) > 0);
  check("each claim records the proven position that won it", (perf.claims ?? []).every((c) => !!c.provenAt));
  check("capital drawn", !!perf.draw);
  check("draw respected the advance cap", (perf.draw?.amountUsd ?? 0) <= (perf.draw?.maxDrawUsd ?? 0));
  check("repayment proven", perf.repayment?.proofPipelineStatus === "VERIFIED");
  check("waterfall computed", !!perf.waterfall);

  // The invariant the whole value proposition rests on.
  if (perf.waterfall) {
    const sen = assertSeniorityRespected(perf.waterfall);
    check("STRICT SENIORITY respected", sen.ok, sen.violations.join("; "));
    check("waterfall is REPAYMENT kind", perf.waterfall.kind === "REPAYMENT");
    const senior = perf.waterfall.lines.find((l) => l.priorityRank === 1);
    check("senior satisfied in full", senior?.satisfiedInFull === true);
    console.log("\n  waterfall:");
    for (const l of perf.waterfall.lines) {
      console.log(
        `    ${l.tranche.padEnd(11)} rank ${l.priorityRank}  ${l.agentId.padEnd(9)} ` +
          `payout $${l.payoutUsd.toFixed(2).padStart(9)}  loss $${l.lossAbsorbedUsd.toFixed(2)}  ` +
          `${l.satisfiedInFull ? "FULL" : "SHORT"}`,
      );
    }
  }

  // Ordering + completeness, exactly as AttestationGate enforces them on-chain.
  const ordered = sortByProvenOrder(perf.locks);
  const seq = checkSeqContiguity(perf.locks);
  const ord = checkStrictOrdering(ordered);
  check("seq contiguous from 1 (no omitted lock)", seq.ok, seq.reason);
  check("(height, txIndex) strictly increasing", ord.ok, ord.reason);
  console.log("\n  proven order:");
  for (const [i, l] of ordered.entries()) {
    console.log(
      `    #${i + 1} ${l.financier.padEnd(9)} block ${l.lockBlockNumber}  txIndex ${String(l.lockTxIndex).padStart(3)}  seq ${l.seq}  ${l.tranche}`,
    );
  }

  const sameBlock = ordered.filter((l, i, a) => a.some((o, j) => j !== i && o.lockBlockNumber === l.lockBlockNumber));
  check("exercises the same-block tie-break", sameBlock.length >= 2, "no two locks shared a block");

  check("no fabricated explorer host", !JSON.stringify(perf).includes("explorer.cc3-testnet"));
}

// ══════════════════════════════════════════════════════════════════════
console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  SCENARIO 2 — default: the deterministic unwind          ║");
console.log("╚══════════════════════════════════════════════════════════╝");

const def = await run("default");
if (!def) {
  console.log("  ✗ race not found");
  failures++;
} else {
  const events = await getEventsSince(def.id, 0);
  const phases = [...new Set(events.map((e) => e.phase))];
  console.log(`\n  final: ${def.status} (${PHASE_LABELS[def.status]})  ·  track: ${def.track}`);
  console.log(`  states visited: ${phases.join(" → ")}\n`);

  check("reaches TERMINATED_DEFAULT", def.status === "TERMINATED_DEFAULT", def.aborted?.reason);
  check("switched to the DISTRESSED track", def.track === "DISTRESSED");
  check("FROZEN_DRAW occurred", !!def.freeze);
  check("PCR_STABILIZATION occurred", !!def.pcr);
  check("GRACE_PERIOD occurred", !!def.gracePeriod);
  check("DUTCH_LIQUIDATION occurred", !!def.liquidation);
  check("TERMINATED_DEFAULT recorded", !!def.defaulted);
  check("obligor flagged DEFAULT", def.defaulted?.obligorCreditFlag === "DEFAULT");

  // Permissionlessness is the point: every transition is a keeper poke anyone can make.
  const pokes = [def.freeze?.poke, def.pcr?.poke, def.gracePeriod?.poke, def.liquidation?.poke, def.defaulted?.poke];
  check("all five transitions are keeper pokes", pokes.every((p) => !!p?.fn));
  check("every poke names its timestamp gate", pokes.every((p) => !!p?.gatedOn));
  check("every poke pays a bounty", pokes.every((p) => (p?.bountyUsd ?? 0) > 0));
  console.log("\n  keeper pokes:");
  for (const p of pokes) if (p) console.log(`    ${p.fn.padEnd(34)} gated on: ${p.gatedOn}`);

  if (def.waterfall) {
    const sen = assertSeniorityRespected(def.waterfall);
    check("STRICT SENIORITY respected in liquidation", sen.ok, sen.violations.join("; "));
    check("waterfall is LIQUIDATION kind", def.waterfall.kind === "LIQUIDATION");

    // First loss must land bottom-up, or subordination was priced for nothing.
    const byRank = [...def.waterfall.lines].sort((a, b) => b.priorityRank - a.priorityRank);
    const mostJunior = byRank[0];
    const mostSenior = byRank[byRank.length - 1];
    check(
      "first loss lands on the most subordinate tranche",
      byRank.length < 2 || mostJunior.lossAbsorbedUsd >= mostSenior.lossAbsorbedUsd,
      `${mostJunior?.tranche} loss $${mostJunior?.lossAbsorbedUsd} vs ${mostSenior?.tranche} loss $${mostSenior?.lossAbsorbedUsd}`,
    );
    console.log("\n  loss allocation:");
    for (const l of def.waterfall.lines) {
      console.log(
        `    ${l.tranche.padEnd(11)} rank ${l.priorityRank}  ${l.agentId.padEnd(9)} ` +
          `recovered $${l.principalReturnedUsd.toFixed(2).padStart(9)} of $${l.contributedUsd.toFixed(2)}  ` +
          `loss $${l.lossAbsorbedUsd.toFixed(2)}`,
      );
    }
  }

  if (def.liquidation) {
    check(
      "auction cleared between floor and start price",
      (def.liquidation.clearingPriceUsd ?? 0) >= def.liquidation.floorPriceUsd &&
        (def.liquidation.clearingPriceUsd ?? 0) <= def.liquidation.startPriceUsd,
    );
  }
}

// ══════════════════════════════════════════════════════════════════════
console.log("\n╔══════════════════════════════════════════════════════════╗");
console.log("║  SCENARIO 3 — breach: proven movement → liquidation       ║");
console.log("╚══════════════════════════════════════════════════════════╝");

const br = await run("breach");
if (!br) {
  console.log("  ✗ race not found");
  failures++;
} else {
  const events = await getEventsSince(br.id, 0);
  const phases = [...new Set(events.map((e) => e.phase))];
  console.log(`\n  final: ${br.status} (${PHASE_LABELS[br.status]})  ·  track: ${br.track}`);
  console.log(`  states visited: ${phases.join(" → ")}\n`);

  check("BREACHED occurred", !!br.breach);
  check("claims frozen on breach", (br.breach?.claimsFrozen ?? 0) > 0);
  check("legal escalation flagged", br.breach?.legalEscalation === true);
  check("breach unwinds via liquidation", !!br.liquidation);
  check("reaches a terminal state", isTerminal(br.status), br.status);
  check(
    "copy does not overclaim authenticity",
    events.some((e) => e.message.includes("cannot prove AUTHENTICITY")),
    "the ordering-is-not-authenticity caveat was not surfaced",
  );
}

// ══════════════════════════════════════════════════════════════════════
// Document ratification — the LLM containment boundary
//
// Nothing a model reads may alter the registered record; it may only corroborate or flag. These
// checks exist because a flag that fires on CORRECT documents is as broken as one that misses a
// forgery: if everything flags, nobody reads flags. Exact string equality used to report a clean
// receipt as a discrepancy purely because it named the custodian's city.
// ══════════════════════════════════════════════════════════════════════
{
  console.log("\n── document ratification ──\n");
  const registered = (await listCollateral())[0];

  const base = {
    collateralId: registered.id,
    confidence: 0.95,
    source: "llm" as const,
    model: "test",
    ratified: false,
    ratificationNotes: [],
    extractedAt: new Date().toISOString(),
  };

  const clean = ratifyExtraction(
    {
      ...base,
      faceValueUsd: registered.faceValueUsd,
      obligor: registered.obligor,
      // The custodian's name WITH its location appended, exactly as a real receipt prints it.
      custodian: `${registered.custodian}, ${registered.custodianLocation}`,
    },
    registered,
  );
  check("a clean document ratifies", clean.extraction.ratified, JSON.stringify(clean.rejected));
  check(
    "the custodian's location does not read as a discrepancy",
    !clean.extraction.ratificationNotes.some((n) => n.includes("DISCREPANCY")),
    clean.extraction.ratificationNotes.join(" | "),
  );

  const inflated = ratifyExtraction(
    { ...base, faceValueUsd: registered.faceValueUsd * 4, obligor: registered.obligor },
    registered,
  );
  check("an inflated face value is flagged", !inflated.extraction.ratified);
  check(
    "an inflated face value is NEVER accepted",
    inflated.accepted.faceValueUsd === undefined,
    `accepted ${inflated.accepted.faceValueUsd}`,
  );

  const wrongCustodian = ratifyExtraction(
    {
      ...base,
      faceValueUsd: registered.faceValueUsd,
      obligor: registered.obligor,
      custodian: "Rotterdam Silo Terminals",
    },
    registered,
  );
  check("a genuinely different custodian is still flagged", !wrongCustodian.extraction.ratified);
  check(
    "a corroborated field is still accepted alongside a flagged one",
    wrongCustodian.accepted.faceValueUsd === registered.faceValueUsd,
  );
}

// ══════════════════════════════════════════════════════════════════════
// Facility terms — the two rules CollateralRegistry.postFacilityTerms enforces
//
// A borrower posts these and the settlement engine reads them back, so a facility the contract
// would reject must never be accepted anywhere upstream. These assert the off-chain validator
// agrees with the on-chain one; if they drift, a borrower fills in a form and then eats a revert.
// ══════════════════════════════════════════════════════════════════════
{
  console.log("\n── facility terms ──\n");
  const col = (await listCollateral()).find((c) => c.faceValueUsd === 10_000)!;
  const advance = Math.round(col.faceValueUsd * (1 - col.haircutPct / 100));
  const rates = { seniorRatePct: 5, juniorRatePct: 10, subordinateRatePct: 18 };

  check("caps summing exactly to the advance are valid", validateTerms(col,
    { seniorCapUsd: 5_100, juniorCapUsd: 2_550, subordinateCapUsd: 850, ...rates }).ok,
    `advance is ${advance}`);

  const over = validateTerms(col,
    { seniorCapUsd: advance, juniorCapUsd: 1, subordinateCapUsd: 0, ...rates });
  check("caps one dollar over the advance are rejected", !over.ok);
  check("the rejection names the haircut as the reason",
    over.problems.some((p) => p.includes("haircut")), over.problems.join(" | "));

  check("senior priced above junior is rejected", !validateTerms(col,
    { seniorCapUsd: 5_100, juniorCapUsd: 2_550, subordinateCapUsd: 850,
      seniorRatePct: 12, juniorRatePct: 10, subordinateRatePct: 18 }).ok);
  check("equal rates across tranches are allowed", validateTerms(col,
    { seniorCapUsd: 5_100, juniorCapUsd: 2_550, subordinateCapUsd: 850,
      seniorRatePct: 9, juniorRatePct: 9, subordinateRatePct: 9 }).ok);
  check("a zero-sized facility is rejected", !validateTerms(col,
    { seniorCapUsd: 0, juniorCapUsd: 0, subordinateCapUsd: 0, ...rates }).ok);
}

// ══════════════════════════════════════════════════════════════════════
console.log("\n" + "═".repeat(60));
if (failures === 0) {
  console.log("ALL CHECKS PASSED — three tracks, invariants held.");
} else {
  console.log(`${failures} CHECK${failures === 1 ? "" : "S"} FAILED`);
}
console.log("═".repeat(60) + "\n");
process.exit(failures === 0 ? 0 : 1);
