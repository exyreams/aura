"use client";

import { Activity, Bot, LayoutDashboard, Settings, Wallet } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { AuthButton } from "@/components/auth/AuthButton";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { cn } from "@/lib/utils";

const navLinks = [
  { href: "/dashboard", label: "Overview", exact: true, icon: LayoutDashboard },
  { href: "/dashboard/wallets", label: "Wallets", icon: Wallet },
  { href: "/dashboard/agents", label: "Agents", icon: Bot },
  { href: "/dashboard/activity", label: "Activity", icon: Activity },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

export function DashboardNav() {
  const pathname = usePathname();
  const { resolvedTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const logoSrc =
    !mounted || resolvedTheme === "dark"
      ? "/dark-logo-wordmark.svg"
      : "/light-logo-wordmark.svg";

  return (
    <header className="fixed top-0 left-0 z-[100] flex w-full justify-center px-3 pt-3 md:px-4">
      <nav className="flex w-full items-center justify-between gap-4 rounded-[14px] border border-border bg-[rgba(28,28,32,0.82)] px-5 py-3 shadow-[0_8px_40px_rgba(0,0,0,0.5),inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-[16px] light:bg-[rgba(255,255,255,0.72)] light:shadow-[0_8px_40px_rgba(0,0,0,0.1),inset_0_1px_0_rgba(255,255,255,0.8)]">
        <Link
          href="/"
          className="flex min-h-10 shrink-0 items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)"
        >
          <Image
            src={logoSrc}
            alt="AURA"
            width={70}
            height={18}
            style={{ width: "auto", height: "18px" }}
            suppressHydrationWarning
          />
        </Link>

        <div className="hidden items-center gap-2 md:flex">
          {navLinks.map((link) => {
            const isActive = link.exact
              ? pathname === link.href
              : pathname.startsWith(link.href);
            const Icon = link.icon;

            return (
              <Link
                key={link.href}
                href={link.href}
                className={cn(
                  "inline-flex min-h-10 items-center gap-2 rounded-md px-3 font-mono text-[10px] uppercase tracking-widest transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)",
                  isActive
                    ? "border border-border bg-(--hover-bg) text-(--text-main)"
                    : "text-(--text-muted) hover:bg-(--hover-bg) hover:text-(--text-main)",
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {link.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <ThemeToggle />
          <AuthButton />
        </div>
      </nav>
    </header>
  );
}
