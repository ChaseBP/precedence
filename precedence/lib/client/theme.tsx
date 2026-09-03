"use client";

/**
 * Theme state, persisted and applied before first paint.
 *
 * @remarks Two bugs lived here. The toggle wrote `localStorage` but nothing ever read it back, so
 * a refresh always returned to dark; and dark was the default because "no class" meant dark.
 *
 * The class is now applied by a blocking inline script in `<head>` (see `ThemeScript`) rather than
 * by React, because applying it after hydration means the wrong theme paints first and the page
 * visibly flashes. React then reads the class the script already set, so server and client agree.
 */
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
export const DEFAULT_THEME: Theme = "light";
const KEY = "precedence-theme";

/**
 * Runs before paint. Kept as a plain string so it can be inlined in `<head>` — anything imported
 * would execute too late and the wrong theme would flash.
 */
export const THEME_SCRIPT = `(function(){try{var t=localStorage.getItem('${KEY}');if(t!=='light'&&t!=='dark'){t='${DEFAULT_THEME}';}document.documentElement.classList.toggle('light',t==='light');}catch(e){document.documentElement.classList.toggle('light',${DEFAULT_THEME === "light"});}})();`;

const Ctx = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }>({
  theme: DEFAULT_THEME,
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  // Starts at the default so the server and the first client render agree; the effect below
  // reconciles with whatever the inline script actually applied.
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    let cancelled = false;
    void Promise.resolve().then(() => {
      if (cancelled) return;
      const applied: Theme = document.documentElement.classList.contains("light") ? "light" : "dark";
      setThemeState(applied);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.classList.toggle("light", t === "light");
    try {
      localStorage.setItem(KEY, t);
    } catch {
      // Private mode: the theme still applies for this page, it just will not persist.
    }
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => {
    setTheme(document.documentElement.classList.contains("light") ? "dark" : "light");
  }, [setTheme]);

  return <Ctx.Provider value={{ theme, setTheme, toggle }}>{children}</Ctx.Provider>;
}

export const useTheme = () => useContext(Ctx);
