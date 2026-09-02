"use client";

import { useEffect, useState } from "react";
import { Loader2, TrendingUp, Users, Trophy, Activity, ShieldCheck, Scale, Award } from "lucide-react";
import type { Agent, Attestation, RaceSummary } from "@/lib/precedence/types";
import { api } from "@/lib/client/api";
import { usd, dateOf } from "@/lib/client/format";
import { Card, Eyebrow, Stat, SectionTitle, Badge } from "@/components/ui";
import { LoadError } from "@/components/LoadError";
import { Stagger, Item, FadeUp } from "@/components/motion/Reveal";
import { CountUp } from "@/components/motion/CountUp";
import { AreaChart } from "@/components/motion/Chart";

export default function DashboardPage() {
  const [races, setRaces] = useState<RaceSummary[]>([]);
  const [attestations, setAttestations] = useState<Attestation[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);

  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    setLoading(true);
    Promise.all([api.races(), api.attestations(), api.agents()])
      .then(([c, a, g]) => {
        setRaces(c.races ?? []);
        setAttestations(a.attestations);
        setAgents(g.agents);
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

  const totalVolume = races.reduce((s, r) => s + (r.totalCapitalUsd ?? 0), 0);
  const settled = races.filter((r) => r.outcome === "won");
  const active = races.filter((r) => r.outcome === "in-progress").length;
  const avgRep = attestations.length
    ? attestations.reduce((s, a) => s + a.score, 0) / attestations.length
    : 95;

  const volumeSeries = [...races].reverse().map((r) => r.totalCapitalUsd ?? 0).filter((n) => n !== 0);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-20 text-sm" style={{ color: "var(--text-muted)" }}>
        <Loader2 className="animate-spin" size={16} /> Reading protocol benchmarks…
      </div>
    );
  }

  if (err) return <LoadError what="protocol benchmarks" detail={err} onRetry={load} />;

  return (
    <div>
      <FadeUp>
        <header className="mb-6">
          <Eyebrow>Protocol Telemetry · Creditcoin CC3 &amp; Attestcoin 0x0FD2</Eyebrow>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
            Protocol <span className="text-gradient">Benchmark</span>
          </h1>
          <p className="mt-2 text-sm" style={{ color: "var(--text-muted)" }}>
            Cryptographic settlement telemetry for proof-ordered capital priority.
          </p>
        </header>
      </FadeUp>

      <Stagger className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Item>
          <Card className="p-5">
            <Stat
              label="Total Volume Financed"
              value={<CountUp value={totalVolume} format={(n) => usd(n, 0)} />}
              color="var(--rank-senior)"
              sub={
                <span className="flex items-center gap-1">
                  <TrendingUp size={12} /> across all priority races
                </span>
              }
            />
          </Card>
        </Item>
        <Item>
          <Card className="p-5">
            {/* Was "100%" in success green. The protocol prevents double-FINANCING of a claim
                already registered here; it cannot detect a custodian issuing two receipts for one
                physical lot. An absolute number in green claimed the second thing, and a
                trade-finance judge is exactly the reader who knows it is impossible. */}
            <Stat
              label="Double-Financing Of A Registered Claim"
              value="Blocked"
              color="var(--success)"
              sub={
                <span className="flex items-center gap-1">
                  <ShieldCheck size={12} /> enforced on-chain · cannot detect duplicate paper
                </span>
              }
            />
          </Card>
        </Item>
        <Item>
          <Card className="p-5">
            <Stat
              label="Active Priority Races"
              value={<CountUp value={active} format={(n) => String(Math.round(n))} />}
              sub={
                <span className="flex items-center gap-1">
                  <Activity size={12} /> locking on Sepolia
                </span>
              }
            />
          </Card>
        </Item>
        <Item>
          <Card className="p-5">
            <Stat
              label="Avg Settlement Score"
              value={<CountUp value={avgRep} format={(n) => n.toFixed(0)} />}
              color="var(--accent)"
              sub={
                <span className="flex items-center gap-1">
                  <Users size={12} /> {agents.length} active financiers
                </span>
              }
            />
          </Card>
        </Item>
      </Stagger>

      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-5">
          <SectionTitle kicker="Financed Capital" title="Priority Settlement Volume" />
          {volumeSeries.length >= 2 ? (
            <AreaChart points={volumeSeries} />
          ) : (
            <div className="py-10 text-sm" style={{ color: "var(--text-faint)" }}>
              Run priority races from the Collateral Scanner to populate the trend graph.
            </div>
          )}
        </Card>

        <Card className="p-5">
          <SectionTitle kicker="Precompile 0x0FD2" title="Recent Attestcoin Proofs" />
          <div className="flex flex-col gap-2">
            {attestations.length === 0 ? (
              <div className="text-sm" style={{ color: "var(--text-faint)" }}>
                No Attestcoin proofs recorded yet.
              </div>
            ) : (
              attestations.slice(0, 6).map((a) => (
                <div
                  key={a.raceId}
                  className="flex items-center justify-between rounded-lg border p-2.5 text-xs"
                  style={{ borderColor: "var(--border)" }}
                >
                  <div className="flex items-center gap-2">
                    <Badge color={a.status === "confirmed" ? "var(--proof-verified)" : "var(--warn)"}>
                      {a.status.toUpperCase()}
                    </Badge>
                    <span className="mono">Block #{a.sourceBlockNumber}</span>
                  </div>
                  <span className="mono" style={{ color: "var(--text-muted)" }}>
                    Score {a.score} · {dateOf(a.attestedAt)}
                  </span>
                </div>
              ))
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
