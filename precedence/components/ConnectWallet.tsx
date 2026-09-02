"use client";

/**
 * Header wallet control: connect, wrong-chain recovery, and the connected address.
 *
 * @remarks The wrong-chain state is a first-class branch, not an error toast. A wallet parked on
 * mainnet is the single most common way a demo dies in front of an audience, and the recovery is
 * one click, so it belongs in the button itself.
 */
import { useState } from "react";
import { AlertTriangle, ArrowLeftRight, Check, Copy, LogOut, Wallet } from "lucide-react";
import { CHAINS, shortAddress, useWallet } from "@/lib/client/wallet";

export function ConnectWallet() {
  const { status, address, chainKey, onWrongChain, error, connect, disconnect, switchChain } = useWallet();
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  async function copy() {
    if (!address) return;
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 1400);
  }

  if (status === "unsupported") {
    return (
      <a
        href="https://metamask.io/download/"
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors"
        style={{ border: "1px solid var(--border)", color: "var(--text-muted)" }}
        title="No injected wallet detected in this browser"
      >
        <Wallet size={13} />
        Get a wallet
      </a>
    );
  }

  if (onWrongChain) {
    return (
      <button
        onClick={() => switchChain("sepolia")}
        className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors"
        style={{
          border: "1px solid var(--warn)",
          color: "var(--warn)",
          background: "color-mix(in srgb, var(--warn) 10%, transparent)",
        }}
        title={`This wallet is on neither of our chains. Capital locks on ${CHAINS.sepolia.name}; collateral registers on ${CHAINS.creditcoin.name}.`}
      >
        <AlertTriangle size={13} />
        Switch to Sepolia
      </button>
    );
  }

  if (chainKey && address) {
    return (
      <div className="relative">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 font-mono text-[11px] transition-colors"
          style={{ border: "1px solid var(--border)", color: "var(--text)" }}
        >
          <span
            className="size-1.5 shrink-0 rounded-full"
            style={{
              background: chainKey === "sepolia" ? "var(--proof-verified)" : "var(--accent)",
            }}
            title={CHAINS[chainKey].name}
            aria-hidden
          />
          {shortAddress(address)}
        </button>

        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
            <div
              className="absolute right-0 z-50 mt-1.5 w-56 overflow-hidden rounded-xl p-1"
              style={{
                background: "var(--bg-2)",
                border: "1px solid var(--border)",
                boxShadow: "0 12px 32px rgba(0,0,0,0.32)",
              }}
            >
              <div className="px-2.5 py-2">
                <div className="text-[10.5px]" style={{ color: "var(--text-faint)" }}>
                  Connected to {CHAINS[chainKey].name}
                </div>
                <div className="mt-0.5 text-[10px] leading-snug" style={{ color: "var(--text-faint)" }}>
                  {CHAINS[chainKey].purpose}
                </div>
                <div className="mt-0.5 break-all font-mono text-[10.5px]" style={{ color: "var(--text-muted)" }}>
                  {address}
                </div>
              </div>
              <button
                onClick={() => switchChain(chainKey === "sepolia" ? "creditcoin" : "sepolia")}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-white/5"
                style={{ color: "var(--text-muted)" }}
                title="Borrowers sign on Creditcoin CC3; lenders sign on Sepolia."
              >
                <ArrowLeftRight size={13} />
                Switch to {chainKey === "sepolia" ? "Creditcoin CC3" : "Sepolia"}
              </button>
              <button
                onClick={copy}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-white/5"
                style={{ color: "var(--text-muted)" }}
              >
                {copied ? <Check size={13} /> : <Copy size={13} />}
                {copied ? "Copied" : "Copy address"}
              </button>
              <button
                onClick={() => {
                  disconnect();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-[11px] transition-colors hover:bg-white/5"
                style={{ color: "var(--text-muted)" }}
                title="Clears this site's connection state. Your wallet still lists the site as authorised."
              >
                <LogOut size={13} />
                Disconnect
              </button>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={connect}
      disabled={status === "connecting"}
      className="flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-semibold transition-colors disabled:opacity-60"
      style={{ background: "var(--accent)", color: "var(--on-accent)" }}
      title={error ?? "Connect an injected wallet"}
    >
      <Wallet size={13} />
      {status === "connecting" ? "Connecting…" : "Connect Wallet"}
    </button>
  );
}
