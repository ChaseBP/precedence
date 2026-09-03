"use client";

/**
 * The "you need a wallet for this" block, shared by every page that needs one.
 *
 * @remarks Two pages each rolled their own version and both had the same hole: they rendered a
 * `Connect Wallet` button, called `connect()`, and never displayed the resulting error. In a
 * browser with no injected wallet — which is most browsers, and quite possibly a judge's — the
 * button did nothing at all and looked broken. The state was there; nobody showed it.
 *
 * So this handles all four wallet states in one place: no wallet installed, not connected, on the
 * wrong chain, and connected. A page that needs a wallet renders this and cannot forget a branch.
 */
import { AlertTriangle, CheckCircle2, ExternalLink, Wallet } from "lucide-react";
import { Card } from "@/components/ui";
import { CHAINS, shortAddress, useWallet, type ChainKey } from "@/lib/client/wallet";

export function ConnectPrompt({
  need,
  why,
  children,
}: {
  /** The chain this page's action signs on. */
  need: ChainKey;
  /** One sentence on why a wallet is required here, in the user's terms. */
  why: string;
  /** Rendered instead of the prompt once the wallet is connected on `need`. */
  children?: React.ReactNode;
}) {
  const { status, address, chainKey, error, connect, switchChain } = useWallet();
  const target = CHAINS[need];

  // ── no injected wallet in this browser ──
  if (status === "unsupported") {
    return (
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <Wallet size={16} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">No wallet found in this browser</h3>
              <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                {why} That needs a browser wallet — there is deliberately no way to paste a private
                key here, because a site that asks for one is a site that can steal your funds.
              </p>
            </div>
          </div>
          <a
            href="https://metamask.io/download/"
            target="_blank"
            rel="noreferrer"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            Install MetaMask <ExternalLink size={12} />
          </a>
        </div>
      </Card>
    );
  }

  // ── installed but not connected ──
  if (status !== "connected") {
    return (
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <Wallet size={16} className="mt-0.5 shrink-0" style={{ color: "var(--text-faint)" }} />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Connect a wallet to continue</h3>
              <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                {why}
              </p>
              {/* The branch that was missing. A rejected or already-pending request used to leave
                  the button looking inert. */}
              {error ? (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px]" style={{ color: "var(--warn)" }}>
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
                </p>
              ) : null}
            </div>
          </div>
          <button
            onClick={connect}
            disabled={status === "connecting"}
            className="shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold disabled:opacity-60"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            {status === "connecting" ? "Check your wallet…" : "Connect Wallet"}
          </button>
        </div>
      </Card>
    );
  }

  // ── connected, wrong chain ──
  if (chainKey !== need) {
    return (
      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-2.5">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Switch to {target.name}</h3>
              <p className="mt-0.5 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
                {target.purpose}. You are on{" "}
                {chainKey ? CHAINS[chainKey].name : "another network"} as{" "}
                <span className="mono">{address ? shortAddress(address) : "—"}</span>.
              </p>
              {error ? (
                <p className="mt-1.5 flex items-start gap-1.5 text-[11px]" style={{ color: "var(--warn)" }}>
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
                </p>
              ) : null}
            </div>
          </div>
          <button
            onClick={() => switchChain(need)}
            className="shrink-0 rounded-lg px-3.5 py-2 text-xs font-semibold"
            style={{ background: "var(--accent)", color: "var(--on-accent)" }}
          >
            Switch network
          </button>
        </div>
      </Card>
    );
  }

  // ── ready ──
  return (
    <>
      {children ?? (
        <Card>
          <div className="flex items-center gap-2 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            <CheckCircle2 size={14} style={{ color: "var(--proof-verified)" }} />
            Signing as <span className="mono">{address ? shortAddress(address) : "—"}</span> on {target.name}.
          </div>
        </Card>
      )}
    </>
  );
}
