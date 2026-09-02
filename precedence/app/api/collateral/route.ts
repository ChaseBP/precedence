import { listCollateral } from "@/lib/precedence/store/repositories";

/** GET /api/collateral — registered real-world collateral on Creditcoin CC3. */
export async function GET() {
  const collateral = await listCollateral();
  return Response.json({ ok: true, count: collateral.length, collateral });
}
