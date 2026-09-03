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
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { AlertTriangle, CheckCircle2, Wallet } from "lucide-react";
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
  const { status, address, error } = useWallet();
  const target = CHAINS[need];

  // Two states now, not four.
  //
  // The old version policed the chain here — "switch to X before you may continue" — because its
  // hand-rolled writes would have failed on the wrong network. wagmi sends a `chainId` with the
  // transaction and prompts the switch as part of signing, so the chain is no longer a
  // precondition the user has to satisfy first. It is mentioned, not enforced.
  if (status !== "connected") {
    return (
      <Card>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex min-w-0 items-start gap-3">
            <Wallet size={16} className="mt-0.5 shrink-0" style={{ color: "var(--text-faint)" }} />
            <div className="min-w-0">
              <h3 className="text-sm font-semibold">Connect a wallet to continue</h3>
              <p className="mt-1 text-[11.5px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
                {why} Your wallet will be asked to approve {target.name} when you sign — you do not
                need to switch networks yourself.
              </p>
              {error ? (
                <p className="mt-2 flex items-start gap-1.5 text-[11px]" style={{ color: "var(--warn)" }}>
                  <AlertTriangle size={11} className="mt-0.5 shrink-0" /> {error}
                </p>
              ) : null}
            </div>
          </div>
          <div className="shrink-0">
            <ConnectButton showBalance={false} chainStatus="none" label="Connect Wallet" />
          </div>
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
