"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  Check,
  Copy,
  ExternalLink,
  LogOut,
  Menu,
  Wallet,
  X,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/global/Button";
import { WalletModal } from "@/components/global/WalletModal";
import { CompactThemeToggle } from "@/components/theme/CompactThemeToggle";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/dashboard", label: "Overview", exact: true },
  { href: "/dashboard/treasuries", label: "Treasuries" },
  { href: "/dashboard/agents", label: "Agents" },
  { href: "/dashboard/policies", label: "Policies" },
];

export function DashboardNav() {
  const { resolvedTheme } = useTheme();
  const { publicKey, disconnect } = useWallet();
  const pathname = usePathname();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (
        walletMenuRef.current &&
        !walletMenuRef.current.contains(event.target as Node)
      ) {
        setWalletMenuOpen(false);
      }
    };

    if (walletMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [walletMenuOpen]);

  const logoSrc =
    !mounted || resolvedTheme === "dark" ? "/logo-dark.svg" : "/logo-light.svg";

  const navBg =
    !mounted || resolvedTheme === "dark"
      ? "bg-[rgba(12,12,14,0.8)]"
      : "bg-[rgba(255,255,255,0.8)]";

  const mobileBg =
    !mounted || resolvedTheme === "dark"
      ? "bg-[rgba(12,12,14,0.98)]"
      : "bg-[rgba(255,255,255,0.98)]";

  const isConnected = mounted && publicKey;
  const walletAddress = publicKey?.toBase58();
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : "";

  const handleCopyAddress = async () => {
    if (walletAddress) {
      await navigator.clipboard.writeText(walletAddress);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDisconnect = () => {
    disconnect();
    setWalletMenuOpen(false);
  };

  const handleViewExplorer = () => {
    if (walletAddress) {
      window.open(
        `https://explorer.solana.com/address/${walletAddress}?cluster=devnet`,
        "_blank",
      );
    }
  };

  return (
    <>
      <nav
        className={`fixed top-0 w-full px-8 py-4 flex justify-between items-center z-100 ${navBg} backdrop-blur-md border-b border-border transition-all duration-300`}
      >
        <Link href="/" className="flex items-center">
          <Image
            src={logoSrc}
            alt="AURA"
            width={70}
            height={18}
            className="h-[18px] w-auto"
          />
        </Link>

        <div className="hidden md:flex gap-6 items-center">
          {navLinks.map((link) => {
            const isActive = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href);

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "font-mono text-[10px] uppercase tracking-widest transition-all duration-200 py-2 px-3 rounded-md",
                  isActive
                    ? "text-(--text-main) bg-(--hover-bg) border border-border"
                    : "text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg)",
                )}
              >
                {link.label}
              </Link>
            );
          })}

          <div className="h-4 w-px bg-border" />

          {isConnected ? (
            <div className="relative" ref={walletMenuRef}>
              <button
                type="button"
                onClick={() => setWalletMenuOpen(!walletMenuOpen)}
                className="flex items-center gap-2 px-3 py-1.5 bg-(--hover-bg) border border-border rounded-md hover:border-primary transition-all duration-200"
              >
                <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                <span className="font-mono text-[10px] text-(--text-main)">
                  {shortAddress}
                </span>
              </button>

              {walletMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-(--card-bg) border border-border rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-3 border-b border-border bg-(--hover-bg)">
                    <p className="text-[9px] font-mono text-(--text-muted) mb-1.5 uppercase tracking-wider">
                      Connected Wallet
                    </p>
                    <p className="text-[10px] font-mono text-(--text-main) break-all leading-relaxed">
                      {walletAddress}
                    </p>
                  </div>

                  <div className="p-1.5">
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-(--text-main) hover:bg-(--hover-bg) rounded-md transition-colors"
                    >
                      {copied ? (
                        <Check className="w-3.5 h-3.5 text-primary" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                      <span>{copied ? "Copied!" : "Copy Address"}</span>
                    </button>

                    <button
                      type="button"
                      onClick={handleViewExplorer}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-(--text-main) hover:bg-(--hover-bg) rounded-md transition-colors"
                    >
                      <ExternalLink className="w-3.5 h-3.5" />
                      <span>View on Explorer</span>
                    </button>

                    <div className="my-1.5 border-t border-border" />

                    <button
                      type="button"
                      onClick={handleDisconnect}
                      className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-danger hover:bg-(--hover-bg) rounded-md transition-colors"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Disconnect</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <Button
              variant="primary"
              size="small"
              className="font-mono! text-[10px]! uppercase! tracking-widest!"
              icon={<Wallet className="w-3 h-3" />}
              onClick={() => setWalletModalOpen(true)}
            >
              Connect Wallet
            </Button>
          )}

          <CompactThemeToggle />
        </div>

        <div className="md:hidden flex items-center gap-4">
          <CompactThemeToggle />
          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="text-(--text-main)"
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="w-6 h-6" />
            ) : (
              <Menu className="w-6 h-6" />
            )}
          </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div
          className={`fixed inset-0 top-[73px] ${mobileBg} backdrop-blur-[10px] z-50 md:hidden animate-in fade-in slide-in-from-top-4 duration-300`}
        >
          <div className="flex flex-col gap-4 p-6">
            {navLinks.map((link) => {
              const isActive = link.exact
                ? pathname === link.href
                : pathname.startsWith(link.href);

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "font-mono text-sm uppercase tracking-widest transition-all duration-200 py-3 px-4 rounded-md relative",
                    isActive
                      ? "text-white bg-white/10 border-l-2 border-primary"
                      : "text-(--text-muted) hover:text-white hover:bg-white/5",
                  )}
                >
                  {link.label}
                </Link>
              );
            })}

            <div className="border-t border-border my-2" />

            {isConnected ? (
              <>
                <div className="flex items-center gap-2 px-4 py-3 bg-(--card-content) border border-border rounded-md">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <span className="font-mono text-xs text-(--text-main)">
                    {shortAddress}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={handleCopyAddress}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-(--card-content) border border-border rounded-md hover:border-primary transition-colors"
                >
                  {copied ? (
                    <Check className="w-4 h-4 text-primary" />
                  ) : (
                    <Copy className="w-4 h-4 text-(--text-main)" />
                  )}
                  <span className="text-sm text-(--text-main)">
                    {copied ? "Copied!" : "Copy Address"}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    handleViewExplorer();
                    setMobileMenuOpen(false);
                  }}
                  className="w-full flex items-center gap-3 px-4 py-3 bg-(--card-content) border border-border rounded-md hover:border-primary transition-colors"
                >
                  <ExternalLink className="w-4 h-4 text-(--text-main)" />
                  <span className="text-sm text-(--text-main)">
                    View on Explorer
                  </span>
                </button>

                <Button
                  variant="secondary"
                  className="font-mono! text-sm! uppercase! tracking-widest! w-full!"
                  icon={<LogOut className="w-4 h-4" />}
                  onClick={() => {
                    disconnect();
                    setMobileMenuOpen(false);
                  }}
                >
                  Disconnect
                </Button>
              </>
            ) : (
              <Button
                variant="primary"
                className="font-mono! text-sm! uppercase! tracking-widest! w-full!"
                icon={<Wallet className="w-4 h-4" />}
                onClick={() => {
                  setWalletModalOpen(true);
                  setMobileMenuOpen(false);
                }}
              >
                Connect Wallet
              </Button>
            )}
          </div>
        </div>
      )}

      <WalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
    </>
  );
}
