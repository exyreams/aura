"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import {
  Activity,
  Bot,
  Check,
  Copy,
  ExternalLink,
  LayoutDashboard,
  LogOut,
  type LucideIcon,
  Settings,
  Wallet,
} from "lucide-react";
import { AnimatePresence, m, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import {
  Button,
  type ButtonSize,
  type ButtonVariant,
} from "@/components/global/Button";
import { WalletModal } from "@/components/global/WalletModal";
import { useAppSettings, useAuth } from "@/lib/hooks";
import { cn, shortenAddress } from "@/lib/utils";

export interface WalletAppLink {
  label: string;
  href: string;
  icon: LucideIcon;
}

export const WALLET_APP_LINKS: WalletAppLink[] = [
  { label: "Overview", href: "/dashboard", icon: LayoutDashboard },
  { label: "Wallets", href: "/dashboard/wallets", icon: Wallet },
  { label: "Agents", href: "/dashboard/agents", icon: Bot },
  { label: "Activity", href: "/dashboard/activity", icon: Activity },
  { label: "Settings", href: "/dashboard/settings", icon: Settings },
];

interface WalletAccountMenuProps {
  className?: string;
  buttonClassName?: string;
  menuClassName?: string;
  connectLabel?: string;
  buttonSize?: ButtonSize;
  connectVariant?: ButtonVariant;
  connectedVariant?: ButtonVariant;
  showAppNavigation?: boolean;
  onNavigate?: () => void;
}

const menuTransition = {
  duration: 0.12,
  ease: [0.23, 1, 0.32, 1],
} as const;

export function WalletAccountMenu({
  className,
  buttonClassName,
  menuClassName,
  connectLabel = "Connect Wallet",
  buttonSize = "small",
  connectVariant = "primary",
  connectedVariant = "secondary",
  showAppNavigation = true,
  onNavigate,
}: WalletAccountMenuProps) {
  const { publicKey, connected, connecting, disconnect } = useWallet();
  const settings = useAppSettings();
  const auth = useAuth();
  const reduceMotion = useReducedMotion();
  const menuRef = useRef<HTMLDivElement>(null);
  const copiedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [mounted, setMounted] = useState(false);
  const [walletModalOpen, setWalletModalOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const walletAddress = publicKey?.toBase58() ?? "";
  const hasWallet = mounted && connected && Boolean(walletAddress);
  const shortAddress = walletAddress ? shortenAddress(walletAddress) : "";

  useEffect(() => {
    setMounted(true);
    return () => {
      if (copiedTimerRef.current) {
        clearTimeout(copiedTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }

    const handlePointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuOpen]);

  useEffect(() => {
    if (!hasWallet) {
      setMenuOpen(false);
      return;
    }

    setWalletModalOpen(false);
  }, [hasWallet]);

  const handleCopyAddress = async () => {
    if (!walletAddress) {
      return;
    }

    await navigator.clipboard.writeText(walletAddress);
    setCopied(true);

    if (copiedTimerRef.current) {
      clearTimeout(copiedTimerRef.current);
    }

    copiedTimerRef.current = setTimeout(() => {
      setCopied(false);
    }, 2000);
  };

  const handleViewExplorer = () => {
    if (!walletAddress) {
      return;
    }

    window.open(
      `https://explorer.solana.com/address/${walletAddress}?cluster=${settings.network}`,
      "_blank",
      "noopener,noreferrer",
    );
    setMenuOpen(false);
  };

  const handleDisconnect = async () => {
    try {
      await auth.logout();
      await disconnect();
    } finally {
      setMenuOpen(false);
    }
  };

  if (!hasWallet) {
    return (
      <>
        <Button
          type="button"
          variant={connectVariant}
          size={buttonSize}
          onClick={() => setWalletModalOpen(true)}
          disabled={!mounted || connecting}
          loading={connecting}
          icon={<Wallet className="size-3" aria-hidden="true" />}
          className={buttonClassName}
        >
          {connectLabel}
        </Button>
        <WalletModal
          isOpen={walletModalOpen}
          onClose={() => setWalletModalOpen(false)}
        />
      </>
    );
  }

  return (
    <div ref={menuRef} className={cn("relative", className)}>
      <Button
        type="button"
        variant={connectedVariant}
        size={buttonSize}
        onClick={() => setMenuOpen((open) => !open)}
        icon={
          <span
            className="size-1.5 rounded-full bg-primary motion-safe:animate-pulse"
            aria-hidden="true"
          />
        }
        iconPosition="left"
        className={buttonClassName}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        {shortAddress}
      </Button>

      <AnimatePresence>
        {menuOpen ? (
          <m.div
            initial={{
              opacity: 0,
              scale: reduceMotion ? 1 : 0.96,
              y: reduceMotion ? 0 : -4,
            }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{
              opacity: 0,
              scale: reduceMotion ? 1 : 0.96,
              y: reduceMotion ? 0 : -4,
            }}
            transition={menuTransition}
            style={{ transformOrigin: "top right" }}
            className={cn(
              "absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-lg border border-border bg-(--card-bg) shadow-2xl",
              menuClassName,
            )}
            role="menu"
          >
            <div className="border-b border-border bg-(--card-bg) px-3 py-2.5">
              <p className="mb-1 font-mono text-[9px] uppercase tracking-wider text-(--text-muted)">
                Connected
              </p>
              <div className="flex items-center gap-2">
                <span
                  className="size-1.5 shrink-0 rounded-full bg-primary motion-safe:animate-pulse"
                  aria-hidden="true"
                />
                <p className="truncate font-mono text-[10px] text-(--text-main)">
                  {walletAddress}
                </p>
              </div>
            </div>

            {showAppNavigation ? (
              <div className="p-1.5">
                <p className="px-2 py-1 font-mono text-[9px] uppercase tracking-wider text-(--text-muted)">
                  Navigate
                </p>
                {WALLET_APP_LINKS.map(({ label, href, icon: Icon }) => (
                  <Link
                    key={href}
                    href={href}
                    onClick={() => {
                      setMenuOpen(false);
                      onNavigate?.();
                    }}
                    className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-xs text-(--text-main) transition-colors hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--card-bg)"
                    role="menuitem"
                  >
                    <Icon className="size-3.5 text-(--text-muted)" />
                    <span>{label}</span>
                  </Link>
                ))}
              </div>
            ) : null}

            <div className="border-t border-border p-1.5">
              <button
                type="button"
                onClick={() => void handleCopyAddress()}
                className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-xs text-(--text-main) transition-colors hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--card-bg)"
                role="menuitem"
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
                className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-xs text-(--text-main) transition-colors hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--card-bg)"
                role="menuitem"
              >
                <ExternalLink className="size-3.5 text-(--text-muted)" />
                <span>View on Explorer</span>
              </button>
              <div className="my-1 border-t border-border" />
              <button
                type="button"
                onClick={() => void handleDisconnect()}
                className="flex min-h-10 w-full items-center gap-2.5 rounded-md px-2.5 text-left text-xs text-danger transition-colors hover:bg-danger/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger focus-visible:ring-offset-2 focus-visible:ring-offset-(--card-bg)"
                role="menuitem"
              >
                <LogOut className="size-3.5" />
                <span>Disconnect</span>
              </button>
            </div>
          </m.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
