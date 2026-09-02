import { listAttestations } from "@/lib/precedence/store/repositories";

/** GET /api/attestations — Creditcoin CC3 Attestcoin records (most recent first). */
export async function GET() {
  const attestations = await listAttestations();
  return Response.json({ ok: true, count: attestations.length, attestations });
}
