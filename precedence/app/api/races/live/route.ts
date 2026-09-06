import {
  NotVerifiableError,
  findLiveRace,
  openLiveRace,
} from "@/lib/precedence/orchestrator/live-race";
import { getCollateral } from "@/lib/precedence/store/repositories";
import type { Hex } from "@/lib/precedence/types";

/**
 * The live race for a facility, and the way one gets recorded.
 *
 * @remarks `POST` takes a transaction hash and nothing else that matters. It would be far simpler
 * to accept the block number and transaction index the browser already holds — it read them off
 * the receipt itself — but those two numbers ARE the priority claim, so accepting them from the
 * party they rank would mean the app had no proof of anything. They are decoded server-side from
 * a receipt fetched by hash instead. See `sepolia-reader.ts`.
 *
 * A failure to verify is a 422, not a 500: "that transaction did not open a race on this vault"
 * is a correct answer about the caller's request, not a fault in this route.
 */

export async function GET(req: Request) {
  const collateralId = new URL(req.url).searchParams.get("collateralId");
  if (!collateralId) {
    return Response.json({ ok: false, error: "collateralId is required" }, { status: 400 });
  }
  const collateral = await getCollateral(collateralId);
  if (!collateral) return Response.json({ ok: false, error: "no such collateral" }, { status: 404 });

  const race = await findLiveRace(collateral.docHash);
  return Response.json({ ok: true, race: race ?? null, id: race?.id ?? null });
}

export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    collateralId?: string;
    openTxHash?: string;
    registerTxHash?: string;
  };
  if (!body.collateralId || !body.openTxHash) {
    return Response.json(
      { ok: false, error: "collateralId and openTxHash are required" },
      { status: 400 },
    );
  }

  try {
    const race = await openLiveRace({
      collateralId: body.collateralId,
      openTxHash: body.openTxHash as Hex,
      registerTxHash: body.registerTxHash as Hex | undefined,
    });
    return Response.json({ ok: true, id: race.id, race }, { status: 201 });
  } catch (e) {
    // 422 when the chain has answered and does not support the claim; 502 when we could not ask
    // it. A caller retrying is right in the second case and wrong in the first, so the two must
    // not share a status.
    const answered = e instanceof NotVerifiableError;
    return Response.json(
      { ok: false, error: (e as Error).message },
      { status: answered ? 422 : 502 },
    );
  }
}
