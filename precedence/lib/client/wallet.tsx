"use client";

/**
 * Wallet access for the app, backed by wagmi.
 *
 * @remarks This was a hand-rolled EIP-1193 wrapper. It had to reimplement a wallet picker,
 * disconnect, reconnection and network switching, and it got two of those wrong: disconnect did
 * not disconnect, and the account popover rendered behind other UI. All of that now comes from
 * wagmi + RainbowKit.
 *
 * The shape below is deliberately unchanged so the components that consumed it did not have to be
 * rewritten alongside the connector swap — one change at a time.
 *
 * `switchChain` is kept for the places that genuinely want to move the wallet ahead of time, but
 * it is no longer how a transaction gets onto the right chain: `useChainWrite` sends a `chainId`
 * with the write and wagmi prompts the switch itself, as part of signing.
 */
import { useCallback, useMemo } from "react";
import type { Address } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  useSwitchChain,
  useWalletClient,
} from "wagmi";
import { CHAIN_LABEL, CHAIN_PURPOSE, creditcoinCc3, sepolia } from "./chains";

export type ChainKey = "sepolia" | "creditcoin";

export const CHAINS = {
  sepolia: {
    id: sepolia.id,
    name: CHAIN_LABEL[sepolia.id],
    purpose: CHAIN_PURPOSE[sepolia.id],
    explorer: "https://sepolia.etherscan.io",
  },
  creditcoin: {
    id: creditcoinCc3.id,
    name: CHAIN_LABEL[creditcoinCc3.id],
    purpose: CHAIN_PURPOSE[creditcoinCc3.id],
    explorer: "https://creditcoin-testnet.blockscout.com",
  },
} as const;

export const REQUIRED_CHAIN_ID = sepolia.id;

export type WalletStatus = "unsupported" | "disconnected" | "connecting" | "connected";

export function useWallet() {
  const { address, isConnected, isConnecting, isReconnecting } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain: wagmiSwitch, error: switchError, isPending: switching } = useSwitchChain();
  const { data: walletClient } = useWalletClient();

  const chainKey: ChainKey | null =
    chainId === CHAINS.sepolia.id ? "sepolia" : chainId === CHAINS.creditcoin.id ? "creditcoin" : null;

  const status: WalletStatus = isConnected
    ? "connected"
    : isConnecting || isReconnecting
      ? "connecting"
      : connectors.length === 0
        ? "unsupported"
        : "disconnected";

  const switchChain = useCallback(
    async (to: ChainKey = "sepolia") => {
      wagmiSwitch({ chainId: CHAINS[to].id });
    },
    [wagmiSwitch],
  );

  const doConnect = useCallback(async () => {
    // RainbowKit's modal is the real entry point; this is the fallback for any surface that still
    // calls connect() directly, and it picks the first available connector.
    const first = connectors[0];
    if (first) connect({ connector: first });
  }, [connect, connectors]);

  return useMemo(
    () => ({
      status,
      address: (address ?? null) as Address | null,
      chainId,
      chainKey,
      ready: isConnected && chainId === CHAINS.sepolia.id,
      onWrongChain: isConnected && chainKey === null,
      isOn: (to: ChainKey) => isConnected && chainId === CHAINS[to].id,
      switching,
      error: (connectError ?? switchError)?.message ?? null,
      connect: doConnect,
      disconnect: () => disconnect(),
      switchChain,
      walletClient: walletClient ?? null,
    }),
    [
      status, address, chainId, chainKey, isConnected, switching,
      connectError, switchError, doConnect, disconnect, switchChain, walletClient,
    ],
  );
}

/** `0x1234…cdef` — long enough to compare against a wallet, short enough for a header. */
export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
