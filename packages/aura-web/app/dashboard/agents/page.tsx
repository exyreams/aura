"use client";

import { Bot, RefreshCw } from "lucide-react";
import {
  DashboardContent,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardPanel,
  DashboardPanelHeader,
} from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { StatusBadge } from "@/components/global/StatusBadge";
import { formatAddress } from "@/lib/formatting/addresses";
import { useAgentSessions } from "@/lib/hooks/use-agent-sessions";
import type { AgentSessionRow } from "@/lib/supabase/types";

const sessionTone: Record<
  AgentSessionRow["status"],
  "success" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  expired: "neutral",
  revoked: "danger",
  suspended: "warning",
};

function formatTimestamp(value: string | null) {
  if (!value) {
    return "No expiry";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function AgentsPage() {
  const sessionsQuery = useAgentSessions();
  const sessions = sessionsQuery.data ?? [];

  return (
    <DashboardContent>
      <DashboardPanel>
        <DashboardPanelHeader
          eyebrow="Agents"
          title="Agent sessions"
          description="Sessions are read from Supabase and represent the control-plane grants an owner can later revoke, suspend, or narrow."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => void sessionsQuery.refetch()}
              disabled={sessionsQuery.isFetching}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh sessions
            </Button>
          }
        />
      </DashboardPanel>

      {sessionsQuery.isLoading ? (
        <div className="grid gap-3">
          {[0, 1, 2].map((item) => (
            <DashboardPanel key={item} className="h-28 animate-pulse" />
          ))}
        </div>
      ) : sessionsQuery.isError ? (
        <DashboardErrorState
          title="Could not load agent sessions"
          description="Check the owner session and the agent_sessions RLS policy."
          onRetry={() => void sessionsQuery.refetch()}
        />
      ) : sessions.length === 0 ? (
        <DashboardEmptyState
          icon={Bot}
          title="No agent sessions"
          description="When the Conduit device flow creates an owner-approved session, it will appear here with its scopes, treasury binding, and expiry."
        />
      ) : (
        <div className="grid gap-3">
          {sessions.map((session) => (
            <DashboardPanel key={session.id} className="p-4">
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <div className="flex size-9 items-center justify-center rounded-md border border-border bg-surface-raised">
                      <Bot
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                    <div className="min-w-0">
                      <h2 className="truncate text-base font-semibold">
                        {session.agent_label ?? "Unnamed agent"}
                      </h2>
                      <p className="font-mono text-xs text-muted-foreground">
                        {formatAddress(session.agent_id)}
                      </p>
                    </div>
                    <StatusBadge tone={sessionTone[session.status]}>
                      {session.status}
                    </StatusBadge>
                  </div>

                  <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-3">
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Treasury
                      </dt>
                      <dd className="mt-1 font-mono">
                        {session.treasury_pda
                          ? formatAddress(session.treasury_pda)
                          : "Not bound"}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Created
                      </dt>
                      <dd className="mt-1">
                        {formatTimestamp(session.created_at)}
                      </dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                        Expires
                      </dt>
                      <dd className="mt-1">
                        {formatTimestamp(session.expires_at)}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex max-w-xl flex-wrap gap-2 lg:justify-end">
                  {session.scopes.length > 0 ? (
                    session.scopes.map((scope) => (
                      <span
                        key={scope}
                        className="rounded-md border border-border bg-background/40 px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground"
                      >
                        {scope}
                      </span>
                    ))
                  ) : (
                    <span className="rounded-md border border-border bg-background/40 px-2.5 py-1 text-sm text-muted-foreground">
                      No scopes recorded
                    </span>
                  )}
                </div>
              </div>
            </DashboardPanel>
          ))}
        </div>
      )}
    </DashboardContent>
  );
}
