"use client";

import {
  Activity,
  ArrowRight,
  KeyRound,
  MonitorCheck,
  PlugZap,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import {
  DashboardContent,
  DashboardPanel,
  DashboardPanelHeader,
  DashboardStatCard,
} from "@/components/dashboard/DashboardPrimitives";
import { StatusBadge } from "@/components/global/StatusBadge";
import { formatAddress } from "@/lib/formatting/addresses";
import { useActivityEvents } from "@/lib/hooks/use-activity-events";
import { useAgentSessions } from "@/lib/hooks/use-agent-sessions";
import type { ActivityEventRow, Json } from "@/lib/supabase/types";

function metadataString(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function isActiveSession(session: {
  status: string;
  expires_at: string | null;
}) {
  return (
    session.status === "active" &&
    (!session.expires_at || new Date(session.expires_at) > new Date())
  );
}

function isConduitEvent(event: ActivityEventRow) {
  return (
    event.event_kind.startsWith("conduit.") ||
    event.event_kind.startsWith("agent_session.") ||
    event.event_kind.includes("sign_request")
  );
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

const actionLinks = [
  {
    href: "/conduit/device",
    label: "Approve device",
    description: "Enter the code printed by a Conduit CLI or agent runtime.",
    icon: PlugZap,
  },
  {
    href: "/dashboard/conduit/sessions",
    label: "Manage sessions",
    description: "Review scopes, treasury bindings, expiry, and revocation.",
    icon: KeyRound,
  },
  {
    href: "/dashboard/activity",
    label: "Audit trail",
    description: "Inspect recent control-plane approvals and session changes.",
    icon: Activity,
  },
];

export default function ConduitDashboardPage() {
  const auth = useOwnerAuth();
  const sessionsQuery = useAgentSessions();
  const activityQuery = useActivityEvents();
  const sessions = sessionsQuery.data ?? [];
  const events = activityQuery.data ?? [];
  const activeSessions = sessions.filter(isActiveSession);
  const deviceFlowSessions = sessions.filter(
    (session) =>
      metadataString(session.metadata, "created_via") === "conduit_device_flow",
  );
  const recentConduitEvents = events.filter(isConduitEvent).slice(0, 5);

  return (
    <DashboardContent>
      <div className="grid gap-4 md:grid-cols-4">
        <DashboardStatCard
          label="Active Sessions"
          value={sessionsQuery.isLoading ? "-" : String(activeSessions.length)}
          detail="Runtime tokens currently accepted by the control plane."
          icon={MonitorCheck}
        />
        <DashboardStatCard
          label="Device Logins"
          value={
            sessionsQuery.isLoading ? "-" : String(deviceFlowSessions.length)
          }
          detail="Sessions approved through the browser device-code flow."
          icon={PlugZap}
        />
        <DashboardStatCard
          label="Owner Wallet"
          value={auth.primaryWallet ? "Linked" : "Missing"}
          detail={
            auth.primaryWallet
              ? formatAddress(auth.primaryWallet.wallet_address)
              : "Required before device approvals can mint sessions."
          }
          icon={ShieldCheck}
        />
        <DashboardStatCard
          label="Events"
          value={
            activityQuery.isLoading ? "-" : String(recentConduitEvents.length)
          }
          detail="Recent Conduit/session events in the owner audit feed."
          icon={Activity}
        />
      </div>

      <DashboardPanel>
        <DashboardPanelHeader
          eyebrow="Conduit"
          title="AI client access control"
          description="Approve device-code logins, inspect scoped runtime sessions, and revoke access without exposing the owner wallet key to agent runtimes."
          action={<StatusBadge tone="success">Supabase Auth</StatusBadge>}
        />

        <div className="mt-5 grid gap-3 lg:grid-cols-3">
          {actionLinks.map((item) => {
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
                  <ArrowRight
                    className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
                    aria-hidden="true"
                  />
                </div>
                <h3 className="mt-4 font-semibold">{item.label}</h3>
                <p className="mt-2 min-h-12 text-sm leading-6 text-muted-foreground">
                  {item.description}
                </p>
              </Link>
            );
          })}
        </div>
      </DashboardPanel>

      <DashboardPanel>
        <DashboardPanelHeader
          eyebrow="Recent control trail"
          title="Conduit events"
          description="Session approvals and revocations are written into the same activity feed as wallet and proposal actions."
        />

        {activityQuery.isLoading ? (
          <div className="mt-5 grid gap-3">
            {[0, 1, 2].map((item) => (
              <div
                key={item}
                className="h-20 animate-pulse rounded-md border border-border bg-background/40"
              />
            ))}
          </div>
        ) : recentConduitEvents.length === 0 ? (
          <div className="mt-5 flex flex-col items-center justify-center py-10 text-center">
            <Activity
              className="size-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="mt-4 text-base font-semibold">
              No Conduit events yet
            </h3>
            <p className="mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
              Approve a device code or revoke a session and the owner-visible
              trail will appear here.
            </p>
          </div>
        ) : (
          <div className="mt-5 grid gap-3">
            {recentConduitEvents.map((event) => (
              <div
                key={event.id}
                className="rounded-md border border-border bg-background/40 p-4"
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge
                        tone={
                          event.severity === "success"
                            ? "success"
                            : event.severity === "warning"
                              ? "warning"
                              : event.severity === "error"
                                ? "danger"
                                : "neutral"
                        }
                      >
                        {event.severity}
                      </StatusBadge>
                      <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        {event.event_kind}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold">
                      {event.title}
                    </h3>
                    {event.summary ? (
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">
                        {event.summary}
                      </p>
                    ) : null}
                  </div>
                  <time className="shrink-0 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                    {formatDateTime(event.created_at)}
                  </time>
                </div>
              </div>
            ))}
          </div>
        )}
      </DashboardPanel>
    </DashboardContent>
  );
}
