import { getConfig, getDeps } from "@/lib/precedence/config";
import { isPersistent, storePath } from "@/lib/precedence/store/json-store";

/**
 * GET /api/config — adapter truth disclosure for the UI's honesty chip.
 *
 * `live` comes from each adapter's own isLive(), NOT from the env var. A misconfigured environment
 * can degrade the demo but can never make the UI claim simulated data is on-chain. `note` explains
 * WHY an adapter is in the mode it is in, so a fallback is visible rather than silent.
 */
export async function GET() {
  const c = getConfig();
  const d = getDeps();
  return Response.json({
    mode: c.mode,
    sepolia: { requested: c.sepoliaMode, live: d.sepolia.isLive(), note: d.modeNotes.sepolia },
    creditcoin: { requested: c.creditcoinMode, live: d.creditcoin.isLive(), note: d.modeNotes.creditcoin },
    runtime: c.runtimeMode,
    store: { persistent: isPersistent(), path: storePath() ?? null },
    explorers: { sepolia: c.explorerBaseSepolia, creditcoin: c.explorerBaseCreditcoin },
    proofBuilderUrl: c.proofBuilderUrl,
  });
}
