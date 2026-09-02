import { runRace, stepRace } from "@/lib/precedence/orchestrator/engine";
import { getRace } from "@/lib/precedence/store/repositories";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { mode?: "auto" | "step" };
  const existing = await getRace(id);
  if (!existing) return Response.json({ ok: false, error: "not found" }, { status: 404 });

  if (body.mode === "step") {
    const phase = await stepRace(id);
    const race = await getRace(id);
    return Response.json({ ok: true, phase, race });
  }

  void runRace(id);
  return Response.json({ ok: true, running: true });
}
