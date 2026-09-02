import { getCollateral } from "@/lib/precedence/store/repositories";
import { analyzeCollateral } from "@/lib/precedence/domain/collateral";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const col = await getCollateral(id);
  if (!col) return Response.json({ ok: false, error: "not found" }, { status: 404 });

  const url = new URL(req.url);
  const amountUsd = Number(url.searchParams.get("amountUsd")) || col.financingRequestedUsd;
  const analysis = analyzeCollateral(col, amountUsd);

  return Response.json({ ok: true, analysis });
}
