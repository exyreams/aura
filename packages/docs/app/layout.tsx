import { RootProvider } from "fumadocs-ui/provider/next";
import "./global.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";

const inter = Inter({
  subsets: ["latin"],
});

const siteUrl =
  process.env.NEXT_PUBLIC_DOCS_URL ??
  process.env.NEXT_PUBLIC_SITE_URL ??
  "https://docs-auraprotocol.vercel.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "AURA Documentation",
    template: "%s | AURA Documentation",
  },
  description:
    "Production documentation for AURA programs, SDKs, CLI, web app, and backend services.",
  icons: {
    icon: [
      { url: "/favicon-dark.ico", media: "(prefers-color-scheme: dark)" },
      { url: "/favicon-light.ico", media: "(prefers-color-scheme: light)" },
    ],
    shortcut: "/favicon.ico",
  },
  openGraph: {
    title: "AURA Documentation",
    description:
      "Build policy-aware autonomous treasury agents with AURA programs, SDKs, CLI, web app, and backend services.",
    images: ["/og/docs/image.png"],
  },
  twitter: {
    card: "summary_large_image",
    title: "AURA Documentation",
    description:
      "Build policy-aware autonomous treasury agents with AURA programs, SDKs, CLI, web app, and backend services.",
    images: ["/og/docs/image.png"],
  },
};

export default function Layout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <body className="flex flex-col min-h-screen" suppressHydrationWarning>
        <RootProvider>{children}</RootProvider>
      </body>
    </html>
  );
}
