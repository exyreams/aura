"use client";

import { Activity, Bot, Wallet } from "lucide-react";
import Link from "next/link";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useAgentSessions } from "@/lib/hooks/use-agent-sessions";
import { useWalletRegistry } from "@/lib/hooks/use-wallet-registry";

function StatCard({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: "true" }>;
}) {
  return (
    <section className="rounded-lg border border-border bg-surface p-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {label}
          </p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
        </div>
        <div className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-raised">
          <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
        </div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{detail}</p>
    </section>
  );
}

export default function DashboardPage() {
  const walletsQuery = useWalletRegistry();
  const sessionsQuery = useAgentSessions();
  const wallets = walletsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const activeSessions = sessions.filter(
    (session) => session.status === "active",
  );

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-8 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Control center
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Agent custody overview
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Monitor agent sessions, registered dWallet metadata, and wallet
            balances before Conduit starts moving real requests through this
            control plane.
          </p>
        </div>
        <StatusBadge tone="warning">Phase 1</StatusBadge>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <StatCard
          label="Wallets"
          value={walletsQuery.isLoading ? "-" : String(wallets.length)}
          detail="Metadata rows visible through Supabase RLS."
          icon={Wallet}
        />
        <StatCard
          label="Active Agents"
          value={sessionsQuery.isLoading ? "-" : String(activeSessions.length)}
          detail="Conduit sessions will appear here after the rewrite."
          icon={Bot}
        />
        <StatCard
          label="Activity"
          value="Realtime"
          detail="Activity events are backed by Supabase tables."
          icon={Activity}
        />
      </div>

      <section className="mt-6 rounded-lg border border-border bg-surface p-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-lg font-semibold">Wallet controls first</h2>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
              Registered dWallets are displayed as wallets, but balances are
              read from chain. Movement stays gated until the real AURA proposal
              and dWallet signing flow is wired.
            </p>
          </div>
          <Link
            href="/dashboard/wallets"
            className="inline-flex min-h-10 items-center justify-center rounded-md border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Open wallets
          </Link>
        </div>
      </section>
    </div>
  );
}
