import type { Metadata } from "next";
import { Poppins, DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { THEME_SCRIPT } from "@/lib/client/theme";
import { Toaster } from "@/components/motion/Toaster";

const poppins = Poppins({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-poppins" });
const dmSans = DM_Sans({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-dm-sans" });
const ibmPlexMono = IBM_Plex_Mono({ subsets: ["latin"], weight: ["400", "500", "600"], variable: "--font-ibm-plex-mono" });

export const metadata: Metadata = {
  title: "PRECEDENCE — The Proof-Ordered Capital Priority Protocol",
  description:
    "Real-world collateral financed by competing capital providers racing on Ethereum Sepolia. Priority settled by Attestcoin-proven ordering on Creditcoin CC3 (ERC-1155).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning className={`${poppins.variable} ${dmSans.variable} ${ibmPlexMono.variable}`}>
      <head>
        {/* Applies the stored theme BEFORE first paint. Doing this in React means the wrong theme
            paints and then swaps, which is the flash a user reads as a bug. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="antialiased">
        <Providers>
          <Toaster>{children}</Toaster>
        </Providers>
      </body>
    </html>
  );
}
