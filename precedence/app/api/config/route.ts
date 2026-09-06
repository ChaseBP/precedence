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
