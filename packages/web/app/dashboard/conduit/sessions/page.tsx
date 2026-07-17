"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Eye,
  KeyRound,
  type LucideIcon,
  MonitorCheck,
  PlugZap,
  RefreshCw,
  Search,
  Shield,
  TerminalSquare,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import {
  DashboardContent,
  DashboardEmptyState,
  DashboardErrorState,
} from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { Input } from "@/components/global/Input";
import { Modal } from "@/components/global/Modal";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useToast } from "@/components/global/Toast";
import { getAgentScopeLabel } from "@/lib/agents/scopes";
import { formatAddress } from "@/lib/formatting/addresses";
import { useAgentSessions } from "@/lib/hooks/use-agent-sessions";
import type { AgentSessionRow, Json } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

type SessionFilter = "active" | "device" | "revoked" | "all";

const filterOptions: Array<{
  value: SessionFilter;
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "device", label: "Device flow" },
  { value: "revoked", label: "Revoked" },
  { value: "all", label: "All" },
];

function metadataObject(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, Json | undefined>;
}

function metadataString(metadata: Json, key: string) {
  const value = metadataObject(metadata)[key];
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

function isDeviceFlowSession(session: AgentSessionRow) {
  return (
    metadataString(session.metadata, "created_via") === "conduit_device_flow"
  );
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

function sessionStatusTone(session: AgentSessionRow) {
  if (session.status === "revoked") {
    return "danger" as const;
  }

  if (isExpired(session) || session.status === "expired") {
    return "warning" as const;
  }

  if (session.status === "suspended") {
    return "warning" as const;
  }

  return "success" as const;
}

function sessionStatusLabel(session: AgentSessionRow) {
  if (session.status === "revoked") {
    return "Revoked";
  }

  if (isExpired(session) || session.status === "expired") {
    return "Expired";
  }

  if (session.status === "suspended") {
    return "Suspended";
  }

  return "Active";
}

function filterSession(session: AgentSessionRow, filter: SessionFilter) {
  switch (filter) {
    case "active":
      return isActiveSession(session);
    case "device":
      return isDeviceFlowSession(session);
    case "revoked":
      return session.status === "revoked";
    case "all":
      return true;
  }
}

function matchesSearch(session: AgentSessionRow, search: string) {
  const query = search.trim().toLowerCase();

  if (!query) {
    return true;
  }

  const haystack = [
    session.id,
    session.agent_id,
    session.agent_label,
    session.treasury_pda,
    sessionSource(session),
    metadataString(session.metadata, "client_name"),
    metadataString(session.metadata, "owner_wallet"),
    ...session.scopes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function ScopeChip({ scope }: { scope: string }) {
  return (
    <span
      title={getAgentScopeLabel(scope)}
      className="inline-flex items-center rounded-sm border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground"
    >
      {scope}
    </span>
  );
}

function SessionStatus({ session }: { session: AgentSessionRow }) {
  return (
    <StatusBadge tone={sessionStatusTone(session)}>
      {sessionStatusLabel(session)}
    </StatusBadge>
  );
}

function DetailLine({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid gap-1 border-b border-border py-3 last:border-b-0 sm:grid-cols-[11rem_1fr] sm:items-start">
      <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
        {label}
      </dt>
      <dd
        className={cn(
          "min-w-0 break-words text-sm text-foreground",
          mono && "font-mono tabular-nums",
        )}
      >
        {value}
      </dd>
    </div>
  );
}

function SummaryMetric({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: LucideIcon;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-4 rounded-lg border border-border bg-surface px-4 py-3">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </div>
      <div className="flex size-10 items-center justify-center rounded-md border border-border bg-surface-raised">
        <Icon className="size-5 text-muted-foreground" aria-hidden="true" />
      </div>
    </div>
  );
}

function SessionSkeletonList() {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="grid gap-4 border-b border-border p-4 last:border-b-0 lg:grid-cols-[1fr_1.1fr_auto]"
        >
          <div className="space-y-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 animate-pulse rounded bg-muted" />
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="h-11 animate-pulse rounded bg-muted" />
            <div className="h-11 animate-pulse rounded bg-muted" />
            <div className="h-11 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </section>
  );
}

function SessionDetailsModal({
  session,
  loading,
  onClose,
  onRevoke,
}: {
  session: AgentSessionRow | null;
  loading: boolean;
  onClose: () => void;
  onRevoke: (session: AgentSessionRow) => void;
}) {
  const metadata = session ? metadataObject(session.metadata) : {};
  const ownerWallet =
    session && metadataString(session.metadata, "owner_wallet")
      ? metadataString(session.metadata, "owner_wallet")
      : null;
  const clientName =
    session && metadataString(session.metadata, "client_name")
      ? metadataString(session.metadata, "client_name")
      : null;

  return (
    <Modal
      isOpen={Boolean(session)}
      onClose={onClose}
      ariaLabelledBy="conduit-session-details-title"
      ariaDescribedBy="conduit-session-details-description"
      className="sm:max-w-2xl"
    >
      {session ? (
        <div className="grid gap-5 pt-2 pr-8">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <SessionStatus session={session} />
              <StatusBadge tone="neutral">{sessionSource(session)}</StatusBadge>
            </div>
            <h2
              id="conduit-session-details-title"
              className="mt-4 text-lg font-semibold"
            >
              {session.agent_label ?? session.agent_id}
            </h2>
            <p
              id="conduit-session-details-description"
              className="mt-2 text-sm leading-6 text-muted-foreground"
            >
              Review the exact runtime identity, scopes, and owner-bound
              metadata before changing access.
            </p>
          </div>

          <dl className="rounded-lg border border-border bg-background px-4">
            <DetailLine label="Session ID" value={session.id} mono />
            <DetailLine label="Agent ID" value={session.agent_id} mono />
            <DetailLine
              label="Client"
              value={clientName ?? sessionSource(session)}
            />
            <DetailLine
              label="Treasury"
              value={
                session.treasury_pda
                  ? formatAddress(session.treasury_pda)
                  : "Unscoped"
              }
              mono={Boolean(session.treasury_pda)}
            />
            <DetailLine
              label="Owner wallet"
              value={ownerWallet ? formatAddress(ownerWallet) : "Not recorded"}
              mono={Boolean(ownerWallet)}
            />
            <DetailLine
              label="Created"
              value={formatDateTime(session.created_at)}
            />
            <DetailLine
              label="Updated"
              value={formatDateTime(session.updated_at)}
            />
            <DetailLine
              label="Expires"
              value={formatDateTime(session.expires_at)}
            />
            <DetailLine
              label="Revoked"
              value={formatDateTime(session.revoked_at)}
            />
          </dl>

          <div>
            <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Scopes
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {session.scopes.map((scope) => (
                <ScopeChip key={scope} scope={scope} />
              ))}
            </div>
          </div>

          <details className="rounded-lg border border-border bg-background">
            <summary className="cursor-pointer px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground transition-colors hover:text-foreground">
              Metadata
            </summary>
            <pre className="max-h-60 overflow-auto border-t border-border p-4 font-mono text-xs leading-5 text-muted-foreground">
              {JSON.stringify(metadata, null, 2)}
            </pre>
          </details>

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="secondary" onClick={onClose}>
              Close
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={loading}
              disabled={!isActiveSession(session)}
              onClick={() => onRevoke(session)}
            >
              Revoke session
            </Button>
          </div>
        </div>
      ) : null}
    </Modal>
  );
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
            The bearer token stops working immediately. Owner wallet authority
            and on-chain state are unchanged.
          </p>
        </div>

        {session ? (
          <div className="grid gap-2 rounded-lg border border-border bg-background p-3">
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

        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning">
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

function SessionRow({
  session,
  onDetails,
  onRevoke,
}: {
  session: AgentSessionRow;
  onDetails: (session: AgentSessionRow) => void;
  onRevoke: (session: AgentSessionRow) => void;
}) {
  const clientName = metadataString(session.metadata, "client_name");
  const source = sessionSource(session);
  const visibleScopes = session.scopes.slice(0, 4);
  const hiddenScopes = Math.max(
    session.scopes.length - visibleScopes.length,
    0,
  );

  return (
    <article className="grid gap-4 border-b border-border p-4 last:border-b-0 lg:grid-cols-[minmax(0,1fr)_minmax(23rem,0.9fr)_auto] lg:items-center">
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

        <h2 className="mt-3 truncate text-base font-semibold">
          {session.agent_label ?? session.agent_id}
        </h2>
        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
          {session.id}
        </p>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {visibleScopes.map((scope) => (
            <ScopeChip key={scope} scope={scope} />
          ))}
          {hiddenScopes > 0 ? (
            <span className="inline-flex items-center rounded-sm border border-border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
              +{hiddenScopes}
            </span>
          ) : null}
        </div>
      </div>

      <dl className="grid gap-2 text-sm sm:grid-cols-3">
        <div className="rounded-md border border-border bg-background p-3">
          <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Treasury
          </dt>
          <dd className="mt-1 truncate font-mono">
            {session.treasury_pda
              ? formatAddress(session.treasury_pda)
              : "Unscoped"}
          </dd>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Created
          </dt>
          <dd className="mt-1 truncate">
            {formatDateTime(session.created_at)}
          </dd>
        </div>
        <div className="rounded-md border border-border bg-background p-3">
          <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Expires
          </dt>
          <dd className="mt-1 truncate">
            {formatDateTime(session.expires_at)}
          </dd>
        </div>
      </dl>

      <div className="grid grid-cols-2 gap-2 lg:min-w-40 lg:grid-cols-1">
        <Button
          type="button"
          variant="secondary"
          size="small"
          icon={<Eye className="size-4" aria-hidden="true" />}
          onClick={() => onDetails(session)}
        >
          Details
        </Button>
        <Button
          type="button"
          variant="danger"
          size="small"
          disabled={!isActiveSession(session)}
          onClick={() => onRevoke(session)}
        >
          Revoke
        </Button>
      </div>
    </article>
  );
}

export default function ConduitSessionsPage() {
  const sessionsQuery = useAgentSessions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<SessionFilter>("active");
  const [search, setSearch] = useState("");
  const [detailsTarget, setDetailsTarget] = useState<AgentSessionRow | null>(
    null,
  );
  const [revokeTarget, setRevokeTarget] = useState<AgentSessionRow | null>(
    null,
  );
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const sessions = sessionsQuery.data ?? [];

  const activeSessions = useMemo(
    () => sessions.filter(isActiveSession),
    [sessions],
  );
  const deviceFlowSessions = useMemo(
    () => sessions.filter(isDeviceFlowSession),
    [sessions],
  );
  const revokedSessions = useMemo(
    () => sessions.filter((session) => session.status === "revoked"),
    [sessions],
  );
  const scopedSessions = useMemo(
    () => sessions.filter((session) => session.treasury_pda),
    [sessions],
  );
  const visibleSessions = useMemo(
    () =>
      sessions.filter(
        (session) =>
          filterSession(session, filter) && matchesSearch(session, search),
      ),
    [filter, search, sessions],
  );

  const counts: Record<SessionFilter, number> = {
    active: activeSessions.length,
    device: deviceFlowSessions.length,
    revoked: revokedSessions.length,
    all: sessions.length,
  };

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
      setDetailsTarget(null);
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
    <DashboardContent className="max-w-[1500px]">
      <SessionDetailsModal
        session={detailsTarget}
        loading={revokeMutation.isPending}
        onClose={() => setDetailsTarget(null)}
        onRevoke={(session) => setRevokeTarget(session)}
      />

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

      <header className="flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
        <div>
          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Conduit Sessions
          </span>
          <h1 className="mb-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            AI client sessions
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            Manage CLI, MCP, and agent runtime tokens tied to your authenticated
            AURA account. Revocation stops token access without exposing owner
            wallet keys.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/conduit/device"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-border bg-(--card-bg) px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-(--text-main) transition-colors hover:border-primary hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)"
          >
            <TerminalSquare className="size-4" aria-hidden="true" />
            Device login
          </Link>
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

      <section className="grid gap-3 md:grid-cols-4">
        <SummaryMetric
          label="Active"
          value={activeSessions.length}
          icon={MonitorCheck}
        />
        <SummaryMetric
          label="Device flow"
          value={deviceFlowSessions.length}
          icon={PlugZap}
        />
        <SummaryMetric
          label="Treasury scoped"
          value={scopedSessions.length}
          icon={Shield}
        />
        <SummaryMetric
          label="Revoked"
          value={revokedSessions.length}
          icon={CalendarClock}
        />
      </section>

      <section className="rounded-lg border border-border bg-surface p-3">
        <div className="grid gap-3 lg:grid-cols-[1fr_minmax(18rem,26rem)] lg:items-end">
          <div>
            <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              View
            </p>
            <div className="grid grid-cols-2 gap-1 rounded-md border border-border bg-background p-1 sm:flex">
              {filterOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={filter === option.value}
                  onClick={() => setFilter(option.value)}
                  className={cn(
                    "min-h-10 rounded-sm px-3 font-mono text-[10px] font-bold uppercase tracking-wider transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
                    filter === option.value
                      ? "bg-primary text-background"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  {option.label}
                  <span className="ml-2 tabular-nums">
                    {counts[option.value]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <Input
            id="conduit-session-search"
            label="Search"
            value={search}
            placeholder="Agent, session, scope"
            spellCheck={false}
            onChange={(event) => setSearch(event.target.value)}
            rightAdornment={
              <Search
                className="mr-2 size-4 text-muted-foreground"
                aria-hidden
              />
            }
          />
        </div>
      </section>

      {sessionsQuery.isLoading ? (
        <SessionSkeletonList />
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
          description="Run Conduit device login from the CLI, then approve the user code in the browser to create the first runtime session."
          action={
            <Link
              href="/conduit/device"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-border bg-(--card-bg) px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-(--text-main) transition-colors hover:border-primary hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)"
            >
              <TerminalSquare className="size-4" aria-hidden="true" />
              Open device login
            </Link>
          }
        />
      ) : visibleSessions.length === 0 ? (
        <DashboardEmptyState
          icon={Search}
          title="No matching sessions"
          description="Adjust the filter or search text to inspect another group of Conduit sessions."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                setFilter("all");
                setSearch("");
              }}
            >
              Clear filters
            </Button>
          }
        />
      ) : (
        <section className="overflow-hidden rounded-lg border border-border bg-surface">
          <div className="hidden grid-cols-[minmax(0,1fr)_minmax(23rem,0.9fr)_10rem] gap-4 border-b border-border bg-background/60 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground lg:grid">
            <span>Client</span>
            <span>Scope and lifetime</span>
            <span className="text-right">Actions</span>
          </div>
          {visibleSessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onDetails={setDetailsTarget}
              onRevoke={setRevokeTarget}
            />
          ))}
        </section>
      )}
    </DashboardContent>
  );
}
