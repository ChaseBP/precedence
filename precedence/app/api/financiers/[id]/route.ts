import { getAgent } from "@/lib/precedence/store/repositories";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const agent = await getAgent(id);
  if (!agent) return Response.json({ ok: false, error: "not found" }, { status: 404 });
  return Response.json({ ok: true, agent });
}
