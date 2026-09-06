"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Loader2, ChevronRight, ShieldCheck, FileText, CheckCircle2, Lock, Sparkles } from "lucide-react";
import type { RaceSummary } from "@/lib/precedence/types";
import { api } from "@/lib/client/api";
import { usd, pct, dateOf, encumbranceColor } from "@/lib/client/format";
import { Badge, Card, Eyebrow } from "@/components/ui";
import { LoadError } from "@/components/LoadError";
import { Stagger, Item, FadeUp } from "@/components/motion/Reveal";

type Filter = "all" | "settled" | "in-progress" | "rejected";

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

  const countFor = useCallback(
    (f: Filter) =>
      f === "all"
        ? rows.length
        : f === "settled"
          ? rows.filter((r) => r.outcome === "won").length
          : rows.filter((r) => r.outcome === f).length,
    [rows],
  );

  const filtered = useMemo(() => {
    if (filter === "all") return rows;
    if (filter === "settled") return rows.filter((r) => r.outcome === "won");
    return rows.filter((r) => r.outcome === filter);
  }, [rows, filter]);

  return (
    <div>
      <FadeUp>
        {/* The registry is a RECORD of past races. It listed them with no way to start one, so a
            borrower arriving here had nowhere to go — the action belongs next to the thing it
            acts on, not only in the nav. */}
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Eyebrow>Self-Populating Lien Registry · Creditcoin CC3</Eyebrow>
            <h1 className="mt-1 font-[family-name:var(--font-display)] text-3xl font-bold leading-tight tracking-tight">
              Lien registry
            </h1>
            <p className="mt-2 max-w-xl text-sm" style={{ color: "var(--text-muted)" }}>
              The registry nobody had to join. Every proof-ordered financing race automatically writes its lien structure to Creditcoin CC3 — double-pledging stops being possible to commit.
            </p>
          </div>
          <Link
            href="/registry/new"
            className="btn-primary shrink-0 px-3.5 py-2 text-xs font-semibold"
          >
            Register collateral
          </Link>
        </header>
      </FadeUp>

      <div className="mb-4 flex gap-2">
        {/* Counts on the tabs. Two rows in a tall viewport looked like a page that had failed to
            load; "All (2)" makes it read as the registry genuinely holding two records. */}
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
            {f} ({countFor(f)})
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
          <span style={{ color: "var(--text-faint)" }}>No records found. Open a facility and start a settlement from Facilities.</span>
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
                      <Eyebrow>First Claim</Eyebrow>
                      <div className="mono text-sm font-semibold capitalize" style={{ color: "var(--rank-senior)" }}>
                        {r.seniorFinancier || "Pending"}
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
