"use client";

/**
 * Header wallet control — RainbowKit's connect button, styled to the app.
 *
 * @remarks Replaces a hand-rolled button plus popover. That version could not disconnect (it only
 * cleared local state, because EIP-1193 has no revoke and it never called one), and its popover
 * rendered behind other UI so the disconnect item was unclickable anyway. RainbowKit owns the
 * modal, the z-index, reconnection and a real disconnect.
 *
 * `chainStatus="icon"` shows which chain the wallet is on without spending header width on a name,
 * which matters because this row has overflowed before.
 */
import { ConnectButton } from "@rainbow-me/rainbowkit";

export function ConnectWallet() {
  return (
    <ConnectButton
      accountStatus={{ smallScreen: "avatar", largeScreen: "address" }}
      chainStatus={{ smallScreen: "none", largeScreen: "icon" }}
      showBalance={false}
      label="Connect Wallet"
    />
  );
}
