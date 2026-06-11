"use client";

import { m, type Variants } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const containerVariants: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.08 } },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

const DOCS_LINKS = [
  { label: "Introduction", href: "/overview" },
  { label: "Architecture", href: "/overview/architecture" },
  { label: "Quick Start", href: "/overview/quickstart" },
  { label: "Key Concepts", href: "/overview/concepts" },
];

const SDK_LINKS = [
  { label: "Program Reference", href: "/program" },
  { label: "TypeScript SDK", href: "/sdk-ts" },
  { label: "CLI Reference", href: "/cli" },
  { label: "Rust SDK", href: "/sdk-rs" },
];

const RESOURCE_LINKS = [
  {
    label: "GitHub",
    href: "https://github.com/aura-protocol/aura",
    external: true,
  },
  { label: "Policy Engine", href: "/overview/policy-engine" },
  {
    label: "Confidential Guardrails",
    href: "/overview/confidential-guardrails",
  },
  { label: "dWallet Execution", href: "/overview/dwallet-execution" },
];

export function DocsFooter() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const isDark = !mounted || resolvedTheme === "dark";
  const logoSrc = isDark
    ? "/dark-logo-wordmark.svg"
    : "/light-logo-wordmark.svg";

  return (
    <footer className="mt-0">
      <div
        className={[
          "w-full rounded-tl-[14px] rounded-tr-[14px] px-8 md:px-12 py-12 backdrop-blur-lg",
          "transition-[background-color,border-color,box-shadow] duration-300",
          isDark
            ? "bg-[rgba(28,28,32,0.92)] border border-[rgba(255,255,255,0.12)] border-b-0 shadow-[0_-8px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)]"
            : "bg-[rgba(255,255,255,0.85)] border border-[rgba(0,0,0,0.1)] border-b-0 shadow-[0_-8px_40px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]",
        ].join(" ")}
      >
        <m.div
          className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12 mb-12"
          variants={containerVariants}
          initial="visible"
          animate="visible"
        >
          {/* Brand */}
          <m.div className="space-y-4">
            <Image
              src={logoSrc}
              alt="AURA"
              width={80}
              height={20}
              className="h-5 w-auto"
              suppressHydrationWarning
            />
            <p className="text-sm text-(--text-muted) leading-relaxed">
              Encrypted guardrails for autonomous AI agent treasuries on Solana.
              Secured by FHE and multi-chain dWallets.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <div className="size-2 rounded-full bg-(--primary) animate-pulse" />
              <span className="font-mono text-[9px] uppercase text-(--text-muted)">
                Devnet · Pre-alpha
              </span>
            </div>
          </m.div>

          {/* Docs */}
          <m.div variants={itemVariants}>
            <h4 className="font-mono text-[10px] uppercase tracking-widest text-(--text-main) mb-4">
              Documentation
            </h4>
            <ul className="space-y-3">
              {DOCS_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors inline-block px-2 py-1 -mx-2 rounded-md"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </m.div>

          {/* SDKs */}
          <m.div variants={itemVariants}>
            <h4 className="font-mono text-[10px] uppercase tracking-widest text-(--text-main) mb-4">
              SDKs & Tools
            </h4>
            <ul className="space-y-3">
              {SDK_LINKS.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="text-sm text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors inline-block px-2 py-1 -mx-2 rounded-md"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </m.div>

          {/* Resources */}
          <m.div variants={itemVariants}>
            <h4 className="font-mono text-[10px] uppercase tracking-widest text-(--text-main) mb-4">
              Resources
            </h4>
            <ul className="space-y-3">
              {RESOURCE_LINKS.map((l) => (
                <li key={l.href}>
                  {l.external ? (
                    <a
                      href={l.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors inline-flex items-center gap-1.5 px-2 py-1 -mx-2 rounded-md"
                    >
                      {l.label}
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        aria-hidden="true"
                      >
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                        <polyline points="15 3 21 3 21 9" />
                        <line x1="10" y1="14" x2="21" y2="3" />
                      </svg>
                    </a>
                  ) : (
                    <Link
                      href={l.href}
                      className="text-sm text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors inline-block px-2 py-1 -mx-2 rounded-md"
                    >
                      {l.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </m.div>
        </m.div>

        {/* Bottom bar */}
        <m.div className="max-w-7xl mx-auto pt-6 border-t border-(--border) flex flex-col sm:flex-row justify-between items-center gap-3">
          <span className="font-mono text-[10px] text-(--text-muted)">
            © 2026 AURA PROTOCOL LABS
          </span>
          <div className="flex items-center gap-6">
            <span className="font-mono text-[9px] uppercase text-(--text-muted)">
              Program:{" "}
              <span className="text-(--text-main) normal-case">
                auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce
              </span>
            </span>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-(--primary) animate-pulse" />
              <span className="font-mono text-[9px] uppercase text-(--text-muted)">
                Devnet Active
              </span>
            </div>
          </div>
        </m.div>
      </div>
    </footer>
  );
}
