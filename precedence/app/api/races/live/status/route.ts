import {
  AttestationReader,
  SEPOLIA_CHAIN_KEY,
} from "@/lib/precedence/adapters/creditcoin/attestation-reader";
import { getSepoliaReader } from "@/lib/precedence/adapters/sepolia/sepolia-reader";
import { getRace } from "@/lib/precedence/store/repositories";

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

  const race = await getRace(id);
  if (!race) return Response.json({ ok: false, error: "no such settlement" }, { status: 404 });
  if (!race.onchain) {
    return Response.json(
      { ok: false, error: "this is a scripted walkthrough — it has no on-chain state to report" },
      { status: 409 },
    );
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

  const stage: SettlementStage = race.settlement
    ? "PROVEN"
    : vault.raceOpen
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
  });
}
