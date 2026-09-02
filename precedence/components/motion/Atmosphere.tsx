"use client";

/**
 * Animated backdrop — a few soft drifting orbs + sparse rising particles.
 * Pure CSS transform/opacity (GPU), capped counts, disabled under
 * prefers-reduced-motion via the global reset. Mounted once in the root layout.
 */
const ORBS = [
  { color: "var(--accent)", size: 420, top: "-8%", left: "2%", anim: "precedence-orb-1", dur: 24 },
  { color: "#6d4bd6", size: 340, top: "26%", left: "76%", anim: "precedence-orb-2", dur: 28 },
  { color: "var(--accent-dim)", size: 300, top: "70%", left: "38%", anim: "precedence-orb-3", dur: 32 },
];

export function Atmosphere() {
  return (
    <div className="atmo" aria-hidden>
      {ORBS.map((o, i) => (
        <div
          key={i}
          className="atmo-orb"
          style={{
            width: o.size,
            height: o.size,
            top: o.top,
            left: o.left,
            background: `radial-gradient(circle, ${o.color}22, transparent 70%)`,
            animation: `${o.anim} ${o.dur}s ease-in-out infinite`,
          }}
        />
      ))}
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={`p${i}`}
          className="atmo-particle"
          style={{
            left: `${(i * 8.3 + 5) % 100}%`,
            bottom: "-12px",
            animation: `precedence-rise ${10 + (i % 5) * 2}s linear ${i * 0.8}s infinite`,
          }}
        />
      ))}
    </div>
  );
}
