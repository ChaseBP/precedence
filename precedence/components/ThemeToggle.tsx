"use client";

import { Sun, Moon } from "lucide-react";

/**
 * Light/dark switch. Both icons are always in the DOM and CSS (html.light)
 * picks the visible one — server and client render identical HTML, so there
 * is no hydration branch. The toggle reads truth from the DOM itself.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const toggle = () => {
    const next = !document.documentElement.classList.contains("light");
    document.documentElement.classList.toggle("light", next);
    try { localStorage.setItem("precedence-theme", next ? "light" : "dark"); } catch { /* private mode */ }
  };
  return (
    <button onClick={toggle} aria-label="Toggle light/dark theme" className={`btn-ghost flex h-8 w-8 items-center justify-center ${className}`}>
      <Sun size={14} className="theme-icon-dark" />
      <Moon size={14} className="theme-icon-light" />
    </button>
  );
}
