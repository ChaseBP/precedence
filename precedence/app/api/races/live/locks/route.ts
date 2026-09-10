import { NotVerifiableError, appendLiveLock } from "@/lib/precedence/orchestrator/live-race";
import type { Hex } from "@precedence/sdk/types";

/**
 * POST /api/races/live/locks — record a lock the lender has already signed.
 *
 * @remarks Takes the transaction hash alone. The tranche, the amount, the vault's `seq`, the block
 * and the transaction index are all decoded from the `Lock_` event in that transaction's receipt,
 * so a lender cannot describe their own position — only point at it. That is the difference
 * between a proof and a claim, and this endpoint is where the app would have quietly lost it.
 *
 * Idempotent by transaction hash: a retry, a second tab, or a component remounting after the
 * wallet returns all record one lock.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => ({}))) as {
    collateralId?: string;
    lockTxHash?: string;
  };
  if (!body.collateralId || !body.lockTxHash) {
    return Response.json(
      { ok: false, error: "collateralId and lockTxHash are required" },
      { status: 400 },
    );
  }

  try {
    const race = await appendLiveLock({
      collateralId: body.collateralId,
      lockTxHash: body.lockTxHash as Hex,
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
