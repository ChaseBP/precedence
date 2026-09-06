import { runRace, stepRace } from "@/lib/precedence/orchestrator/engine";
import { getRace } from "@/lib/precedence/store/repositories";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { mode?: "auto" | "step" };
  const existing = await getRace(id);
  if (!existing) return Response.json({ ok: false, error: "not found" }, { status: 404 });

  // A live race must never be advanced from here.
  //
  // `runRace` and `stepRace` execute the lifecycle against the SIMULATED adapters — that is what
  // makes a scripted walkthrough finish in seconds. Pointing them at a race that exists on Sepolia
  // would overwrite genuine locks with fabricated ones and write a settlement no proof supports:
  // the app would show a settled facility whose settlement never happened. Its real phases past
  // RACE_OPEN belong to the prover worker, which waits for attestation of the source block.
  //
  // Enforced here rather than only in the UI, because the UI hiding a button is a courtesy and
  // this is an invariant.
  if (existing.simulated === false) {
    return Response.json(
      {
        ok: false,
        error:
          "This settlement exists on chain, so it cannot be advanced by the scripted engine. It " +
          "progresses when Attestcoin attests the source block and the proof is submitted on " +
          "Creditcoin — see worker/README.md.",
      },
      { status: 409 },
    );
  }

  if (body.mode === "step") {
    const phase = await stepRace(id);
    const race = await getRace(id);
    return Response.json({ ok: true, phase, race });
  }

  void runRace(id);
  return Response.json({ ok: true, running: true });
}
