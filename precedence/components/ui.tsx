import type { ReactNode } from "react";
import { Info } from "lucide-react";

/**
 * A panel.
 *
 * @remarks Padding is DEFAULTED here, not left to each call site. It used to be neither: `Card`
 * applied none, so 18 places that wrote a bare `<Card>` rendered their contents flush against the
 * border, and the places that did pass padding had drifted to eight different values (p-3 through
 * p-10) — so panels sitting side by side were spaced differently. A `p-*` in `className` still
 * wins, because Tailwind's later utility takes precedence; this only supplies a floor.
 */
export function Card({
  children,
  className = "",
  glow = false,
  rounded = "rounded-2xl",
}: {
  children: ReactNode;
  className?: string;
  glow?: boolean;
  rounded?: string;
}) {
  const hasPadding = /(^|\s)p-/.test(className);
  return (
    <div
      className={`glass ${rounded} ${hasPadding ? "" : "p-5"} ${className}`}
      style={glow ? { boxShadow: "0 0 36px -8px var(--accent-glow), inset 0 1px 0 rgba(255,255,255,0.05)" } : undefined}
    >
      {children}
    </div>
  );
}

export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="eyebrow">{children}</div>;
}

export function Badge({
  children,
  color = "var(--silver)",
  solid = false,
}: {
  children: ReactNode;
  color?: string;
  solid?: boolean;
}) {
  return (
    <span
      className="mono inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-[0.68rem] uppercase tracking-wider"
      style={{
        color: solid ? "var(--bg-0)" : color,
        background: solid ? color : `color-mix(in srgb, ${color} 14%, transparent)`,
        border: `1px solid color-mix(in srgb, ${color} 35%, transparent)`,
      }}
    >
      {children}
    </span>
  );
}

export function Dot({ color = "var(--success)", pulse = false }: { color?: string; pulse?: boolean }) {
  return <span className={`inline-block h-2 w-2 rounded-full ${pulse ? "pulse-dot" : ""}`} style={{ background: color, boxShadow: `0 0 8px ${color}` }} />;
}

export function Stat({
  label,
  value,
  sub,
  accent = false,
  color,
}: {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <Eyebrow>{label}</Eyebrow>
      <div className={`num text-2xl font-semibold ${accent && !color ? "text-gradient" : ""}`} style={color ? { color } : undefined}>
        {value}
      </div>
      {sub ? <div className="text-xs" style={{ color: "var(--text-muted)" }}>{sub}</div> : null}
    </div>
  );
}

export function ReputationBar({ score, count }: { score: number; count: number }) {
  const pctv = Math.max(0, Math.min(100, score));
  const color = pctv >= 75 ? "var(--success)" : pctv >= 45 ? "var(--warn)" : "var(--danger)";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="eyebrow">Track Record</span>
        <span className="mono" style={{ color }}>{count > 0 ? `${pctv.toFixed(0)} score · ${count} verified` : "unrated"}</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--track)" }}>
        <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${count > 0 ? pctv : 0}%`, background: color, boxShadow: `0 0 10px ${color}` }} />
      </div>
    </div>
  );
}

export function AgentGlyph({ name, size = 40 }: { name: string; size?: number }) {
  const initial = name.slice(0, 1).toUpperCase();
  return (
    <div
      className="flex shrink-0 items-center justify-center rounded-xl font-[family-name:var(--font-display)] font-semibold"
      style={{
        width: size,
        height: size,
        background: "var(--grad-soft)",
        border: "1px solid var(--border-strong)",
        fontSize: size * 0.4,
        color: "var(--text)",
      }}
    >
      {initial}
    </div>
  );
}

export function SectionTitle({ kicker, title, right }: { kicker?: string; title: string; right?: ReactNode }) {
  return (
    <div className="mb-4 flex items-end justify-between">
      <div>
        {kicker ? <Eyebrow>{kicker}</Eyebrow> : null}
        <h2 className="font-[family-name:var(--font-display)] text-xl font-semibold">{title}</h2>
      </div>
      {right}
    </div>
  );
}

/** A one-line "why this matters" annotation — decodes a mechanic for non-expert viewers. */
export function Why({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 flex items-start gap-1.5 text-xs leading-relaxed" style={{ color: "var(--text-muted)" }}>
      <Info size={12} className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }} />
      <span>{children}</span>
    </p>
  );
}
