import type { Metadata } from "next";
import "@solana/wallet-adapter-react-ui/styles.css";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "AURA Dashboard",
  description:
    "AURA is the control plane for AI treasury agents with policy-aware execution and confidential guardrails.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
