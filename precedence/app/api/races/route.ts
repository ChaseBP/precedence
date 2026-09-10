import { listRaces } from "@/lib/precedence/store/repositories";
import { createRace } from "@/lib/precedence/orchestrator/create";
import type { RaceScenario } from "@precedence/sdk/types";

const SCENARIOS: RaceScenario[] = ["performing", "default", "breach"];

export async function GET() {
  const races = await listRaces();
  return Response.json({ ok: true, races });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    collateralId?: string;
    requestedTotalUsd?: number;
    mode?: "auto" | "step";
    scenario?: string;
  };

  // `scenario` selects the storyline so the demo can trigger the failure act on command rather
  // than waiting for a real default. Unknown values fall back to the happy path rather than
  // throwing — a bad query string should not break the demo.
  const scenario = SCENARIOS.includes(body.scenario as RaceScenario)
    ? (body.scenario as RaceScenario)
    : "performing";

  const race = await createRace({
    collateralId: body.collateralId,
    requestedTotalUsd: body.requestedTotalUsd,
    mode: body.mode,
    scenario,
  });

  return Response.json({ ok: true, id: race.id, race }, { status: 202 });
}
