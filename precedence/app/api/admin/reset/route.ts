import { resetStore } from "@/lib/precedence/store/repositories";

export async function POST(req: Request) {
  const adminHeader = req.headers.get("x-precedence-admin");
  const expected = process.env.PRECEDENCE_ADMIN_TOKEN ?? "";

  if (expected && adminHeader !== expected) {
    return Response.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  await resetStore();
  return Response.json({ ok: true, message: "reset complete" });
}
