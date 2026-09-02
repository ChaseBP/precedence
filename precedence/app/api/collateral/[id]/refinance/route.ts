import { getCollateral } from "@/lib/precedence/store/repositories";
import { findRefinanceArbitrage } from "@/lib/precedence/domain/refinance";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const col = await getCollateral(id);
  if (!col) return Response.json({ ok: false, error: "not found" }, { status: 404 });

  const refi = findRefinanceArbitrage(col.id, col.obligor, col.currentRatePct, col.targetRatePct, 5000);

  return Response.json({ ok: true, opportunity: refi, top: refi });
}
