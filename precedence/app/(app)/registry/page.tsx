"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, ChevronRight, ShieldCheck, FileText, CheckCircle2, Lock, Sparkles } from "lucide-react";
import type { RaceSummary } from "@/lib/precedence/types";
import { api } from "@/lib/client/api";
import { usd, pct, dateOf, encumbranceColor } from "@/lib/client/format";
import { Badge, Card, Eyebrow } from "@/components/ui";
import { LoadError } from "@/components/LoadError";
import { Stagger, Item, FadeUp } from "@/components/motion/Reveal";

type Filter = "all" | "settled" | "in-progress" | "rejected";

const OUTCOME_COLOR: Record<string, string> = {
  won: "var(--state-encumbered)",
  settled: "var(--state-encumbered)",
  rejected: "var(--text-faint)",
  "in-progress": "var(--warn)",
};

export default function RegistryPage() {
  const [rows, setRows] = useState<RaceSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  const [err, setErr] = useState<string | null>(null);

  const load = () => {
    setErr(null);
    setLoading(true);
    api.races()
      .then((r) => setRows(r.races ?? []))
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

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "settled") return rows.filter((r) => r.outcome === "won");
    return rows.filter((r) => r.outcome === filter);
  }, [rows, filter]);

  return (
    <div>
      <FadeUp>
        <header className="mb-6">
          <Eyebrow>Self-Populating Encumbrance Registry · Creditcoin CC3</Eyebrow>
          <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold tracking-tight">
            The <span className="text-gradient">Registry</span>
          </h1>
          <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--text-muted)" }}>
            The registry nobody had to join. Every proof-ordered financing race automatically writes its lien structure to Creditcoin CC3 — double-pledging stops being possible to commit.
          </p>
        </header>
      </FadeUp>

      <div className="mb-4 flex gap-2">
        {(["all", "settled", "in-progress", "rejected"] as Filter[]).map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className="rounded-lg px-3 py-1.5 text-xs capitalize transition-colors"
            style={{
              background: filter === f ? "var(--grad-soft)" : "transparent",
              border: `1px solid ${filter === f ? "var(--border-strong)" : "var(--border)"}`,
              color: filter === f ? "var(--text)" : "var(--text-muted)",
            }}
          >
            {f}
          </button>
        ))}
      </div>

      {err ? (
        <LoadError what="the encumbrance registry" detail={err} onRetry={load} />
      ) : loading ? (
        <div className="flex items-center gap-2 py-20 text-sm" style={{ color: "var(--text-muted)" }}>
          <Loader2 className="animate-spin" size={16} /> Reading encumbrance registry…
        </div>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center text-sm">
          <span style={{ color: "var(--text-faint)" }}>No records found. Open a priority race from the Collateral Scanner.</span>
        </Card>
      ) : (
        <Stagger className="flex flex-col gap-2.5">
          {filtered.map((r) => (
            <Item key={r.id}>
              <Link href={`/race?id=${r.id}`}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4 transition-colors hover:border-[var(--border-strong)]">
                  <div className="flex items-center gap-4">
                    <div>
                      <div className="font-[family-name:var(--font-display)] font-semibold">{r.collateralSymbol}</div>
                      <div className="eyebrow mt-0.5">
                        {dateOf(r.createdAt)} · Obligor {r.obligor} · {r.bidCount} competing financiers
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-x-5 gap-y-2">
                    <div className="text-right">
                      <Eyebrow>Capital Locked</Eyebrow>
                      <div className="mono text-sm font-semibold">{usd(r.totalCapitalUsd)}</div>
                    </div>
                    <div className="text-right">
                      <Eyebrow>Senior Lien</Eyebrow>
                      <div className="mono text-sm font-semibold capitalize" style={{ color: "var(--rank-senior)" }}>
                        {r.seniorFinancier ?? "Pending"}
                      </div>
                    </div>
                    <Badge
                      color={
                        r.outcome === "won"
                          ? "var(--state-encumbered)"
                          : r.outcome === "defaulted"
                            ? "var(--state-breached)"
                            : "var(--warn)"
                      }
                    >
                      {r.status.replace(/_/g, " ")}
                    </Badge>
                    <ChevronRight size={16} color="var(--text-faint)" />
                  </div>
                </Card>
              </Link>
            </Item>
          ))}
        </Stagger>
      )}
    </div>
  );
}
