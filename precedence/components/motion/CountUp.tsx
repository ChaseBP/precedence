"use client";

import { useEffect, useState } from "react";
import { animate, useReducedMotion } from "motion/react";

/** Animated number that tweens 0 → value (GPU-light, no loop). Re-runs if the value changes. */
export function CountUp({ value, format, duration = 1.1 }: { value: number; format: (n: number) => string; duration?: number }) {
  const [display, setDisplay] = useState(0);
  const reduced = useReducedMotion();

  useEffect(() => {
    if (reduced) return;
    const controls = animate(0, value, { duration, ease: [0.16, 1, 0.3, 1], onUpdate: setDisplay });
    return () => controls.stop();
  }, [value, duration, reduced]);

  return <>{format(reduced ? value : display)}</>;
}
