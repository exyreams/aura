"use client";

import { Mail } from "lucide-react";
import { m, type Variants } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { DEFAULT_DOCS_URL } from "@/lib/settings";

// SVG icons not available in lucide-react v1.x
function TwitterXIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-4.714-6.231-5.401 6.231H2.744l7.737-8.835L1.254 2.25H8.08l4.253 5.622 5.911-5.622Zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function DiscordIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z" />
    </svg>
  );
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z" />
    </svg>
  );
}

const PRODUCT_LINKS = [
  { label: "The Problem", href: "#problem" },
  { label: "Technology", href: "#fhe" },
  { label: "Features", href: "#features" },
  { label: "Ecosystem", href: "#ecosystem" },
  { label: "How It Works", href: "#how-it-works" },
  { label: "FAQ", href: "#faq" },
];

const containerVariants: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.08 },
  },
};

const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" } },
};

export function Footer() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const logoSrc =
    !mounted || resolvedTheme === "dark"
      ? "/dark-logo-wordmark.svg"
      : "/light-logo-wordmark.svg";
  const docsUrl = DEFAULT_DOCS_URL;

  return (
    <footer className="border-t border-border py-16 px-6 md:px-[4vw]">
      <div className="max-w-7xl mx-auto">
        <m.div
          className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12"
          variants={containerVariants}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-60px" }}
        >
          {/* Brand */}
          <m.div className="space-y-4" variants={itemVariants}>
            <div className="flex items-center">
              <Image
                src={logoSrc}
                alt="AURA"
                width={80}
                height={20}
                className="h-5 w-auto"
                suppressHydrationWarning
              />
            </div>
            <p className="text-sm text-(--text-muted) leading-relaxed">
              Encrypted guardrails for autonomous AI agent treasuries on Solana.
              Secured by FHE and multi-chain dWallets.
            </p>
            <div className="flex items-center gap-2 pt-1">
              <div className="size-2 rounded-full bg-primary animate-pulse" />
              <span className="font-mono text-[9px] uppercase text-(--text-muted)">
                Devnet Live
              </span>
            </div>
          </m.div>

          {/* Product */}
          <m.div variants={itemVariants}>
            <h4 className="font-mono text-[10px] uppercase tracking-widest text-(--text-main) mb-4">
              Product
            </h4>
            <ul className="space-y-3">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                  >
                    {link.label}
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
              <li>
                <a
                  href={docsUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  Documentation
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/aura-protocol"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  GitHub
                </a>
              </li>
              <li>
                <Link
                  href="/dashboard"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  Dashboard
                </Link>
              </li>
              <li>
                <Link
                  href="#faq"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  FAQ
                </Link>
              </li>
            </ul>
          </m.div>

          {/* Community */}
          <m.div variants={itemVariants}>
            <h4 className="font-mono text-[10px] uppercase tracking-widest text-(--text-main) mb-4">
              Community
            </h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="https://twitter.com/aura_protocol"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors flex items-center gap-2"
                >
                  <TwitterXIcon className="size-4 shrink-0" />
                  Twitter / X
                </a>
              </li>
              <li>
                <a
                  href="https://discord.gg/aura"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors flex items-center gap-2"
                >
                  <DiscordIcon className="size-4 shrink-0" />
                  Discord
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/aura-protocol"
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors flex items-center gap-2"
                >
                  <GitHubIcon className="size-4 shrink-0" />
                  GitHub
                </a>
              </li>
              <li>
                <a
                  href="mailto:hello@aura-protocol.com"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors flex items-center gap-2"
                >
                  <Mail className="size-4 shrink-0" />
                  hello@aura-protocol.com
                </a>
              </li>
            </ul>
          </m.div>
        </m.div>

        {/* Bottom Bar */}
        <m.div
          className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4"
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.3 }}
        >
          <div className="font-mono text-[10px] text-(--text-muted)">
            © 2026 AURA PROTOCOL LABS
          </div>
          <div className="flex items-center gap-6">
            <span className="font-mono text-[9px] uppercase text-(--text-muted)">
              Program: <span className="text-(--text-main)">EaRoLV…bhHs</span>
            </span>
            <div className="flex items-center gap-2">
              <div className="size-2 rounded-full bg-primary animate-pulse" />
              <span className="font-mono text-[9px] uppercase text-(--text-muted)">
                Encrypt Net Active
              </span>
            </div>
          </div>
        </m.div>
      </div>
    </footer>
  );
}
