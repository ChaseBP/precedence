"use client";

import { useId } from "react";
import { motion } from "motion/react";

/** Lightweight SVG area chart with a one-shot path draw-in. No chart library. */
export function AreaChart({
  points,
  width = 560,
  height = 150,
  color = "var(--accent)",
}: {
  points: number[];
  width?: number;
  height?: number;
  color?: string;
}) {
  const gid = useId().replace(/:/g, "");
  if (points.length < 2) return null;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const xs = (i: number) => (i / (points.length - 1)) * width;
  const ys = (p: number) => height - ((p - min) / span) * (height - 18) - 9;
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${xs(i).toFixed(1)},${ys(p).toFixed(1)}`).join(" ");
  const area = `${line} L${width},${height} L0,${height} Z`;

  return (
    <svg width="100%" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" style={{ display: "block" }}>
      <defs>
        <linearGradient id={`area-${gid}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.3" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <motion.path d={area} fill={`url(#area-${gid})`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.6, delay: 0.35 }} />
      <motion.path
        d={line}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
      />
    </svg>
  );
}
