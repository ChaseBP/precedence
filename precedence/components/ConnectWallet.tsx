"use client";

/**
 * Header wallet control: RainbowKit's behaviour, this app's design language.
 *
 * @remarks `ConnectButton.Custom` rather than the default `ConnectButton`. RainbowKit keeps
 * everything that was worth adopting — the wallet picker, a real disconnect, reconnection, the
 * account modal and its z-index — but its stock button renders two rounded pills in its own font,
 * which sat beside this app's clipped mono buttons looking like a widget someone had pasted in.
 * Two of them also cost enough header width to push nav items out of view.
 *
 * So: RainbowKit's hooks, `btn-primary` and `btn-ghost` for the shape. The chain is shown as a
 * short label rather than an icon-plus-caret, because on a two-chain app which chain you are on is
 * information, not decoration.
 */
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, Wallet } from "lucide-react";

export function ConnectWallet() {
  return (
    <ConnectButton.Custom>
      {({ account, chain, openAccountModal, openChainModal, openConnectModal, mounted }) => {
        const ready = mounted;
        // Until wagmi has rehydrated, render an inert placeholder of the same size rather than
        // nothing — a control that pops into existence shifts the whole header.
        if (!ready) {
          return <div className="h-8 w-[7.5rem]" aria-hidden />;
        }

        if (!account || !chain) {
          return (
            <button
              onClick={openConnectModal}
              className="btn-primary flex h-8 shrink-0 items-center gap-1.5 px-3 text-[11px] font-semibold"
            >
              <Wallet size={13} />
              Connect
            </button>
          );
        }

        // "Wrong network" on its own is a dead end — especially when the wallet is showing a
        // network whose NAME looks right. Naming the id the wallet reported, and the one the app
        // wants, is what makes a stale wallet entry diagnosable instead of baffling.
        if (chain.unsupported) {
          const looksLikeStaleCc3 = chain.id !== 11155111 && chain.id !== 102031;
          return (
            <button
              onClick={openChainModal}
              title={
                `Your wallet reports chain id ${chain.id}, which this app does not use. It expects ` +
                `Sepolia (11155111) or Creditcoin CC3 (102031).` +
                (looksLikeStaleCc3
                  ? ` If your wallet lists a "Creditcoin CC3 Testnet" network, it may be an old entry with the wrong id (101935) — remove it and let this app add the correct one.`
                  : "")
              }
              className="btn-ghost flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] font-semibold"
              style={{ color: "var(--warn)", borderColor: "var(--warn)" }}
            >
              <AlertTriangle size={13} />
              Chain {chain.id}?
            </button>
          );
        }

        return (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              onClick={openChainModal}
              title={`Connected to ${chain.name}. Click to switch.`}
              className="btn-ghost hidden h-8 items-center gap-1.5 px-2.5 text-[10.5px] font-semibold [@media(min-width:1280px)]:flex"
            >
              <span
                className="size-1.5 shrink-0 rounded-full"
                style={{ background: "var(--proof-verified)" }}
                aria-hidden
              />
              {/* Sepolia and Creditcoin CC3 both need naming on a two-chain app; the full names
                  are too wide for a header, so each is cut to its distinguishing word. */}
              {chain.id === 11155111 ? "Sepolia" : chain.id === 102031 ? "CC3" : chain.name}
            </button>
            <button
              onClick={openAccountModal}
              className="btn-ghost flex h-8 items-center gap-1.5 px-2.5 text-[10.5px]"
            >
              {account.displayName}
            </button>
          </div>
        );
      }}
    </ConnectButton.Custom>
  );
}
