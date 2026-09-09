"use client";

import { createConfig, fallback, http } from "wagmi";
import { injected, walletConnect } from "wagmi/connectors";
import { creditcoinCc3, sepolia } from "./chains";

/**
 * Wallet connection: wagmi connectors, RainbowKit for the UI.
 *
 * @remarks This replaces a hand-rolled `window.ethereum` wrapper that had to reimplement — badly —
 * everything a connector library already does: a wallet picker, a disconnect that actually
 * disconnects, reconnection across refreshes, and network switching. Its disconnect did not work
 * and its account popover rendered behind other UI.
 *
 * The behavioural win is network switching, but not in the way it first appears. `writeContract`
 * takes a `chainId` and **throws** on a mismatch rather than switching — that guard is worth
 * having, and it is not a switch. Every write therefore calls `ensureChain` first, which requests
 * the switch, adds the chain when the wallet has never seen it, and waits for the connector to
 * report the change. Declaring both chains here is what makes that possible.
 *
 * The two-chain design stays because it IS the product — Attestcoin proves foreign-chain
 * transactions, so capital has to lock somewhere foreign — but hunting for a switch button goes.
 *
 * @remarks Connectors are declared here rather than via `@rainbow-me/rainbowkit/wallets` because
 * this app only needs injected wallets plus optional WalletConnect, and a shorter list is easier
 * to reason about. It does NOT avoid the Coinbase dependency — nothing can. RainbowKit's bundle
 * statically imports `baseAccount` from `wagmi/connectors`, and `@wagmi/connectors` exposes a
 * single barrel that re-exports it, so the graph
 * `RainbowKit → @wagmi/connectors/baseAccount → @base-org/account → @coinbase/cdp-sdk → @x402/*`
 * is resolved by any RainbowKit import at all. Tree-shaking prunes the OUTPUT, but the bundler
 * must resolve the graph first. See the devDependency note in package.json and
 * https://github.com/rainbow-me/rainbowkit/issues/2617.
 *
 * WalletConnect (and therefore mobile wallets) needs a free project id from cloud.reown.com set as
 * NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID. Without one the app degrades to browser wallets —
 * MetaMask, Rabby, Brave, the Coinbase extension — rather than breaking.
 */
const projectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "";

export const hasWalletConnect = projectId.length > 0;

export const wagmiConfig = createConfig({
  chains: [sepolia, creditcoinCc3],
  connectors: [
    injected({ shimDisconnect: true }),
    ...(hasWalletConnect
      ? [
          walletConnect({
            projectId,
            metadata: {
              name: "PRECEDENCE",
              description: "Proof-ordered capital priority for real-world collateral",
              url: "https://precedence.local",
              icons: [],
            },
          }),
        ]
      : []),
  ],
  /**
   * Read transports. Our own proxy first, the public endpoint only as a backstop.
   *
   * @remarks `http()` with no URL was the bug. viem falls back to the chain's public default, which
   * for Sepolia is `11155111.rpc.thirdweb.com` — unauthenticated and shared with the whole
   * internet. This app polls the vault every six seconds per open facility, so visitors got their
   * IP throttled, and a throttled response from that host arrives with NO CORS headers. The browser
   * then reports `net::ERR_FAILED` and a missing `Access-Control-Allow-Origin`, which looks like
   * our misconfiguration and is really a rate limit two hops away. Nothing about it was fixable
   * from the client.
   *
   * `/api/rpc/*` forwards to the server's real key, which never reaches the browser. It is a
   * relative URL, so it works on both the Vercel frontend (rewritten to the Azure backend) and on
   * the backend itself, with no origin to configure and no CORS involved at all.
   *
   * `fallback` keeps the public endpoint behind it, so a backend restart degrades reads rather than
   * breaking them. Only in the browser: a relative URL has nothing to resolve against during SSR,
   * so the server-rendered pass uses the public transport directly.
   */
  transports: {
    [sepolia.id]:
      typeof window === "undefined"
        ? http()
        : fallback([http("/api/rpc/sepolia"), http()]),
    [creditcoinCc3.id]:
      typeof window === "undefined"
        ? http()
        : fallback([http("/api/rpc/creditcoin"), http()]),
  },
  ssr: true,
});
