import { getDeps } from "@/lib/precedence/config";
import { analyzeCollateral } from "@/lib/precedence/domain/collateral";
import { getCollateral, listRaces } from "@/lib/precedence/store/repositories";

/** GET /api/collateral/:id — one facility, its analysis, and any race already run against it. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const collateral = await getCollateral(id);
  if (!collateral) return Response.json({ ok: false, error: "not found" }, { status: 404 });

  const races = await listRaces();
  // RaceSummary carries the symbol, not the id.
  const race = races.find((r) => r.collateralSymbol === collateral.symbol);
  const d = getDeps();

  return Response.json({
    ok: true,
    collateral,
    analysis: analyzeCollateral(collateral, collateral.financingRequestedUsd),
    raceId: race?.id ?? null,
    raceOutcome: race?.outcome ?? null,
    // The UI labels provenance from this, never from an env var.
    live: { sepolia: d.sepolia.isLive(), creditcoin: d.creditcoin.isLive() },
  });
}
