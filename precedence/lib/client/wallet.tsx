"use client";

/**
 * Injected-wallet connection, the way every web3 app does it.
 *
 * @remarks Deliberately EIP-1193 over `window.ethereum` plus viem, with no connector library. The
 * app needs one thing from a wallet — an address it can attribute locks and facilities to — and a
 * connector stack would add a dependency surface for a feature this small.
 *
 * There is **no private-key input anywhere in this app, and there must never be one.** A field that
 * accepts a key teaches the exact habit that gets people drained, and a judge who sees one is
 * entitled to distrust everything else. The demo financiers are signed by the worker, off the web
 * tier, from keys that never reach a browser.
 *
 * Connection state is *not* identity. Roles are derived from on-chain history, never from a
 * signup choice — see `useRole`.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { createWalletClient, custom, type Address, type WalletClient } from "viem";
import { sepolia } from "viem/chains";

/** Sepolia. Locks happen here, so this is the chain a connected wallet must be on. */
export const REQUIRED_CHAIN_ID = 11155111;
const REQUIRED_CHAIN_HEX = "0xaa36a7";

interface Eip1193Provider {
  request(args: { method: string; params?: unknown[] | object }): Promise<unknown>;
  on?(event: string, handler: (...args: never[]) => void): void;
  removeListener?(event: string, handler: (...args: never[]) => void): void;
}

declare global {
  interface Window {
    ethereum?: Eip1193Provider;
  }
}

export type WalletStatus = "unsupported" | "disconnected" | "connecting" | "connected";

export interface WalletState {
  status: WalletStatus;
  address: Address | null;
  chainId: number | null;
  /** True once connected AND on Sepolia — the only state in which writes are safe. */
  ready: boolean;
  onWrongChain: boolean;
  error: string | null;
  connect: () => Promise<void>;
  disconnect: () => void;
  switchChain: () => Promise<void>;
  walletClient: WalletClient | null;
}

const WalletContext = createContext<WalletState | null>(null);

/** Turn a provider rejection into something worth showing a user. */
function readableError(e: unknown): string {
  const err = e as { code?: number; message?: string };
  if (err?.code === 4001) return "Connection request rejected in your wallet.";
  if (err?.code === -32002) return "A wallet request is already pending — open your wallet to approve it.";
  if (err?.code === 4902) return "Sepolia is not in your wallet yet. Approve the prompt to add it.";
  return err?.message ?? "Wallet request failed.";
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<WalletStatus>("disconnected");
  const [address, setAddress] = useState<Address | null>(null);
  const [chainId, setChainId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  // ── discover an already-authorised account without prompting ──
  //
  // `eth_accounts` is silent; `eth_requestAccounts` prompts. Using the silent one on mount is what
  // makes a reload feel like a session instead of a fresh login.
  useEffect(() => {
    const eth = window.ethereum;
    if (!eth) {
      setStatus("unsupported");
      return;
    }
    let cancelled = false;

    (async () => {
      try {
        const accounts = (await eth.request({ method: "eth_accounts" })) as string[];
        const cid = (await eth.request({ method: "eth_chainId" })) as string;
        if (cancelled) return;
        setChainId(Number.parseInt(cid, 16));
        if (accounts?.length) {
          setAddress(accounts[0] as Address);
          setStatus("connected");
        }
      } catch {
        // A provider that will not answer eth_accounts is simply treated as disconnected.
      }
    })();

    const onAccounts = (...a: never[]) => {
      const accounts = a[0] as unknown as string[];
      if (!accounts?.length) {
        setAddress(null);
        setStatus("disconnected");
      } else {
        setAddress(accounts[0] as Address);
        setStatus("connected");
      }
    };
    const onChain = (...a: never[]) => setChainId(Number.parseInt(a[0] as unknown as string, 16));

    eth.on?.("accountsChanged", onAccounts);
    eth.on?.("chainChanged", onChain);
    return () => {
      cancelled = true;
      eth.removeListener?.("accountsChanged", onAccounts);
      eth.removeListener?.("chainChanged", onChain);
    };
  }, []);

  const connect = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) {
      setStatus("unsupported");
      setError("No injected wallet found. Install MetaMask or another EIP-1193 wallet.");
      return;
    }
    setError(null);
    setStatus("connecting");
    try {
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const cid = (await eth.request({ method: "eth_chainId" })) as string;
      setAddress(accounts[0] as Address);
      setChainId(Number.parseInt(cid, 16));
      setStatus("connected");
    } catch (e) {
      setStatus("disconnected");
      setError(readableError(e));
    }
  }, []);

  /**
   * Forget the connection locally.
   *
   * @remarks EIP-1193 has no revoke, so this clears our own state only; the wallet still lists the
   * site as authorised. Labelled "Disconnect" because that is what it means to the user, but it is
   * not a permission change and the UI should not imply otherwise.
   */
  const disconnect = useCallback(() => {
    setAddress(null);
    setStatus("disconnected");
    setError(null);
  }, []);

  const switchChain = useCallback(async () => {
    const eth = window.ethereum;
    if (!eth) return;
    setError(null);
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: REQUIRED_CHAIN_HEX }],
      });
    } catch (e) {
      // 4902 = chain unknown to the wallet. Offer to add it rather than dead-ending.
      if ((e as { code?: number }).code === 4902) {
        try {
          await eth.request({
            method: "wallet_addEthereumChain",
            params: [
              {
                chainId: REQUIRED_CHAIN_HEX,
                chainName: "Ethereum Sepolia",
                nativeCurrency: { name: "Sepolia Ether", symbol: "ETH", decimals: 18 },
                rpcUrls: ["https://rpc.sepolia.org"],
                blockExplorerUrls: ["https://sepolia.etherscan.io"],
              },
            ],
          });
        } catch (e2) {
          setError(readableError(e2));
        }
      } else {
        setError(readableError(e));
      }
    }
  }, []);

  const walletClient = useMemo(() => {
    if (typeof window === "undefined" || !window.ethereum || !address) return null;
    return createWalletClient({ account: address, chain: sepolia, transport: custom(window.ethereum) });
  }, [address]);

  const value: WalletState = useMemo(
    () => ({
      status,
      address,
      chainId,
      ready: status === "connected" && chainId === REQUIRED_CHAIN_ID,
      onWrongChain: status === "connected" && chainId !== null && chainId !== REQUIRED_CHAIN_ID,
      error,
      connect,
      disconnect,
      switchChain,
      walletClient,
    }),
    [status, address, chainId, error, connect, disconnect, switchChain, walletClient],
  );

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet(): WalletState {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

/** `0x1234…cdef` — long enough to compare against a wallet, short enough for a header. */
export function shortAddress(a: string): string {
  return a.length > 12 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a;
}
