import {
  AttestationReader,
  SEPOLIA_CHAIN_KEY,
} from "@/lib/precedence/adapters/creditcoin/attestation-reader";
import { getSepoliaReader } from "@/lib/precedence/adapters/sepolia/sepolia-reader";
import { getRace } from "@/lib/precedence/store/repositories";
import { applyProvenSettlement } from "@/lib/precedence/orchestrator/live-race";
import { getProverJob, proverAvailable } from "@/lib/precedence/orchestrator/prover-job";

/**
 * GET /api/races/live/status?id=… — what a live settlement is waiting for, right now.
 *
 * @remarks Built because "is this stuck?" had no answer on screen. A live settlement sat on
 * PENDING_EVIDENCE with a measured 6.5–9.3 minute range beside it and nothing that changed, so
 * there was no way to tell a settlement progressing normally from one that had nothing left to
 * progress it. Those look identical and need completely different actions.
 *
 * Both reads happen here rather than in the browser, for two reasons. A viewer with no wallet
 * connected can still watch — the page is a public record, not a control panel. And it collapses
 * three round trips (vault storage, the attestation frontier, the Sepolia head) into one poll with
 * a single answer, so the UI cannot render a half-updated state where the frontier has moved but
 * the vault has not.
 *
 * `stage` is derived from those reads and never from our stored phase. The store is a cache of
 * what we believe; the vault and the precompile are what a proof will actually attest to.
 */

export type SettlementStage =
  /** Bids are still being taken. */
  | "WINDOW_OPEN"
  /** The deadline has passed but nobody has sent `closeRace`. This one surprises people. */
  | "AWAITING_CLOSE"
  /** Closed, and Attestcoin has not yet reached the source block. */
  | "AWAITING_ATTESTATION"
  /** Closed and attested. Everything needed for the proof exists; the worker has not run. */
  | "PROOF_READY"
  /** Verified at 0x0FD2. */
  | "PROVEN";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return Response.json({ ok: false, error: "id is required" }, { status: 400 });

  let race = await getRace(id);
  if (!race) return Response.json({ ok: false, error: "no such settlement" }, { status: 404 });

  // A prover that finished since the last poll writes its result here, on the request the page was
  // already making. The alternative — the job reaching into the store from its own callback — puts
  // a write on a path with no request to attribute it to and no way to report a failure.
  const job = getProverJob(id);
  if (job?.state === "done" && job.evidencePath && !race.settlement) {
    try {
      race = (await applyProvenSettlement(id, job.evidencePath)) ?? race;
    } catch (e) {
      // The proof is on Creditcoin regardless; only our record of it failed. Say so rather than
      // failing the poll, which would blank the panel over a bookkeeping problem.
      job.error = `settled on chain, but this app could not record it: ${(e as Error).message}`;
    }
  }

  if (!race.onchain) {
    return Response.json(
      { ok: false, error: "this is a scripted walkthrough — it has no on-chain state to report" },
      { status: 409 },
    );
  }

  // A proven settlement is finished, and asking the chains about it again cannot change any of
  // these numbers. The client stops polling once it sees PROVEN, but this is the backstop that
  // makes an older tab, a reload, or anything else hitting the endpoint cost nothing: without it,
  // a settled race answered five RPC reads per request forever.
  //
  // Served from the stored record, which for a proven race is what the proof itself wrote — so
  // this answers even where no vault is deployed, before the reader is asked for.
  if (race.settlement) {
    const heights = race.locks.map((l) => l.lockBlockNumber);
    const target = heights.length ? Math.max(...heights) : race.onchain.openBlockNumber;
    return Response.json({
      ok: true,
      id: race.id,
      stage: "PROVEN" satisfies SettlementStage,
      vault: {
        raceOpen: false,
        raceNonce: race.onchain.raceNonce,
        lockCount: race.locks.length,
        totalLockedUsd: race.locks.reduce((s, l) => s + (l.refunded ? 0 : l.amountUsd), 0),
        facilitySizeUsd: race.onchain.facilitySizeUsd,
        raceDeadline: race.onchain.raceDeadline,
        secondsLeft: 0,
        obligor: race.onchain.obligor,
        closableByAnyone: false,
      },
      attestation: {
        chainKey: Number(SEPOLIA_CHAIN_KEY),
        // The frontier has moved on since; what is true and fixed is that the target was attested.
        attestedHeight: target,
        checkpointHeight: target,
        sepoliaHead: target,
        lagBlocks: 0,
        targetHeight: target,
        targetAttested: true,
        blocksToGo: 0,
      },
      proverCommand: `cd worker && bun run src/cli.ts prove ${race.onchain.collateralId} --from-vault`,
      prover: proverState(id),
    });
  }

  const got = getSepoliaReader();
  if (!got.reader) return Response.json({ ok: false, error: got.why }, { status: 502 });
  const reader = got.reader;
  const attest = new AttestationReader();

  // The block that has to be attested is the HIGHEST one any lock landed in — a race legitimately
  // spans blocks, and the proof cannot be built until the last of them is inside the frontier.
  // Using the first lock's block would have reported "ready" while the deciding lock was not.
  const targetHeight = race.locks.length
    ? Math.max(...race.locks.map((l) => l.lockBlockNumber))
    : race.onchain.openBlockNumber;

  let vault, frontier, targetAttested, sepoliaHead;
  try {
    [vault, frontier, targetAttested, sepoliaHead] = await Promise.all([
      reader.raceState(race.onchain.collateralId),
      attest.frontier(),
      attest.isAttested(targetHeight),
      reader.blockNumber(),
    ]);
  } catch (e) {
    // A chain being unreachable is not the settlement being broken, and the page says so rather
    // than showing a stale panel as though it were current.
    return Response.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }

  const nowS = Math.floor(Date.now() / 1000);
  const secondsLeft = Math.max(0, vault.raceDeadline - nowS);

  const stage: SettlementStage = vault.raceOpen
    ? secondsLeft > 0
      ? "WINDOW_OPEN"
      : "AWAITING_CLOSE"
    : targetAttested
      ? "PROOF_READY"
      : "AWAITING_ATTESTATION";

  return Response.json({
    ok: true,
    id: race.id,
    stage,
    vault: {
      raceOpen: vault.raceOpen,
      raceNonce: vault.raceNonce,
      lockCount: vault.lockCount,
      totalLockedUsd: vault.totalLockedUsd,
      facilitySizeUsd: vault.facilitySizeUsd,
      raceDeadline: vault.raceDeadline,
      secondsLeft,
      obligor: vault.obligor,
      // Whoever may send `closeRace` right now. The obligor at any time; anyone once the deadline
      // has passed. Reported rather than left for the UI to re-derive from the contract's rule.
      closableByAnyone: secondsLeft === 0,
    },
    attestation: {
      chainKey: Number(SEPOLIA_CHAIN_KEY),
      attestedHeight: frontier.attestedHeight,
      checkpointHeight: frontier.checkpointHeight,
      sepoliaHead,
      /** How far attestation trails the source chain's head. The sawtooth everyone asks about. */
      lagBlocks: sepoliaHead - frontier.attestedHeight,
      targetHeight,
      targetAttested,
      /** Zero once the source block is inside the frontier. Never negative. */
      blocksToGo: Math.max(0, targetHeight - frontier.attestedHeight),
    },
    /** Named so the panel can print the exact command rather than "run the worker". */
    proverCommand: `cd worker && bun run src/cli.ts prove ${race.onchain.collateralId} --from-vault`,
    prover: proverState(id),
  });
}

/**
 * Whether this deployment can prove from the app, and how a running prover is getting on.
 *
 * @remarks `available` is reported rather than assumed so the UI offers the button only where
 * pressing it would work — a hosted deployment with no worker checkout is a legitimate
 * configuration, and there the command is the honest answer rather than a broken button.
 */
function proverState(raceId: string) {
  const can = proverAvailable();
  const job = getProverJob(raceId);
  return {
    available: can.ok,
    unavailableReason: can.ok ? undefined : can.why,
    job: job && {
      state: job.state,
      stage: job.stage,
      startedAt: job.startedAt,
      settleTxHash: job.settleTxHash,
      explorerUrl: job.explorerUrl,
      crossCheckAgrees: job.crossCheckAgrees,
      error: job.error,
      // The tail only. The whole log is for a terminal, not a card.
      log: job.log.slice(-8),
    },
  };
}
