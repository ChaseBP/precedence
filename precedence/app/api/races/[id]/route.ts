import { getRace, getEventsSince } from "@/lib/precedence/store/repositories";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const race = await getRace(id);
  if (!race) return Response.json({ ok: false, error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const sinceSeq = Number(url.searchParams.get("sinceSeq") ?? 0);
  const events = await getEventsSince(id, sinceSeq);

  return Response.json({ ok: true, race, events });
}
