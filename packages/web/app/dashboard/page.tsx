"use client";

import {
  Activity,
  ArrowRight,
  Bot,
  CircleDollarSign,
  PlugZap,
  Settings,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import Link from "next/link";
import {
  DashboardContent,
  DashboardPanel,
  DashboardPanelHeader,
  DashboardStatCard,
} from "@/components/dashboard/DashboardPrimitives";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useActivityEvents } from "@/lib/hooks/use-activity-events";
import { useAgentSessions } from "@/lib/hooks/use-agent-sessions";
import { useWalletRegistry } from "@/lib/hooks/use-wallet-registry";

const controlLinks = [
  {
    href: "/dashboard/wallets",
    label: "Wallets",
    description: "Metadata registry plus live Solana balance reads.",
    icon: Wallet,
    status: "Live",
  },
  {
    href: "/dashboard/agents",
    label: "Agents",
    description: "Signer agents, sessions, scopes, and revocation.",
    icon: Bot,
    status: "Next",
  },
  {
    href: "/dashboard/conduit",
    label: "Conduit",
    description: "Agent gateway for authorization and owner review.",
    icon: PlugZap,
    status: "Live",
  },
  {
    href: "/dashboard/activity",
    label: "Activity",
    description: "Event trail for API, approvals, and settlements.",
    icon: Activity,
    status: "Ready",
  },
  {
    href: "/dashboard/settings",
    label: "Settings",
    description: "RPC, program ID, and runtime defaults.",
    icon: Settings,
    status: "Live",
  },
];

export default function DashboardPage() {
  const walletsQuery = useWalletRegistry();
  const sessionsQuery = useAgentSessions();
  const activityQuery = useActivityEvents();
  const wallets = walletsQuery.data ?? [];
  const sessions = sessionsQuery.data ?? [];
  const events = activityQuery.data ?? [];
  const activeSessions = sessions.filter(
    (session) => session.status === "active",
  );

  return (
    <DashboardContent>
      <div className="grid gap-4 md:grid-cols-3">
        <DashboardStatCard
          label="Wallets"
          value={walletsQuery.isLoading ? "-" : String(wallets.length)}
          detail="Registered custody endpoints visible through Supabase RLS."
          icon={Wallet}
        />
        <DashboardStatCard
          label="Active Agents"
          value={sessionsQuery.isLoading ? "-" : String(activeSessions.length)}
          detail="Open sessions that can be reviewed or revoked here."
          icon={Bot}
        />
        <DashboardStatCard
          label="Activity Events"
          value={activityQuery.isLoading ? "-" : String(events.length)}
          detail="Recent control-plane events available to this owner."
          icon={Activity}
        />
      </div>

      <DashboardPanel>
        <DashboardPanelHeader
          eyebrow="Control map"
          title="Operational surfaces"
          description="The shell is organized around the things an owner needs when agents start requesting wallet actions: custody endpoints, sessions, events, and runtime configuration."
          action={<StatusBadge tone="success">Devnet</StatusBadge>}
        />
        <div className="mt-5 grid gap-3 lg:grid-cols-5">
          {controlLinks.map((item) => {
            const Icon = item.icon;

            return (
              <Link
                key={item.href}
                href={item.href}
                className="group rounded-lg border border-border bg-background/40 p-4 transition-colors hover:border-primary/60 hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-raised">
                    <Icon
                      className="size-5 text-muted-foreground"
                      aria-hidden="true"
                    />
                  </div>
                  <StatusBadge
                    tone={item.status === "Next" ? "warning" : "success"}
                  >
                    {item.status}
                  </StatusBadge>
                </div>
                <h3 className="mt-4 font-semibold">{item.label}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
                <div className="mt-4 inline-flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground group-hover:text-foreground">
                  Open
                  <ArrowRight className="size-3.5" aria-hidden="true" />
                </div>
              </Link>
            );
          })}
        </div>
      </DashboardPanel>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <DashboardPanel>
          <DashboardPanelHeader
            eyebrow="Money movement path"
            title="Wallet controls remain policy-first"
            description="This dashboard does not fabricate balances or simulate transfers. It reads wallet metadata from Supabase and live Solana balances from RPC; fund movement is only exposed after the real AURA proposal and dWallet signing path is wired."
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-3">
            {[
              {
                label: "Discover",
                detail:
                  "Show every registered owner, agent, and dWallet endpoint.",
                icon: Wallet,
              },
              {
                label: "Authorize",
                detail:
                  "Route agent requests through policy and owner controls.",
                icon: ShieldCheck,
              },
              {
                label: "Settle",
                detail:
                  "Track approved settlement and balance changes on devnet.",
                icon: CircleDollarSign,
              },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.label}
                  className="rounded-md border border-border bg-background/40 p-4"
                >
                  <Icon
                    className="size-5 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <h3 className="mt-3 font-semibold">{item.label}</h3>
                  <p className="mt-2 text-sm leading-6 text-muted-foreground">
                    {item.detail}
                  </p>
                </div>
              );
            })}
          </div>
        </DashboardPanel>

        <DashboardPanel>
          <DashboardPanelHeader
            eyebrow="Current slice"
            title="What is active now"
            description="The sidebar shell, authentication gate, registry reads, and balance polling are in place."
          />
          <dl className="mt-5 grid gap-3">
            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/40 p-3">
              <dt className="text-sm text-muted-foreground">Owner auth</dt>
              <dd>
                <StatusBadge tone="success">Live</StatusBadge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/40 p-3">
              <dt className="text-sm text-muted-foreground">Wallet registry</dt>
              <dd>
                <StatusBadge tone="success">Live</StatusBadge>
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 rounded-md border border-border bg-background/40 p-3">
              <dt className="text-sm text-muted-foreground">Agent creation</dt>
              <dd>
                <StatusBadge tone="warning">Next</StatusBadge>
              </dd>
            </div>
          </dl>
          <Link
            href="/dashboard/wallets"
            className="mt-5 inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface-raised px-4 py-2 text-sm font-medium transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
          >
            Open wallet controls
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </DashboardPanel>
      </div>
    </DashboardContent>
  );
}
