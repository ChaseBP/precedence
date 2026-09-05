"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Loader2, Cpu, Wallet, Fingerprint, Award, ShieldCheck, Zap } from "lucide-react";
import type { Agent, Hex } from "@/lib/precedence/types";
import { api } from "@/lib/client/api";
import { usd, pct, trancheColor } from "@/lib/client/format";
import { AgentGlyph, Badge, Card, Eyebrow, ReputationBar } from "@/components/ui";
import { LoadError } from "@/components/LoadError";
import { Stagger, Item, FadeUp } from "@/components/motion/Reveal";
import { CopyHash } from "@/components/CopyHash";

const ARCHETYPE_COLOR: Record<string, string> = {
  conservative: "var(--rank-senior)",
  balanced: "var(--rank-junior)",
  aggressive: "var(--rank-subordinate)",
};

export default function FinanciersPage() {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [creditcoinLive, setCreditcoinLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    setLoading(true);
    api.agents()
      .then((r) => {
        setAgents(r.agents);
        setCreditcoinLive(r.creditcoinLive);
      })
      .catch((e) => setErr(String(e)))
      .finally(() => setLoading(false));
  };

  // Deferred one tick: `load` sets state synchronously, which React 19 flags as a cascading
  // render when called straight from an effect body. `load` itself stays callable from the
  // Retry button, where a synchronous setState is exactly what we want.
  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (!cancelled) load();
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div>
      <FadeUp>
        <header className="mb-6">
          <Eyebrow>Autonomous Capital Fleet · Creditcoin CC3 &amp; Sepolia</Eyebrow>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
            Financier <span className="text-gradient">Fleet</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--text-muted)" }}>
            Autonomous capital providers with distinct risk mandates, locking capital on Sepolia and holding tradeable ERC-1155 priority claim tokens on Creditcoin CC3.
          </p>
        </header>
      </FadeUp>

      <Card className="mb-5 flex flex-wrap items-center gap-x-8 gap-y-2 p-4 text-xs">
        <span className="flex items-center gap-2">
          <span
            className={`inline-block h-2 w-2 rounded-full ${creditcoinLive ? "pulse-dot" : ""}`}
            style={{ background: creditcoinLive ? "var(--success)" : "var(--text-faint)" }}
          />
          {creditcoinLive
            ? "Reading live priority claims from Creditcoin CC3"
            : "Attestcoin 0x0FD2 & Creditcoin CC3 testnet adapter active"}
        </span>
        <div className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
          PriorityEngine: <span className="mono">0x0FD2 Precompile Connected</span>
        </div>
        <div className="flex items-center gap-1.5" style={{ color: "var(--text-muted)" }}>
          Decoder: <span className="mono">0x731c345d…F849F9f</span>
        </div>
      </Card>

      {err ? (
        <LoadError what="the financier fleet" detail={err} onRetry={load} />
      ) : loading ? (
        <div className="flex items-center gap-2 py-20 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="animate-spin" size={16} /> Connecting to financier fleet…
        </div>
      ) : (
        // Was lg:grid-cols-3 with four agents, which stranded the fourth alone on a second row.
        // Two columns give a balanced 2x2 at desktop widths.
        <Stagger className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {agents.map((a) => (
            <Item key={a.id} className="h-full">
              <motion.div whileHover={{ y: -4, scale: 1.01 }} transition={{ duration: 0.2 }} className="h-full">
                <Card className="flex h-full flex-col gap-4 p-5">
                  <div className="flex items-center gap-3">
                    <AgentGlyph name={a.name} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between">
                        <div className="font-[family-name:var(--font-display)] text-lg font-semibold">{a.name}</div>
                        {/* A prover does not bid for a rank, so its `preferredTranche` is an
                            unused default — and rendering it labelled Kestrel SENIOR, which reads
                            as an Attestcoin prover competing for a senior lien. Provers earn the
                            first-valid-proof fee; they hold no priority position. */}
                        {a.role === "prover" ? (
                          <Badge color="var(--proof-verified)">PROVER</Badge>
                        ) : (
                          <Badge color={ARCHETYPE_COLOR[a.policy.riskTolerance] ?? "var(--silver)"}>
                            {a.policy.preferredTranche}
                          </Badge>
                        )}
                      </div>
                      <div className="eyebrow mt-0.5">{a.mandate}</div>
                    </div>
                  </div>

                  <p className="text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
                    {a.persona}
                  </p>

                  <ReputationBar score={a.reputation.avgScore} count={a.reputation.count} />

                  <div className="grid grid-cols-2 gap-3 text-sm">
                    {/* These are different quantities and the old labels did not say so, so a
                        wallet holding slightly more than its own per-position cap read as a
                        contradiction. They are a balance and a policy limit. */}
                    <div>
                      <Eyebrow>Wallet balance</Eyebrow>
                      <div className="mono mt-0.5 font-semibold">{usd(a.balanceUsd)}</div>
                    </div>
                    <div>
                      <Eyebrow>Cap per position</Eyebrow>
                      <div className="mono mt-0.5 font-semibold">{usd(a.policy.maxCapitalUsd)}</div>
                      {a.balanceUsd > a.policy.maxCapitalUsd ? (
                        <div className="text-[10px]" style={{ color: "var(--text-faint)" }}>
                          policy limit, not a shortfall
                        </div>
                      ) : null}
                    </div>
                    <div>
                      <Eyebrow>Min Rate Floor</Eyebrow>
                      <div className="mono mt-0.5 font-semibold">{pct(a.policy.minRatePct)}</div>
                    </div>
                    <div>
                      <Eyebrow>Claims Settled</Eyebrow>
                      <div className="mono mt-0.5 font-semibold">{a.stats.racesWon} won</div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 border-t pt-3" style={{ borderColor: "var(--border)" }}>
                    <div className="flex items-center gap-2 text-xs">
                      <Fingerprint size={13} style={{ color: "var(--accent)" }} />
                      <span className="eyebrow">ERC-1155 Claim Token #{a.identity.tokenId}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Wallet size={13} style={{ color: "var(--silver)" }} className="shrink-0" />
                      <CopyHash value={a.wallet.address} className="min-w-0 flex-1" />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <Cpu size={13} style={{ color: "var(--silver)" }} />
                      <span style={{ color: "var(--text-faint)" }}>
                        {a.role === "prover" ? "Attestcoin Proof Delivery Engine" : "Creditcoin Policy Runtime"}
                      </span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </Item>
          ))}
        </Stagger>
      )}
    </div>
  );
}
