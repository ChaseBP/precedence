"use client";

import { Sun, Moon } from "lucide-react";
import { useTheme } from "@/lib/client/theme";

/**
 * Light/dark switch. Both icons are always in the DOM and CSS (html.light) picks the visible one,
 * so server and client render identical HTML.
 *
 * @remarks Persistence and the pre-paint application live in `lib/client/theme.tsx`. This used to
 * write localStorage without anyone reading it back, so every refresh reverted to dark.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { toggle } = useTheme();
  return (
    <button onClick={toggle} aria-label="Toggle light/dark theme" className={`btn-ghost flex h-8 w-8 items-center justify-center ${className}`}>
      <Sun size={14} className="theme-icon-dark" />
      <Moon size={14} className="theme-icon-light" />
    </button>
  );
}
