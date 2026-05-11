"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  Activity,
  Bot,
  Check,
  Copy,
  ExternalLink,
  KeyRound,
  LayoutDashboard,
  LogOut,
  Menu,
  Settings,
  Shield,
  Vault,
  Wallet,
  X,
} from "lucide-react";
import { AnimatePresence, m } from "motion/react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/global/Button";
import { Dropdown } from "@/components/global/Dropdown";
import { WalletModal } from "@/components/global/WalletModal";
import { CompactThemeToggle } from "@/components/theme/CompactThemeToggle";
import { useAgents, useAppSettings, useAuth } from "@/lib/hooks";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/dashboard", label: "Overview", exact: true, icon: LayoutDashboard },
  { href: "/dashboard/treasuries", label: "Treasuries", icon: Vault },
  { href: "/dashboard/playground", label: "Playground", icon: Shield },
  { href: "/dashboard/signers", label: "Signers", icon: KeyRound },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
];

export function DashboardNav() {
  const { resolvedTheme } = useTheme();
  const { publicKey, disconnect } = useWallet();
  const pathname = usePathname();
  const settings = useAppSettings();
  const auth = useAuth();
  const { agents, selectedAgent, selectedAgentId, setSelectedAgentId } =
    useAgents();
  const [mounted, setMounted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [walletMenuOpen, setWalletMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const walletMenuRef = useRef<HTMLDivElement>(null);
  const navRef = useRef<HTMLElement>(null);

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

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [walletMenuOpen]);

  const logoSrc =
    !mounted || resolvedTheme === "dark"
      ? "/dark-logo-wordmark.svg"
      : "/light-logo-wordmark.svg";

  const isDark = !mounted || resolvedTheme === "dark";

  const wrapperCls = cn(
    "fixed top-0 left-0 w-full z-[100] flex justify-center",
    "transition-[padding] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
    // Mobile: always pill padding. Desktop: only when scrolled.
    scrolled ? "pt-3 px-3 md:px-4" : "pt-3 px-3 md:pt-0 md:px-0",
  );

  const navCls = cn(
    "w-full flex justify-between items-center pointer-events-auto backdrop-blur-[16px]",
    "transition-[max-width,border-radius,padding,background-color,box-shadow,border-color] duration-300 ease-[cubic-bezier(0.4,0,0.2,1)]",
    // Mobile: pill, flatten bottom corners when menu open to merge with panel
    mobileMenuOpen
      ? "rounded-tl-[14px] rounded-tr-[14px] rounded-bl-none rounded-br-none border-b-0 px-5 py-3"
      : "rounded-[14px] px-5 py-3", // Desktop not scrolled: full-width bar (override pill)
    !scrolled && "md:max-w-full md:rounded-none md:px-8 md:py-4",
    // Desktop scrolled: full-width pill
    scrolled && "md:max-w-full md:rounded-[14px]",
    // Colors
    isDark
      ? "bg-[rgba(28,28,32,0.82)] border border-[rgba(255,255,255,0.12)] shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)]"
      : "bg-[rgba(255,255,255,0.72)] border border-[rgba(0,0,0,0.1)] shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
    // Desktop not scrolled: replace all-sides border with bottom-only
    !scrolled &&
      isDark &&
      "md:border-x-0 md:border-t-0 md:border-b md:border-[rgba(255,255,255,0.12)] md:shadow-[0_8px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)]",
    !scrolled &&
      !isDark &&
      "md:border-x-0 md:border-t-0 md:border-b md:border-[rgba(0,0,0,0.1)] md:shadow-[0_-8px_40px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.8)]",
  );

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

  const handleDisconnect = async () => {
    await auth.logout();
    await disconnect();
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

  return (
    <>
      {/* Vignette gradient — fades in on scroll on desktop, always on mobile */}
      <div
        className="fixed top-0 left-0 w-full h-32 pointer-events-none z-99 transition-opacity duration-300"
        style={{
          opacity: scrolled ? 1 : 0,
          background: isDark
            ? "linear-gradient(to bottom, rgba(0,0,0,0.9) 0%, rgba(0,0,0,0.5) 50%, transparent 100%)"
            : "linear-gradient(to bottom, rgba(160,160,180,0.8) 0%, rgba(160,160,180,0.3) 50%, transparent 100%)",
        }}
      />

      <div className={wrapperCls}>
        {/* Desktop nav — hidden on mobile */}
        <nav ref={navRef} className={cn(navCls, "hidden md:flex")}>
          <Link href="/" className="flex items-center">
            <Image
              src={logoSrc}
              alt="AURA"
              width={70}
              height={18}
              className="h-[18px] w-auto"
              suppressHydrationWarning
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

            {auth.isAuthenticated ? (
              agents.length > 0 ? (
                <Dropdown
                  options={agents.map((agent) => ({
                    value: agent.agentId,
                    label: agent.label || agent.agentId,
                    icon: <Bot className="size-3" />,
                  }))}
                  value={selectedAgentId}
                  onChange={setSelectedAgentId}
                  placeholder="Select agent"
                  className="w-44"
                />
              ) : (
                <Link
                  href="/dashboard/signers"
                  className="inline-flex min-h-10 items-center gap-2 rounded-md border border-border bg-(--hover-bg) px-3 py-1.5 font-mono text-[10px] uppercase tracking-widest text-(--text-main) transition-colors hover:border-primary"
                >
                  <KeyRound className="size-3.5" />
                  Create Agent
                </Link>
              )
            ) : null}

            {isConnected ? (
              <div className="relative" ref={walletMenuRef}>
                <button
                  type="button"
                  onClick={() => setWalletMenuOpen(!walletMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 bg-(--hover-bg) border border-border rounded-md hover:border-primary transition-all duration-200"
                >
                  <div className="size-2 rounded-full bg-primary animate-pulse" />
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
                      <p className="mt-2 text-[9px] font-mono text-(--text-muted) uppercase tracking-wider">
                        Session:{" "}
                        {auth.isAuthenticated ? "Signed in" : "Needs SIWS"}
                      </p>
                      {selectedAgent ? (
                        <p className="mt-1 text-[10px] font-mono text-(--text-main)">
                          Agent: {selectedAgent.agentId}
                        </p>
                      ) : null}
                    </div>

                    <div className="p-1.5">
                      <button
                        type="button"
                        onClick={handleCopyAddress}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-(--text-main) hover:bg-(--hover-bg) rounded-md transition-colors"
                      >
                        {copied ? (
                          <Check className="size-3.5 text-primary" />
                        ) : (
                          <Copy className="size-3.5" />
                        )}
                        <span>{copied ? "Copied!" : "Copy Address"}</span>
                      </button>

                      <button
                        type="button"
                        onClick={handleViewExplorer}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-(--text-main) hover:bg-(--hover-bg) rounded-md transition-colors"
                      >
                        <ExternalLink className="size-3.5" />
                        <span>View on Explorer</span>
                      </button>

                      <div className="my-1.5 border-t border-border" />

                      <Link
                        href="/dashboard/settings"
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-(--text-main) hover:bg-(--hover-bg) rounded-md transition-colors"
                        onClick={() => setWalletMenuOpen(false)}
                      >
                        <Settings className="size-3.5" />
                        <span>Settings</span>
                      </Link>

                      <div className="my-1.5 border-t border-border" />

                      <button
                        type="button"
                        onClick={() => void handleDisconnect()}
                        className="w-full flex items-center gap-2.5 px-2.5 py-2 text-xs text-danger hover:bg-(--hover-bg) rounded-md transition-colors"
                      >
                        <LogOut className="size-3.5" />
                        <span>Sign Out</span>
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
                icon={<Wallet className="size-3" />}
                onClick={() => setWalletModalOpen(true)}
              >
                Connect Wallet
              </Button>
            )}

            <CompactThemeToggle />
          </div>
        </nav>

        {/* Mobile — single unified pill, expands in-place, no seam ever */}
        <div
          className={cn(
            "md:hidden w-full overflow-hidden rounded-[14px] backdrop-blur-[16px]",
            "transition-[background-color,border-color,box-shadow] duration-300",
            isDark
              ? "bg-[rgba(28,28,32,0.82)] border border-[rgba(255,255,255,0.12)] shadow-[0_8px_40px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.07)]"
              : "bg-[rgba(255,255,255,0.72)] border border-[rgba(0,0,0,0.1)] shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]",
          )}
        >
          {/* Top bar row */}
          <div className="flex justify-between items-center px-5 py-3">
            <Link href="/" className="flex items-center">
              <Image
                src={logoSrc}
                alt="AURA"
                width={70}
                height={18}
                className="h-[18px] w-auto"
                suppressHydrationWarning
              />
            </Link>
            <div className="flex items-center gap-3">
              <CompactThemeToggle />
              <button
                type="button"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="p-1.5 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors relative size-8 flex items-center justify-center"
                aria-label="Toggle menu"
              >
                <AnimatePresence mode="wait" initial={false}>
                  {mobileMenuOpen ? (
                    <m.span
                      key="x"
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0, rotate: -45, scale: 0.7 }}
                      animate={{ opacity: 1, rotate: 0, scale: 1 }}
                      exit={{ opacity: 0, rotate: 45, scale: 0.7 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <X className="size-4" />
                    </m.span>
                  ) : (
                    <m.span
                      key="menu"
                      className="absolute inset-0 flex items-center justify-center"
                      initial={{ opacity: 0, rotate: 45, scale: 0.7 }}
                      animate={{ opacity: 1, rotate: 0, scale: 1 }}
                      exit={{ opacity: 0, rotate: -45, scale: 0.7 }}
                      transition={{ duration: 0.18, ease: [0.4, 0, 0.2, 1] }}
                    >
                      <Menu className="size-4" />
                    </m.span>
                  )}
                </AnimatePresence>
              </button>
            </div>
          </div>

          {/* Expandable body — same element, zero seam, same bg */}
          <AnimatePresence initial={false}>
            {mobileMenuOpen && (
              <m.div
                key="body"
                initial={{ height: 0 }}
                animate={{ height: "auto" }}
                exit={{ height: 0 }}
                transition={{
                  type: "spring",
                  stiffness: 340,
                  damping: 34,
                  mass: 0.7,
                }}
                className="overflow-hidden"
              >
                <div
                  className={cn(
                    "mx-3 border-t",
                    isDark
                      ? "border-[rgba(255,255,255,0.08)]"
                      : "border-[rgba(0,0,0,0.08)]",
                  )}
                />
                <div className="flex flex-col p-3 gap-1">
                  {navLinks.map((link) => {
                    const isActive = link.exact
                      ? pathname === link.href
                      : pathname.startsWith(link.href);
                    const Icon = link.icon;
                    return (
                      <Link
                        key={link.href}
                        href={link.href}
                        onClick={() => setMobileMenuOpen(false)}
                        className={cn(
                          "flex items-center gap-2.5 font-mono text-[11px] uppercase tracking-widest px-3 py-2.5 rounded-md transition-colors",
                          isActive
                            ? "text-primary bg-primary/10"
                            : "text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg)",
                        )}
                      >
                        <Icon className="size-3.5 shrink-0" />
                        {link.label}
                      </Link>
                    );
                  })}

                  <div className="my-1 border-t border-border" />

                  {isConnected ? (
                    <>
                      <div className="flex items-center gap-2 px-3 py-2">
                        <div className="size-1.5 rounded-full bg-primary animate-pulse shrink-0" />
                        <span className="font-mono text-[10px] text-(--text-muted) truncate">
                          {shortAddress}
                        </span>
                        <span className="font-mono text-[9px] text-(--text-muted) ml-auto">
                          {auth.isAuthenticated ? "signed in" : "needs SIWS"}
                        </span>
                      </div>

                      {auth.isAuthenticated && agents.length > 0 && (
                        <div className="px-3 py-1 flex items-center gap-2">
                          <div className="flex-1 min-w-0">
                            <Dropdown
                              options={agents.map((agent) => ({
                                value: agent.agentId,
                                label: agent.label || agent.agentId,
                                icon: <Bot className="size-3" />,
                              }))}
                              value={selectedAgentId}
                              onChange={setSelectedAgentId}
                              placeholder="Select agent"
                            />
                          </div>
                          <button
                            type="button"
                            onClick={handleCopyAddress}
                            className="p-2 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors shrink-0"
                          >
                            {copied ? (
                              <Check className="size-3.5 text-primary" />
                            ) : (
                              <Copy className="size-3.5" />
                            )}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              handleViewExplorer();
                              setMobileMenuOpen(false);
                            }}
                            className="p-2 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors shrink-0"
                          >
                            <ExternalLink className="size-3.5" />
                          </button>
                        </div>
                      )}

                      {auth.isAuthenticated && agents.length === 0 && (
                        <Link
                          href="/dashboard/signers"
                          onClick={() => setMobileMenuOpen(false)}
                          className="flex items-center gap-2 px-3 py-2.5 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors"
                        >
                          <KeyRound className="size-3.5 shrink-0" />
                          <span className="font-mono text-[11px] uppercase tracking-widest">
                            Create Agent
                          </span>
                        </Link>
                      )}

                      <div className="my-1 border-t border-border" />

                      <Link
                        href="/dashboard/settings"
                        onClick={() => setMobileMenuOpen(false)}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-md text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors"
                      >
                        <Settings className="size-3.5 shrink-0" />
                        <span className="text-xs">Settings</span>
                      </Link>
                      <button
                        type="button"
                        onClick={() => {
                          void handleDisconnect();
                          setMobileMenuOpen(false);
                        }}
                        className="flex items-center gap-2 px-3 py-2.5 rounded-md text-danger hover:bg-danger/10 transition-colors w-full text-left"
                      >
                        <LogOut className="size-3.5 shrink-0" />
                        <span className="text-xs">Sign Out</span>
                      </button>
                    </>
                  ) : (
                    <div className="px-1 pt-1 pb-1">
                      <Button
                        variant="primary"
                        className="font-mono! text-[11px]! uppercase! tracking-widest! w-full!"
                        icon={<Wallet className="size-3" />}
                        onClick={() => {
                          setWalletModalOpen(true);
                          setMobileMenuOpen(false);
                        }}
                      >
                        Connect Wallet
                      </Button>
                    </div>
                  )}
                </div>
              </m.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Backdrop */}
      <AnimatePresence>
        {mobileMenuOpen && (
          <m.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[39] md:hidden bg-black/50"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}
      </AnimatePresence>

      <WalletModal
        isOpen={walletModalOpen}
        onClose={() => setWalletModalOpen(false)}
      />
    </>
  );
}
