import type { Metadata } from "next";
import { Poppins, DM_Sans, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { WalletProvider } from "@/lib/client/wallet";

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
      <body className="antialiased">
        <WalletProvider>{children}</WalletProvider>
      </body>
    </html>
  );
}
