"use client";

import { createConfig, http } from "wagmi";
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
 * The behavioural win is network switching. `writeContract` takes a `chainId` and wagmi prompts
 * the switch itself as part of the transaction, so a user never hunts for a "switch network"
 * button: they press "Register collateral", approve the network change, and sign. The two-chain
 * design stays because it IS the product — Attestcoin proves foreign-chain transactions, so
 * capital has to lock somewhere foreign — but the manual switching goes.
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
  transports: {
    [sepolia.id]: http(),
    [creditcoinCc3.id]: http(),
  },
  ssr: true,
});
