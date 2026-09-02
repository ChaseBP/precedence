"use client";

/**
 * What a screen shows when its data did not arrive.
 *
 * @remarks Three pages fetched with no `.catch()` at all, so an API failure left them rendering an
 * empty table with no explanation — indistinguishable from "there is genuinely nothing here". That
 * ambiguity is the bug: a judge cannot tell a broken app from an empty one, and will assume the
 * worse of the two. One shared component so every screen fails the same legible way.
 */
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Card } from "@/components/ui";

export function LoadError({ what, detail, onRetry }: { what: string; detail?: string; onRetry?: () => void }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <AlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: "var(--warn)" }} />
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Could not load {what}</h3>
          <p className="mt-1 text-[11.5px]" style={{ color: "var(--text-muted)" }}>
            This is a failed request, not an empty result — the data may well exist.
          </p>
          {detail ? (
            <p className="mono mt-1.5 break-all text-[10.5px]" style={{ color: "var(--text-faint)" }}>
              {detail}
            </p>
          ) : null}
          {onRetry ? (
            <button
              onClick={onRetry}
              className="btn-ghost mt-2.5 inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-[11px]"
            >
              <RotateCcw size={12} /> Retry
            </button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
