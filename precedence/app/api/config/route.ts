import { getConfig, getDeps, loadDeployedAddresses } from "@/lib/precedence/config";
import { isPersistent, storePath } from "@/lib/precedence/store/json-store";

/**
 * GET /api/config — adapter truth disclosure for the UI's honesty chip.
 *
 * `live` comes from each adapter's own isLive(), NOT from the env var. A misconfigured environment
 * can degrade the demo but can never make the UI claim simulated data is on-chain. `note` explains
 * WHY an adapter is in the mode it is in, so a fallback is visible rather than silent.
 */
export async function GET() {
  /**
   * The canary for a broken frontend/backend split.
   *
   * @remarks `PRECEDENCE_API_ORIGIN` is set only on a deployment whose API lives somewhere else,
   * and a `beforeFiles` rewrite is supposed to send every `/api/*` request there. So if this
   * handler is executing while that variable is set, the rewrite did NOT fire — and the answer it
   * is about to give is mock-mode nonsense from a serverless box with no deployments file, no
   * store and no worker.
   *
   * Without this the only symptom is an app calmly reporting both chains as simulated, which looks
   * like a configuration choice rather than a routing failure. Said out loud instead, because the
   * UI reads this endpoint to decide what to claim and it should refuse to claim anything.
   */
  const misroutedTo = process.env.PRECEDENCE_API_ORIGIN?.trim().replace(/\/+$/, "");
  if (misroutedTo) {
    return Response.json(
      {
        ok: false,
        misconfigured: "api-rewrite-not-applied",
        error:
          `This deployment is configured to proxy its API to ${misroutedTo}, but the request ` +
          `reached the frontend's own route handler instead — so the rewrite is not in effect. ` +
          `Anything this instance reports about the chains would be mock data. Check that ` +
          `next.config.ts returns the rewrite under \`beforeFiles\` (an array-form rewrite loses ` +
          `to app/api route handlers) and that PRECEDENCE_API_ORIGIN is set at build time.`,
        expectedApiOrigin: misroutedTo,
      },
      { status: 503 },
    );
  }

  const c = getConfig();
  const d = getDeps();
  return Response.json({
    // What is actually live, not the master default. This returned `c.mode` — the env fallback —
    // so it read "mock" while both adapters reported themselves live.
    mode:
      d.sepolia.isLive() && d.creditcoin.isLive()
        ? "chain"
        : d.sepolia.isLive() || d.creditcoin.isLive()
          ? "mixed"
          : "mock",
    requestedMode: c.mode,
    sepolia: { requested: c.sepoliaMode, live: d.sepolia.isLive(), note: d.modeNotes.sepolia },
    creditcoin: { requested: c.creditcoinMode, live: d.creditcoin.isLive(), note: d.modeNotes.creditcoin },
    runtime: c.runtimeMode,
    store: { persistent: isPersistent(), path: storePath() ?? null },
    explorers: { sepolia: c.explorerBaseSepolia, creditcoin: c.explorerBaseCreditcoin },
    proofBuilderUrl: c.proofBuilderUrl,
    // Deployed addresses, so the browser can read the vault and sign a lock itself. Public
    // information by definition — they are on two block explorers — and sourced from the deploy
    // files rather than env, so a mistyped vault cannot break the proof-to-vault binding while
    // looking like a verification failure. Absent when nothing is deployed, which is the signal
    // the UI uses to say a live lock is not currently possible.
    addresses: loadDeployedAddresses(),
    chainIds: { sepolia: 11155111, creditcoin: 102031 },
  });
}
