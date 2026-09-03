"use client";

/**
 * Client providers: theme, wagmi, react-query, RainbowKit.
 *
 * @remarks RainbowKit's palette follows the app's own theme rather than sitting at a fixed one, so
 * the connect modal does not arrive as a dark slab over a light page. That is why the theme
 * provider wraps the wallet providers and not the other way round.
 */
import { useState, type ReactNode } from "react";
import { RainbowKitProvider, darkTheme, lightTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider } from "wagmi";
import "@rainbow-me/rainbowkit/styles.css";
import { ThemeProvider, useTheme } from "@/lib/client/theme";
import { wagmiConfig } from "@/lib/client/wagmi";

function WalletLayer({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const accent = theme === "light" ? "#2535F5" : "#536DFE";
  return (
    <RainbowKitProvider
      modalSize="compact"
      theme={
        theme === "light"
          ? lightTheme({ accentColor: accent, borderRadius: "medium", fontStack: "system" })
          : darkTheme({ accentColor: accent, borderRadius: "medium", fontStack: "system" })
      }
    >
      {children}
    </RainbowKitProvider>
  );
}

export function Providers({ children }: { children: ReactNode }) {
  // One client per mount, created in state so a re-render never swaps it out mid-flight.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <ThemeProvider>
      <WagmiProvider config={wagmiConfig}>
        <QueryClientProvider client={queryClient}>
          <WalletLayer>{children}</WalletLayer>
        </QueryClientProvider>
      </WagmiProvider>
    </ThemeProvider>
  );
}
