"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { Activity, ArrowUpRight, ShieldCheck } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useAppSettings } from "@/lib/hooks";
import { AURA_PROGRAM_ID } from "@/lib/sdk";
import { appLinks } from "@/lib/mock-data";
import { cn } from "@/lib/utils";

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const wallet = useWallet();
  const settings = useAppSettings();

  return (
    <div className="page-shell flex min-h-screen gap-6 py-6">
      <aside className="glass-panel hidden w-[18.5rem] shrink-0 flex-col justify-between p-5 xl:flex">
        <div>
          <div className="flex items-center gap-3">
            <div className="landing-mark h-11 w-11 rounded-[1.25rem]">
              <Activity className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-white">
                Aura
              </p>
              <p className="text-xs text-slate-400">Operator cockpit</p>
            </div>
          </div>

          <nav className="mt-8 space-y-2">
            {appLinks.map((item) => {
              const active =
                pathname === item.href ||
                (item.href !== "/app" && pathname.startsWith(item.href));

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center justify-between rounded-[1.1rem] px-4 py-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[rgba(9,16,30,0.95)]",
                    active
                      ? "bg-white/10 text-white"
                      : "text-slate-300 hover:bg-white/5",
                  )}
                >
                  <span>{item.label}</span>
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              );
            })}
          </nav>
        </div>

        <div className="rounded-[1.5rem] border border-white/8 bg-white/4 p-4">
          <div className="flex items-center gap-2 text-sm font-medium text-white">
            <ShieldCheck className="h-4 w-4 text-[var(--accent)]" aria-hidden="true" />
            Runtime status
          </div>
          <div className="mt-4 space-y-3 text-sm">
            <div className="flex items-center justify-between text-slate-300">
              <span>Cluster</span>
              <span className="text-amber-200">{settings.network}</span>
            </div>
            <div className="flex items-center justify-between gap-3 text-slate-300">
              <span>Program</span>
              <span className="max-w-36 truncate font-mono text-xs text-white">
                {(settings.programId || AURA_PROGRAM_ID.toBase58()).slice(0, 10)}...
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 text-slate-300">
              <span>Wallet</span>
              <span className="max-w-36 truncate font-mono text-xs text-white">
                {wallet.publicKey
                  ? `${wallet.publicKey.toBase58().slice(0, 4)}...${wallet.publicKey.toBase58().slice(-4)}`
                  : "Disconnected"}
              </span>
            </div>
          </div>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <header className="glass-panel p-4 md:p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.18em] text-slate-500">
                Operator workspace
              </p>
              <h1 className="mt-2 text-2xl font-semibold text-white">
                Autonomous treasury operations
              </h1>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <span className="status-active">
                <span className="status-dot bg-success" />
                {settings.network}
              </span>
              <WalletMultiButton className="wallet-adapter-button wallet-adapter-button-trigger aura-wallet-button" />
            </div>
          </div>

          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_auto]">
            <div className="rounded-[1.25rem] border border-white/8 bg-white/4 px-4 py-3 text-sm text-slate-300">
            {wallet.publicKey
              ? `Connected as ${wallet.publicKey.toBase58()}`
              : "Connect a wallet to load treasuries and submit transactions."}
            </div>
            <Link
              href="/app/settings"
              className="button-secondary min-h-11 text-sm"
            >
              Review settings
            </Link>
          </div>
        </header>

        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
