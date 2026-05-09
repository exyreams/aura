"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  Activity,
  Check,
  Copy,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shield,
  Vault,
  Wallet,
  X,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/global/Button";
import { WalletModal } from "@/components/global/WalletModal";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { useAppSettings } from "@/lib/hooks";
import { DEFAULT_DOCS_URL } from "@/lib/settings";

// Landing page anchor links — shown when not connected
const LANDING_LINKS = [
  { label: "Problem", href: "#problem" },
  { label: "Technology", href: "#fhe" },
  { label: "Features", href: "#features" },
  { label: "Ecosystem", href: "#ecosystem" },
  { label: "FAQ", href: "#faq" },
];

// App page links — shown in wallet dropdown when connected
const APP_LINKS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Treasuries", href: "/dashboard/treasuries", icon: Vault },
  { label: "Activity", href: "/dashboard/activity", icon: Activity },
  { label: "Controls", href: "/dashboard/controls", icon: Shield },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

export function Navbar() {
  const { resolvedTheme } = useTheme();
  const { publicKey, disconnect } = useWallet();
  const settings = useAppSettings();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
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
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [walletMenuOpen]);

  const logoSrc =
    !mounted || resolvedTheme === "dark"
      ? "/dark-logo-wordmark.svg"
      : "/light-logo-wordmark.svg";

  const isDark = !mounted || resolvedTheme === "dark";
  const isConnected = mounted && publicKey;
  const walletAddress = publicKey?.toBase58();
  const shortAddress = walletAddress
    ? `${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`
    : "";
  const docsUrl = DEFAULT_DOCS_URL;

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
        `https://explorer.solana.com/address/${walletAddress}?cluster=${settings.network}`,
        "_blank",
      );
    }
  };

  // Lock body scroll when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileMenuOpen]);

  // Track nav height for mobile menu offset
  const navRef = useRef<HTMLElement>(null);
  const [navHeight, setNavHeight] = useState(73);
  useEffect(() => {
    if (!navRef.current) return;
    const ro = new ResizeObserver(() => {
      setNavHeight(navRef.current?.offsetHeight ?? 73);
    });
    ro.observe(navRef.current);
    return () => ro.disconnect();
  }, []);

  const mobileBg = isDark
    ? "bg-[rgba(12,12,14,0.98)]"
    : "bg-[rgba(255,255,255,0.98)]";

  // All floating transition is pure CSS — no layout-triggering JS animation.
  // Only opacity/transform (composited) go through Framer Motion.
  const wrapperCls = [
    "fixed top-0 left-0 w-full z-[100] flex justify-center",
    "transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
    scrolled ? "pt-4 px-3 md:px-4" : "pt-0 px-0",
  ].join(" ");

  const navCls = [
    "w-full flex justify-between items-center pointer-events-auto",
    "backdrop-blur-[16px]",
    // layout transitions — all CSS, runs on compositor where possible
    "transition-[max-width,border-radius,padding,background-color,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
    scrolled
      ? isDark
        ? [
            // Dark pill: semi-transparent so blur shows, but bright border + inner highlight to lift it off the dark page
            "max-w-[960px] rounded-[14px] px-5 py-3",
            "bg-[rgba(28,28,32,0.82)]",
            "border border-[rgba(255,255,255,0.12)]",
            "shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)]",
          ].join(" ")
        : [
            // Light pill: same translucent frosted feel as dark
            "max-w-[960px] rounded-[14px] px-5 py-3",
            "bg-[rgba(255,255,255,0.72)]",
            "border border-[rgba(0,0,0,0.1)]",
            "shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
          ].join(" ")
      : [
          // Top bar: always see-through
          "max-w-full rounded-none px-6 md:px-[4vw] py-5",
          "border-b border-border border-t-0 border-l-0 border-r-0",
          "shadow-none",
          isDark ? "bg-[rgba(12,12,14,0.7)]" : "bg-[rgba(255,255,255,0.7)]",
        ].join(" "),
  ].join(" ");

  return (
    <>
      {/* Option A — vignette gradient behind the pill zone, fades in on scroll */}
      <div
        className="fixed top-0 left-0 w-full h-40 pointer-events-none z-[99] transition-opacity duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]"
        style={{
          opacity: scrolled ? 1 : 0,
          background: isDark
            ? "linear-gradient(to bottom, rgba(0,0,0,1) 0%, rgba(0,0,0,0.7) 45%, transparent 100%)"
            : "linear-gradient(to bottom, rgba(160,160,180,1) 0%, rgba(160,160,180,0.45) 45%, transparent 100%)",
        }}
      />

      <div className={wrapperCls}>
        <nav ref={navRef} className={navCls}>
          <Link href="/" className="flex items-center shrink-0">
            <Image
              src={logoSrc}
              alt="AURA"
              width={80}
              height={20}
              className="h-5 w-auto"
            />
          </Link>

          {/* Desktop links */}
          <div className="hidden md:flex gap-6 items-center">
            {/* Landing links when disconnected, minimal when connected */}
            {!isConnected &&
              LANDING_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors"
                >
                  {link.label}
                </Link>
              ))}
            <a
              href={docsUrl}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors"
            >
              Docs
            </a>

            <div className="h-4 w-px bg-border" />

            {isConnected ? (
              <>
                <Link href="/dashboard">
                  <Button
                    variant="primary"
                    size="small"
                    className="font-mono! text-[10px]! uppercase! tracking-widest!"
                  >
                    Dashboard
                  </Button>
                </Link>

                <div className="relative" ref={walletMenuRef}>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setWalletMenuOpen(!walletMenuOpen)}
                    icon={
                      <div className="size-1.5 rounded-full bg-primary animate-pulse" />
                    }
                    iconPosition="left"
                  >
                    {shortAddress}
                  </Button>

                  <AnimatePresence>
                    {walletMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, scale: 0.96, y: -4 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.96, y: -4 }}
                        transition={{ duration: 0.12, ease: "easeOut" }}
                        style={{ transformOrigin: "top right" }}
                        className="absolute right-0 mt-2 w-60 bg-(--input-bg) border border-border rounded-lg shadow-2xl overflow-hidden"
                      >
                        {/* Wallet address header */}
                        <div className="px-3 py-2.5 border-b border-border bg-(--card-bg)">
                          <p className="text-[9px] font-mono text-(--text-muted) mb-1 uppercase tracking-wider">
                            Connected
                          </p>
                          <div className="flex items-center gap-2">
                            <div className="size-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                            <p className="text-[10px] font-mono text-(--text-main) truncate">
                              {walletAddress}
                            </p>
                          </div>
                        </div>

                        {/* App navigation */}
                        <div className="p-1.5">
                          <p className="text-[9px] font-mono text-(--text-muted) uppercase tracking-wider px-2 py-1">
                            Navigate
                          </p>
                          {APP_LINKS.map(({ label, href, icon: Icon }) => (
                            <Link
                              key={href}
                              href={href}
                              onClick={() => setWalletMenuOpen(false)}
                              className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-(--text-main) hover:bg-(--hover-bg) rounded-md transition-colors"
                            >
                              <Icon className="size-3.5 text-(--text-muted)" />
                              <span>{label}</span>
                            </Link>
                          ))}
                        </div>

                        {/* Utility actions */}
                        <div className="p-1.5 border-t border-border">
                          <button
                            type="button"
                            onClick={handleCopyAddress}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-(--text-main) hover:bg-(--hover-bg) rounded-md transition-colors"
                          >
                            {copied ? (
                              <Check className="size-3.5 text-primary" />
                            ) : (
                              <Copy className="size-3.5 text-(--text-muted)" />
                            )}
                            <span>{copied ? "Copied!" : "Copy Address"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={handleViewExplorer}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-(--text-main) hover:bg-(--hover-bg) rounded-md transition-colors"
                          >
                            <ExternalLink className="size-3.5 text-(--text-muted)" />
                            <span>View on Explorer</span>
                          </button>
                          <div className="my-1 border-t border-border" />
                          <button
                            type="button"
                            onClick={handleDisconnect}
                            className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-danger hover:bg-danger/10 rounded-md transition-colors"
                          >
                            <LogOut className="size-3.5" />
                            <span>Disconnect</span>
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </>
            ) : (
              <Button
                variant="primary"
                size="small"
                className="font-mono! text-[10px]! uppercase! tracking-widest!"
                icon={<Wallet className="size-3" />}
                onClick={() => setWalletModalOpen(true)}
              >
                Connect Wallet
              </Button>
            )}

            <ThemeToggle />
          </div>

          {/* Mobile controls */}
          <div className="md:hidden flex items-center gap-4">
            <ThemeToggle />
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="text-(--text-main) size-6 relative"
              aria-label="Toggle menu"
            >
              <AnimatePresence mode="wait" initial={false}>
                {mobileMenuOpen ? (
                  <motion.span
                    key="close"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ rotate: -90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: 90, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    <X className="size-6" />
                  </motion.span>
                ) : (
                  <motion.span
                    key="menu"
                    className="absolute inset-0 flex items-center justify-center"
                    initial={{ rotate: 90, opacity: 0 }}
                    animate={{ rotate: 0, opacity: 1 }}
                    exit={{ rotate: -90, opacity: 0 }}
                    transition={{ duration: 0.12 }}
                  >
                    <Menu className="size-6" />
                  </motion.span>
                )}
              </AnimatePresence>
            </button>
          </div>
        </nav>
      </div>

      {/* Mobile Menu */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <motion.div
            key="mobile-menu"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className={`fixed inset-0 ${mobileBg} backdrop-blur-[10px] z-50 md:hidden overflow-y-auto`}
            style={{ top: navHeight + (scrolled ? 16 : 0) }}
          >
            <div className="flex flex-col gap-6 p-6">
              {isConnected ? (
                // App navigation for connected users
                <>
                  <div className="flex items-center gap-2 px-3 py-2.5 bg-(--card-bg) border border-border rounded-md">
                    <div className="size-1.5 rounded-full bg-primary animate-pulse" />
                    <span className="font-mono text-xs text-(--text-main) truncate">
                      {walletAddress}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <p className="font-mono text-[9px] uppercase tracking-wider text-(--text-muted) px-1 mb-2">
                      Navigate
                    </p>
                    {APP_LINKS.map(({ label, href, icon: Icon }) => (
                      <Link
                        key={href}
                        href={href}
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-(--hover-bg) text-(--text-muted) hover:text-(--text-main) transition-colors"
                      >
                        <Icon className="size-4 shrink-0" />
                        <span className="font-mono text-sm uppercase tracking-widest">
                          {label}
                        </span>
                      </Link>
                    ))}
                  </div>

                  <div className="border-t border-border" />

                  <div className="space-y-1">
                    <a
                      href={docsUrl}
                      target="_blank"
                      rel="noreferrer"
                      onClick={() => setMobileMenuOpen(false)}
                      className="font-mono text-sm uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors py-2 block"
                    >
                      Docs
                    </a>
                  </div>

                  <div className="border-t border-border" />

                  <div className="space-y-2">
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-(--hover-bg) transition-colors"
                    >
                      {copied ? (
                        <Check className="size-4 text-primary" />
                      ) : (
                        <Copy className="size-4 text-(--text-muted)" />
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
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-(--hover-bg) transition-colors"
                    >
                      <ExternalLink className="size-4 text-(--text-muted)" />
                      <span className="text-sm text-(--text-main)">
                        View on Explorer
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        disconnect();
                        setMobileMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-(--hover-bg) transition-colors"
                    >
                      <LogOut className="size-4 text-danger" />
                      <span className="text-sm text-danger">Disconnect</span>
                    </button>
                  </div>
                </>
              ) : (
                // Landing links for visitors
                <>
                  {[
                    ...LANDING_LINKS,
                    { label: "Docs", href: docsUrl, external: true },
                  ].map((link, i) => (
                    <motion.div
                      key={link.href}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.03, duration: 0.18 }}
                    >
                      {"external" in link && link.external ? (
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noreferrer"
                          onClick={() => setMobileMenuOpen(false)}
                          className="font-mono text-sm uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors py-2 block"
                        >
                          {link.label}
                        </a>
                      ) : (
                        <Link
                          href={link.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className="font-mono text-sm uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) transition-colors py-2 block"
                        >
                          {link.label}
                        </Link>
                      )}
                    </motion.div>
                  ))}

                  <div className="border-t border-border my-2" />

                  <Button
                    variant="primary"
                    className="font-mono! text-sm! uppercase! tracking-widest! w-full!"
                    icon={<Wallet className="size-4" />}
                    onClick={() => {
                      setWalletModalOpen(true);
                      setMobileMenuOpen(false);
                    }}
                  >
                    Connect Wallet
                  </Button>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <WalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
    </>
  );
}
