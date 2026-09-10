import { getConfig, getDeps } from "@/lib/precedence/config";
import type { RegistrationProposal } from "@precedence/sdk/types";

/**
 * POST /api/collateral/parse — read a collateral document and propose form values.
 *
 * @remarks This is a PRE-FILL endpoint and nothing more. There is no on-chain record to ratify
 * against at registration time, so nothing returned here is evidence: the borrower reads every
 * field, edits what is wrong, and their signature is what makes any of it a claim. The response
 * says so explicitly in `advisory` so a client cannot present it as verified.
 *
 * Requires `PRECEDENCE_RUNTIME=agent` and a key. Without one it returns 200 with
 * `available: false` rather than an error — no model configured is a normal state, not a fault,
 * and the form stays usable by hand.
 */
export async function POST(req: Request) {
  let body: { documentText?: string };
  try {
    body = await req.json();
  } catch {
    return Response.json({ ok: false, error: "expected a JSON body" }, { status: 400 });
  }

  const documentText = (body.documentText ?? "").trim();
  if (documentText.length < 40) {
    return Response.json(
      { ok: false, error: "documentText is too short to read — paste the document text" },
      { status: 400 },
    );
  }

  const runtime = getDeps().runtime;
  if (typeof runtime.proposeRegistration !== "function") {
    return Response.json({
      ok: true,
      available: false,
      reason:
        getConfig().runtimeMode === "agent"
          ? "The agent runtime is selected but this runtime cannot read documents."
          : "No model is configured (PRECEDENCE_RUNTIME is not 'agent'). Fill the form by hand.",
    });
  }

  let proposal: RegistrationProposal;
  try {
    proposal = await runtime.proposeRegistration(documentText);
  } catch (e) {
    // A model failure must never block a registration — the form is fully usable without it.
    return Response.json({
      ok: true,
      available: false,
      reason: `The model could not be reached: ${(e as Error).message.slice(0, 160)}`,
    });
  }

  return Response.json({
    ok: true,
    available: true,
    proposal,
    advisory:
      "Suggested values read from the document by a model. Nothing here is verified and nothing " +
      "has been registered. Check every field — you are the one signing it.",
  });
}
