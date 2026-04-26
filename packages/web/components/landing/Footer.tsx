import { Mail, MessageSquare } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

export function Footer() {
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const logoSrc =
    !mounted || resolvedTheme === "dark" ? "/logo-dark.svg" : "/logo-light.svg";

  return (
    <footer className="border-t border-border py-16 px-6 md:px-[4vw]">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-12">
          {/* Brand */}
          <div className="space-y-4">
            <div className="flex items-center">
              <Image
                src={logoSrc}
                alt="AURA"
                width={80}
                height={20}
                className="h-5 w-auto"
              />
            </div>
            <p className="text-sm text-(--text-muted) leading-relaxed">
              Building the cryptographic foundation for autonomous economic
              agents. Secured by FHE and multi-chain dWallets.
            </p>
          </div>

          {/* Product */}
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-widest text-(--text-main) mb-4">
              Product
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="#problem"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  Problem
                </Link>
              </li>
              <li>
                <Link
                  href="#fhe"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  Technology
                </Link>
              </li>
              <li>
                <Link
                  href="#features"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  Features
                </Link>
              </li>
              <li>
                <Link
                  href="#ecosystem"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  Ecosystem
                </Link>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-widest text-(--text-main) mb-4">
              Resources
            </h4>
            <ul className="space-y-3">
              <li>
                <Link
                  href="/docs"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  Documentation
                </Link>
              </li>
              <li>
                <Link
                  href="https://github.com/aura-protocol"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  GitHub
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
              <li>
                <Link
                  href="/app"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  Dashboard
                </Link>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="font-mono text-[10px] uppercase tracking-widest text-(--text-main) mb-4">
              Contact
            </h4>
            <ul className="space-y-3">
              <li>
                <a
                  href="https://twitter.com/aura_protocol"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Twitter
                </a>
              </li>
              <li>
                <a
                  href="https://discord.gg/aura"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  Discord
                </a>
              </li>
              <li>
                <a
                  href="mailto:hello@aura-protocol.com"
                  className="text-sm text-(--text-muted) hover:text-(--text-main) transition-colors flex items-center gap-2"
                >
                  <Mail className="w-4 h-4" />
                  Email
                </a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="pt-8 border-t border-border flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="font-mono text-[10px] text-(--text-muted)">
            © 2026 AURA PROTOCOL LABS {/* SECURE_LAYER */}
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse"></div>
            <span className="font-mono text-[9px] uppercase text-(--text-muted)">
              Encrypt Net Active
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
}
