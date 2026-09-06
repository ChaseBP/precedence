import {
  AttestationReader,
  creditcoinReadiness,
} from "@/lib/precedence/adapters/creditcoin/attestation-reader";
import {
  ProverBusyError,
  getProverJob,
  proverAvailable,
  startProverJob,
} from "@/lib/precedence/orchestrator/prover-job";
import { getRace } from "@/lib/precedence/store/repositories";

/**
 * POST /api/races/live/prove — submit the proof for a settlement that is ready for one.
 *
 * @remarks Returns 202 and does not wait. Proving takes tens of seconds; a request that awaits it
 * times out on some hosts and holds a connection on the rest. The page already polls
 * `/api/races/live/status`, and that response carries the job's progress.
 *
 * Readiness is re-checked here against the precompile rather than trusted from the caller. The
 * button is only offered when the panel says PROOF_READY, but the panel's opinion is a rendering
 * of a poll that may be twenty seconds old, and starting a prover against an unattested block
 * wastes real gas failing.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as { id?: string };
  if (!body.id) return Response.json({ ok: false, error: "id is required" }, { status: 400 });

  const race = await getRace(body.id);
  if (!race) return Response.json({ ok: false, error: "no such settlement" }, { status: 404 });
  if (!race.onchain) {
    return Response.json(
      { ok: false, error: "a scripted walkthrough has nothing to prove" },
      { status: 409 },
    );
  }
  if (race.settlement) {
    return Response.json(
      { ok: false, error: "this settlement is already proven" },
      { status: 409 },
    );
  }
  if (race.locks.length === 0) {
    return Response.json(
      { ok: false, error: "there are no locks to prove" },
      { status: 409 },
    );
  }

  const can = proverAvailable();
  if (!can.ok) return Response.json({ ok: false, error: can.why }, { status: 501 });

  // The highest block any lock landed in is the one that has to be inside the frontier — a race
  // spans blocks, and the proof cannot be built until the last of them is attested.
  const target = Math.max(...race.locks.map((l) => l.lockBlockNumber));
  let attested: boolean;
  try {
    attested = await new AttestationReader().isAttested(target);
  } catch (e) {
    return Response.json({ ok: false, error: (e as Error).message }, { status: 502 });
  }
  if (!attested) {
    return Response.json(
      {
        ok: false,
        error: `Block ${target.toLocaleString()} is not attested yet, so the proof cannot be built.`,
      },
      { status: 409 },
    );
  }

  // The other precondition, and the one that is easy to miss: the proof can be perfectly valid and
  // still revert, because the engine settles against the Creditcoin registry and that is a
  // separate registration on a separate chain.
  const ready = await creditcoinReadiness(race.onchain.collateralId);
  if (!ready.ok) return Response.json({ ok: false, error: ready.why }, { status: 409 });

  try {
    const job = startProverJob(race.id, race.onchain.collateralId);
    return Response.json({ ok: true, job: { state: job.state, stage: job.stage } }, { status: 202 });
  } catch (e) {
    if (e instanceof ProverBusyError) {
      const job = getProverJob(race.id);
      return Response.json(
        { ok: false, error: e.message, job: job && { state: job.state, stage: job.stage } },
        { status: 409 },
      );
    }
    return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }
}
