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
  if (getAccount(wagmiConfig).chainId === chainId) return;

  try {
    await switchChain(wagmiConfig, { chainId });
  } catch (e) {
    const err = e as { code?: number; message?: string };
    if (err?.code === 4001) {
      throw new Error(`You declined the switch to ${label}, so nothing was signed.`);
    }
    throw new Error(
      `Could not switch your wallet to ${label}: ${err?.message ?? "unknown error"}. ` +
        `If your wallet blocked adding the network, add it manually and try again.`,
    );
  }

  // Wait for the connector to report the new chain. Approving the prompt and the connector
  // observing it are two separate events, and writing between them fails the same way as not
  // switching at all.
  for (let i = 0; i < 40; i++) {
    if (getAccount(wagmiConfig).chainId === chainId) return;
    await new Promise((r) => setTimeout(r, 150));
  }
  throw new Error(
    `Your wallet did not report switching to ${label}. Switch to it manually and try again.`,
  );
}
