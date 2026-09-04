"use client";

import { getAccount, switchChain } from "wagmi/actions";
import { CHAIN_LABEL, creditcoinCc3, sepolia } from "./chains";
import { wagmiConfig } from "./wagmi";

/**
 * Move the wallet to `chainId` before a write, and wait until it has actually moved.
 *
 * @remarks wagmi does NOT switch chains for you. `writeContract({ chainId })` resolves a connector
 * client via `getConnectorClient`, which compares the connector's chain to the requested one and
 * **throws** `ConnectorChainMismatchError` — the error a user sees as "The current chain of the
 * wallet (id: 11155111) does not match the target chain for the transaction (id: 102031)". Passing
 * `chainId` declares intent and guards against signing on the wrong chain; it does not fulfil it.
 *
 * So the switch has to be requested explicitly, and — this is the part that bites — it has to be
 * WAITED FOR. MetaMask resolves `wallet_switchEthereumChain` when the user approves the prompt,
 * but the connector's own chain state updates a beat later. Writing immediately after the promise
 * resolves can still hit the mismatch, which looks exactly like the switch having been ignored.
 *
 * A chain the wallet has never seen (CC3 is in nobody's MetaMask) is added first via
 * `wallet_addEthereumChain`, using the definition in `wagmiConfig.chains` — which is why CC3 has
 * to be declared there rather than switched to by raw id.
 */
/** Only the two chains this app declares, so a typo cannot ask for one wagmi cannot add. */
export type AppChainId = typeof sepolia.id | typeof creditcoinCc3.id;

export async function ensureChain(chainId: AppChainId): Promise<void> {
  const label = CHAIN_LABEL[chainId] ?? `chain ${chainId}`;
  const current = getAccount(wagmiConfig).chainId;
  if (current === chainId) return;

  try {
    await switchChain(wagmiConfig, { chainId });
  } catch (e) {
    // Deliberately NOT classified as "you declined".
    //
    // viem maps several distinct provider failures onto UserRejectedRequestError, and its own
    // wrapper message reads "User rejected the request." regardless of the underlying cause — so
    // neither `code === 4001` nor a text match on the cause chain can tell a real cancel from a
    // wallet refusing to add a conflicting network. Both were tried; both misreported the stale
    // Creditcoin entry as the user cancelling, which sends someone looking in the wrong place.
    //
    // Since the two cannot be distinguished honestly, the message covers both and leads with the
    // fact that IS known: which chain the wallet is on versus the one required.
    throw new Error(
      `The switch to ${label} (id ${chainId}) did not complete — your wallet is on ` +
        `${describeChain(getAccount(wagmiConfig).chainId ?? current)}. ` +
        `If you cancelled the prompt, try again. ${staleNetworkHint(chainId)} ` +
        `Wallet said: ${deepestMessage(e)}`,
    );
  }

  // Approving the prompt and the connector observing the change are two separate events. Writing
  // in between fails exactly like not switching at all.
  for (let i = 0; i < 40; i++) {
    const now = getAccount(wagmiConfig).chainId;
    if (now === chainId) return;
    await new Promise((r) => setTimeout(r, 150));
  }

  const ended = getAccount(wagmiConfig).chainId;
  throw new Error(
    `Your wallet is still on ${describeChain(ended)} after the switch to ${label} (id ${chainId}). ` +
      staleNetworkHint(chainId),
  );
}

/**
 * Walk to the most specific message a provider error carries.
 *
 * @remarks viem wraps provider errors several layers deep and rewrites the outer message into
 * something generic. `details` and `shortMessage` usually hold the wallet's own words, which is
 * what actually tells a user whether they cancelled or the wallet refused.
 */
function deepestMessage(e: unknown): string {
  const seen = new Set<unknown>();
  let best = "";
  let cur = e as { message?: string; details?: string; shortMessage?: string; cause?: unknown } | undefined;

  while (cur && typeof cur === "object" && !seen.has(cur)) {
    seen.add(cur);
    for (const candidate of [cur.details, cur.shortMessage, cur.message]) {
      if (typeof candidate === "string" && candidate.trim() && candidate.length > best.length) {
        best = candidate.trim();
      }
    }
    cur = cur.cause as typeof cur;
  }
  return (best || "no detail reported").slice(0, 220);
}

function describeChain(id: number | undefined): string {
  if (id === undefined) return "no chain";
  const known = CHAIN_LABEL[id];
  return known ? `${known} (id ${id})` : `an unrecognised chain (id ${id})`;
}

/**
 * The specific trap this app created for its own users.
 *
 * @remarks An earlier build added Creditcoin CC3 to wallets with the chain id 0x18e2f — 101935,
 * not 102031. Anyone who used that build now has a network in MetaMask NAMED "Creditcoin CC3
 * Testnet" whose id is wrong and whose RPC is right. Selecting it reports 101935, so the app sees
 * an unrecognised chain; and adding the correct network collides with the stale one's name and
 * RPC, which MetaMask refuses in a way that looks like the user rejecting a prompt they just
 * approved.
 *
 * There is no way to delete a wallet's network from a page, so the message has to say what to do.
 */
function staleNetworkHint(chainId: AppChainId): string {
  if (chainId !== creditcoinCc3.id) return "Switch to it manually and try again.";
  return (
    `If your wallet already lists a "Creditcoin CC3 Testnet" network, it may be an old entry with ` +
    `the wrong chain id (101935 instead of ${creditcoinCc3.id}) added by an earlier version of ` +
    `this app. Remove it in your wallet's network settings, then try again — this app will add the ` +
    `correct one.`
  );
}
