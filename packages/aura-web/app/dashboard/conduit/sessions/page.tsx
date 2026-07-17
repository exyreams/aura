"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  KeyRound,
  MonitorCheck,
  PlugZap,
  RefreshCw,
  Shield,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  DashboardContent,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardPanel,
  DashboardStatCard,
} from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { Modal } from "@/components/global/Modal";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useToast } from "@/components/global/Toast";
import { getAgentScopeLabel } from "@/lib/agents/scopes";
import { formatAddress } from "@/lib/formatting/addresses";
import { useAgentSessions } from "@/lib/hooks/use-agent-sessions";
import type { AgentSessionRow, Json } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

function metadataString(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function isExpired(session: AgentSessionRow) {
  return Boolean(
    session.expires_at && new Date(session.expires_at) <= new Date(),
  );
}

function isActiveSession(session: AgentSessionRow) {
  return session.status === "active" && !isExpired(session);
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function sessionSource(session: AgentSessionRow) {
  const createdVia = metadataString(session.metadata, "created_via");

  if (createdVia === "conduit_device_flow") {
    return "Device flow";
  }

  if (createdVia === "web") {
    return "Web";
  }

  return createdVia ?? "Runtime";
}

function ScopeChip({ scope }: { scope: string }) {
  return (
    <span
      title={getAgentScopeLabel(scope)}
      className="inline-flex items-center rounded-sm border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground"
    >
      {scope}
    </span>
  );
}

function SessionStatus({ session }: { session: AgentSessionRow }) {
  if (session.status === "revoked") {
    return <StatusBadge tone="danger">Revoked</StatusBadge>;
  }

  if (isExpired(session) || session.status === "expired") {
    return <StatusBadge tone="warning">Expired</StatusBadge>;
  }

  if (session.status === "suspended") {
    return <StatusBadge tone="warning">Suspended</StatusBadge>;
  }

  return <StatusBadge tone="success">Active</StatusBadge>;
}

function RevokeSessionModal({
  session,
  open,
  loading,
  onClose,
  onConfirm,
}: {
  session: AgentSessionRow | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      ariaLabelledBy="revoke-conduit-session-title"
      ariaDescribedBy="revoke-conduit-session-description"
      className="sm:max-w-md"
    >
      <div className="grid gap-5 pt-2 pr-8">
        <div>
          <h2
            id="revoke-conduit-session-title"
            className="text-lg font-semibold"
          >
            Revoke Conduit session
          </h2>
          <p
            id="revoke-conduit-session-description"
            className="mt-2 text-sm leading-6 text-muted-foreground"
          >
            The bearer token stops working immediately. On-chain authority is
            not changed by this action.
          </p>
        </div>

        {session ? (
          <div className="grid gap-2 rounded-sm border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Agent
              </span>
              <span className="truncate font-mono text-xs">
                {session.agent_label ?? session.agent_id}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Session
              </span>
              <span className="truncate font-mono text-xs">{session.id}</span>
            </div>
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            loading={loading}
          >
            Revoke
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function RevokeAllModal({
  count,
  open,
  loading,
  onClose,
  onConfirm,
}: {
  count: number;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      ariaLabelledBy="revoke-all-conduit-sessions-title"
      ariaDescribedBy="revoke-all-conduit-sessions-description"
      className="sm:max-w-md"
    >
      <div className="grid gap-5 pt-2 pr-8">
        <div>
          <h2
            id="revoke-all-conduit-sessions-title"
            className="text-lg font-semibold"
          >
            Revoke all active sessions
          </h2>
          <p
            id="revoke-all-conduit-sessions-description"
            className="mt-2 text-sm leading-6 text-muted-foreground"
          >
            This revokes {count} active bearer token
            {count === 1 ? "" : "s"}. Agents must complete device login again.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-sm border border-warning/30 bg-warning/10 p-3 text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-sm leading-6">
            Use this when a workstation, CLI profile, or AI client environment
            may be compromised.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            loading={loading}
          >
            Revoke all
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export default function ConduitSessionsPage() {
  const sessionsQuery = useAgentSessions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [revokeTarget, setRevokeTarget] = useState<AgentSessionRow | null>(
    null,
  );
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const sessions = sessionsQuery.data ?? [];
  const activeSessions = sessions.filter(isActiveSession);
  const deviceFlowSessions = sessions.filter(
    (session) =>
      metadataString(session.metadata, "created_via") === "conduit_device_flow",
  );
  const scopedSessions = sessions.filter((session) => session.treasury_pda);

  const revokeMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await fetch(`/api/agents/${id}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(body.error ?? "Could not revoke session.");
      }
    },
    onSuccess: async () => {
      toast.success("Conduit session revoked");
      setRevokeTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
    },
    onError: (cause) => {
      toast.danger("Could not revoke session", {
        description:
          cause instanceof Error ? cause.message : "Try again in a moment.",
      });
    },
  });

  const revokeAllMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      await Promise.all(
        ids.map(async (id) => {
          const response = await fetch(`/api/agents/${id}`, {
            method: "DELETE",
          });
          const body = (await response.json()) as { error?: string };

          if (!response.ok) {
            throw new Error(body.error ?? "Could not revoke every session.");
          }
        }),
      );
    },
    onSuccess: async (_result, ids) => {
      toast.success("Conduit sessions revoked", {
        description: `${ids.length} active session${
          ids.length === 1 ? "" : "s"
        } revoked.`,
      });
      setRevokeAllOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
    },
    onError: (cause) => {
      toast.danger("Could not revoke every session", {
        description:
          cause instanceof Error ? cause.message : "Try again in a moment.",
      });
    },
  });

  return (
    <DashboardContent className="max-w-[1600px]">
      <RevokeSessionModal
        session={revokeTarget}
        open={Boolean(revokeTarget)}
        loading={revokeMutation.isPending}
        onClose={() => setRevokeTarget(null)}
        onConfirm={() => {
          if (revokeTarget) {
            revokeMutation.mutate(revokeTarget.id);
          }
        }}
      />

      <RevokeAllModal
        count={activeSessions.length}
        open={revokeAllOpen}
        loading={revokeAllMutation.isPending}
        onClose={() => setRevokeAllOpen(false)}
        onConfirm={() =>
          revokeAllMutation.mutate(activeSessions.map((session) => session.id))
        }
      />

      <header className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Conduit Sessions
          </span>
          <h1 className="mb-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            Connected AI clients
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Each session is a scoped bearer token for a CLI, MCP client, or
            agent runtime. Revoke tokens here without touching owner wallet
            credentials.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={() => void sessionsQuery.refetch()}
            disabled={sessionsQuery.isFetching}
          >
            <RefreshCw
              className={cn(
                "size-4",
                sessionsQuery.isFetching && "animate-spin",
              )}
              aria-hidden="true"
            />
            Refresh
          </Button>
          <Button
            type="button"
            variant="danger"
            disabled={activeSessions.length === 0}
            onClick={() => setRevokeAllOpen(true)}
          >
            <Ban className="size-4" aria-hidden="true" />
            Revoke all
          </Button>
        </div>
      </header>

      <div className="grid gap-4 md:grid-cols-3">
        <DashboardStatCard
          label="Active"
          value={sessionsQuery.isLoading ? "-" : String(activeSessions.length)}
          detail="Sessions accepting bearer-token requests right now."
          icon={MonitorCheck}
        />
        <DashboardStatCard
          label="Device Flow"
          value={
            sessionsQuery.isLoading ? "-" : String(deviceFlowSessions.length)
          }
          detail="Tokens minted from browser-approved device codes."
          icon={PlugZap}
        />
        <DashboardStatCard
          label="Treasury Scoped"
          value={sessionsQuery.isLoading ? "-" : String(scopedSessions.length)}
          detail="Sessions constrained to a recorded treasury PDA."
          icon={Shield}
        />
      </div>

      {sessionsQuery.isLoading ? (
        <div className="space-y-3">
          {[0, 1, 2].map((item) => (
            <DashboardPanel key={item} className="h-36 animate-pulse" />
          ))}
        </div>
      ) : sessionsQuery.isError ? (
        <DashboardErrorState
          title="Could not load Conduit sessions"
          description="Check the owner auth session and agent_sessions RLS policy."
          onRetry={() => void sessionsQuery.refetch()}
        />
      ) : sessions.length === 0 ? (
        <DashboardEmptyState
          icon={KeyRound}
          title="No sessions yet"
          description="Run a Conduit device login from the CLI, then approve the user code here to create the first runtime session."
          action={
            <Link
              href="/dashboard/conduit/device"
              className="inline-flex min-h-10 items-center justify-center rounded-sm border border-border bg-(--card-bg) px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-(--text-main) transition-colors hover:border-primary hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)"
            >
              Approve device code
            </Link>
          }
        />
      ) : (
        <section className="grid gap-3">
          {sessions.map((session) => {
            const source = sessionSource(session);
            const clientName = metadataString(session.metadata, "client_name");

            return (
              <DashboardPanel key={session.id} className="p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex size-9 items-center justify-center rounded-md border border-border bg-surface-raised">
                        <KeyRound
                          className="size-4 text-muted-foreground"
                          aria-hidden="true"
                        />
                      </div>
                      <SessionStatus session={session} />
                      <StatusBadge tone="neutral">{source}</StatusBadge>
                      {clientName ? (
                        <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                          {clientName}
                        </span>
                      ) : null}
                    </div>

                    <h2 className="mt-4 text-base font-semibold">
                      {session.agent_label ?? session.agent_id}
                    </h2>
                    <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
                      {session.id}
                    </p>

                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {session.scopes.map((scope) => (
                        <ScopeChip key={scope} scope={scope} />
                      ))}
                    </div>
                  </div>

                  <div className="grid gap-3 text-sm lg:min-w-80">
                    <div className="grid gap-2 rounded-md border border-border bg-background/40 p-3">
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Agent ID</span>
                        <span className="truncate text-right font-mono">
                          {session.agent_id}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Treasury</span>
                        <span className="text-right font-mono">
                          {session.treasury_pda
                            ? formatAddress(session.treasury_pda)
                            : "Unscoped"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Created</span>
                        <span className="text-right">
                          {formatDateTime(session.created_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between gap-4">
                        <span className="text-muted-foreground">Expires</span>
                        <span className="text-right">
                          {formatDateTime(session.expires_at)}
                        </span>
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        type="button"
                        variant="danger"
                        size="small"
                        disabled={!isActiveSession(session)}
                        onClick={() => setRevokeTarget(session)}
                      >
                        Revoke
                      </Button>
                    </div>
                  </div>
                </div>
              </DashboardPanel>
            );
          })}
        </section>
      )}
    </DashboardContent>
  );
}
