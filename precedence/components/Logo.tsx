/**
 * PRECEDENCE Logo Mark — The Proof-Ordered Priority Primitive.
 *
 * Ordered claims: three stacked, forward-nested priority chevrons where the
 * senior lien is unmistakably first (#1 priority). Monochrome via CSS variables
 * var(--logo-edge-a) and var(--logo-edge-b).
 */

export const LOGO_PATHS: { d: string; color: string; width: number }[] = [
  { d: "M6 6 L18 16 L6 26", color: "var(--logo-edge-a)", width: 4 }, // Senior (Rank 1 - First)
  { d: "M14 6 L24 16 L14 26", color: "var(--logo-edge-b)", width: 3 }, // Junior (Rank 2)
  { d: "M21 7 L29 16 L21 25", color: "var(--logo-edge-b)", width: 2.2 }, // Subordinate (Rank 3)
];

export function Logo({ size = 32 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden>
      {LOGO_PATHS.map((p, i) => (
        <path
          key={i}
          d={p.d}
          stroke={p.color}
          strokeWidth={p.width}
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}
