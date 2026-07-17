"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Ban,
  CalendarClock,
  Eye,
  KeyRound,
  MonitorCheck,
  PlugZap,
  RefreshCw,
  Search,
  Shield,
  SlidersHorizontal,
  TerminalSquare,
} from "lucide-react";
import Link from "next/link";
import type { ComponentType } from "react";
import { useMemo, useState } from "react";
import { CreateAgentModal } from "@/components/agents/CreateAgentModal";
import { EditAgentScopesModal } from "@/components/agents/EditAgentScopesModal";
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
import { Tooltip } from "@/components/global/Tooltip";
import { getAgentScopeLabel } from "@/lib/agents/scopes";
import {
  type AgentSessionWithUsage,
  formatSessionDateTime,
  isAgentSessionActive,
  isAgentSessionEditable,
  isDeviceFlowSession,
  metadataObject,
  metadataString,
  sessionSource,
  sessionStatusLabel,
  sessionStatusTone,
} from "@/lib/agents/session-model";
import { formatAddress } from "@/lib/formatting/addresses";
import { useAgentSessions } from "@/lib/hooks/use-agent-sessions";
import { cn } from "@/lib/utils";

type SessionFilter = "active" | "attention" | "device" | "revoked" | "all";

interface ConduitSessionManagerProps {
  eyebrow: string;
  title: string;
  description: string;
  allowCreateSigner?: boolean;
}

const filterOptions: Array<{
  value: SessionFilter;
  label: string;
}> = [
  { value: "active", label: "Active" },
  { value: "attention", label: "Review" },
  { value: "device", label: "Conduit auth" },
  { value: "revoked", label: "Revoked" },
  { value: "all", label: "All" },
];

function isAttentionSession(session: AgentSessionWithUsage) {
  return (
    sessionStatusLabel(session) === "Expired" ||
    sessionStatusLabel(session) === "Suspended"
  );
}

function filterSession(session: AgentSessionWithUsage, filter: SessionFilter) {
  switch (filter) {
    case "active":
      return isAgentSessionActive(session);
    case "attention":
      return isAttentionSession(session);
    case "device":
      return isDeviceFlowSession(session);
    case "revoked":
      return session.status === "revoked";
    case "all":
      return true;
  }
}

function matchesSearch(session: AgentSessionWithUsage, search: string) {
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
    session.last_used_at,
    ...session.scopes,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query);
}

function ScopeChip({ scope }: { scope: string }) {
  return (
    <Tooltip content={getAgentScopeLabel(scope)}>
      <span className="inline-flex cursor-default items-center rounded-sm border border-border bg-background px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-muted-foreground">
        {scope}
      </span>
    </Tooltip>
  );
}

function SessionStatus({ session }: { session: AgentSessionWithUsage }) {
  return (
    <StatusBadge tone={sessionStatusTone(session)}>
      {sessionStatusLabel(session)}
    </StatusBadge>
  );
}

function SummaryCell({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: number;
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
}) {
  return (
    <div className="flex min-h-20 items-center justify-between gap-4 border-border border-b px-4 py-3 sm:border-r md:border-b-0 last:sm:border-r-0">
      <div>
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      </div>
      <Icon className="size-5 text-muted-foreground" aria-hidden />
    </div>
  );
}

function SessionSkeletonList() {
  return (
    <section className="overflow-hidden rounded-lg border border-border bg-surface">
      {[0, 1, 2].map((item) => (
        <div
          key={item}
          className="grid gap-4 border-b border-border p-4 last:border-b-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.75fr)_minmax(14rem,0.55fr)_auto]"
        >
          <div className="space-y-3">
            <div className="h-4 w-40 animate-pulse rounded bg-muted" />
            <div className="h-3 w-64 animate-pulse rounded bg-muted" />
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="h-7 w-24 animate-pulse rounded bg-muted" />
            <div className="h-7 w-28 animate-pulse rounded bg-muted" />
            <div className="h-7 w-20 animate-pulse rounded bg-muted" />
          </div>
          <div className="space-y-2">
            <div className="h-3 w-28 animate-pulse rounded bg-muted" />
            <div className="h-3 w-36 animate-pulse rounded bg-muted" />
          </div>
          <div className="h-10 w-32 animate-pulse rounded bg-muted" />
        </div>
      ))}
    </section>
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

function SessionDetailsModal({
  session,
  loading,
  onClose,
  onEditScopes,
  onRevoke,
}: {
  session: AgentSessionWithUsage | null;
  loading: boolean;
  onClose: () => void;
  onEditScopes: (session: AgentSessionWithUsage) => void;
  onRevoke: (session: AgentSessionWithUsage) => void;
}) {
  const metadata = session ? metadataObject(session.metadata) : {};
  const ownerWallet =
    session && metadataString(session.metadata, "owner_wallet")
      ? metadataString(session.metadata, "owner_wallet")
      : null;
  const authorityPublicKey =
    session && metadataString(session.metadata, "authority_public_key")
      ? metadataString(session.metadata, "authority_public_key")
      : null;
  const clientName =
    session && metadataString(session.metadata, "client_name")
      ? metadataString(session.metadata, "client_name")
      : null;

  return (
    <Modal
      isOpen={Boolean(session)}
      onClose={onClose}
      ariaLabelledBy="agent-session-details-title"
      ariaDescribedBy="agent-session-details-description"
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
              id="agent-session-details-title"
              className="mt-4 text-lg font-semibold"
            >
              {session.agent_label ?? session.agent_id}
            </h2>
            <p
              id="agent-session-details-description"
              className="mt-2 text-sm leading-6 text-muted-foreground"
            >
              Review the runtime identity, scopes, owner wallet, and token usage
              before changing access.
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
              label="Signer authority"
              value={
                authorityPublicKey
                  ? formatAddress(authorityPublicKey)
                  : "Session only"
              }
              mono={Boolean(authorityPublicKey)}
            />
            <DetailLine
              label="Created"
              value={formatSessionDateTime(session.created_at)}
            />
            <DetailLine
              label="Last used"
              value={
                session.last_used_at
                  ? formatSessionDateTime(session.last_used_at)
                  : "Never used"
              }
            />
            <DetailLine
              label="Expires"
              value={formatSessionDateTime(session.expires_at)}
            />
            <DetailLine
              label="Revoked"
              value={formatSessionDateTime(session.revoked_at)}
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
              variant="secondary"
              disabled={!isAgentSessionEditable(session)}
              onClick={() => onEditScopes(session)}
            >
              Edit scopes
            </Button>
            <Button
              type="button"
              variant="danger"
              loading={loading}
              disabled={!isAgentSessionActive(session)}
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
  session: AgentSessionWithUsage | null;
  open: boolean;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      ariaLabelledBy="revoke-agent-session-title"
      ariaDescribedBy="revoke-agent-session-description"
      className="sm:max-w-md"
    >
      <div className="grid gap-5 pt-2 pr-8">
        <div>
          <h2 id="revoke-agent-session-title" className="text-lg font-semibold">
            Revoke agent session
          </h2>
          <p
            id="revoke-agent-session-description"
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
      ariaLabelledBy="revoke-all-agent-sessions-title"
      ariaDescribedBy="revoke-all-agent-sessions-description"
      className="sm:max-w-md"
    >
      <div className="grid gap-5 pt-2 pr-8">
        <div>
          <h2
            id="revoke-all-agent-sessions-title"
            className="text-lg font-semibold"
          >
            Revoke all active sessions
          </h2>
          <p
            id="revoke-all-agent-sessions-description"
            className="mt-2 text-sm leading-6 text-muted-foreground"
          >
            This revokes {count} active bearer token
            {count === 1 ? "" : "s"}. Agents must request Conduit authorization
            again.
          </p>
        </div>

        <div className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-warning">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p className="text-sm leading-6">
            Use this when a connected agent runtime, workspace, or AI client
            environment may be compromised.
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

function SessionTimeline({ session }: { session: AgentSessionWithUsage }) {
  return (
    <dl className="grid gap-2 text-sm">
      <div>
        <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Last used
        </dt>
        <dd className="mt-1 truncate">
          {session.last_used_at
            ? formatSessionDateTime(session.last_used_at)
            : "Never used"}
        </dd>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Created
          </dt>
          <dd className="mt-1 truncate">
            {formatSessionDateTime(session.created_at)}
          </dd>
        </div>
        <div>
          <dt className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Expires
          </dt>
          <dd className="mt-1 truncate">
            {formatSessionDateTime(session.expires_at)}
          </dd>
        </div>
      </div>
    </dl>
  );
}

function SessionRow({
  session,
  onDetails,
  onEditScopes,
  onRevoke,
}: {
  session: AgentSessionWithUsage;
  onDetails: (session: AgentSessionWithUsage) => void;
  onEditScopes: (session: AgentSessionWithUsage) => void;
  onRevoke: (session: AgentSessionWithUsage) => void;
}) {
  const clientName = metadataString(session.metadata, "client_name");
  const authorityPublicKey = metadataString(
    session.metadata,
    "authority_public_key",
  );
  const source = sessionSource(session);
  const visibleScopes = session.scopes.slice(0, 5);
  const hiddenScopes = Math.max(
    session.scopes.length - visibleScopes.length,
    0,
  );

  return (
    <article className="grid gap-4 border-b border-border p-4 last:border-b-0 lg:grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.75fr)_minmax(14rem,0.55fr)_auto] lg:items-center">
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
          {authorityPublicKey ? (
            <StatusBadge tone="success">Signer</StatusBadge>
          ) : null}
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
          {session.agent_id}
        </p>
        <p className="mt-1 truncate font-mono text-[10px] text-muted-foreground">
          {session.id}
        </p>
      </div>

      <div className="min-w-0">
        <div className="flex flex-wrap gap-1.5">
          {visibleScopes.map((scope) => (
            <ScopeChip key={scope} scope={scope} />
          ))}
          {hiddenScopes > 0 ? (
            <span className="inline-flex items-center rounded-sm border border-border bg-background px-2 py-1 font-mono text-[10px] text-muted-foreground">
              +{hiddenScopes}
            </span>
          ) : null}
        </div>
        <p className="mt-3 truncate text-sm text-muted-foreground">
          {session.treasury_pda
            ? `Treasury ${formatAddress(session.treasury_pda)}`
            : "No treasury binding"}
        </p>
      </div>

      <SessionTimeline session={session} />

      <div className="grid grid-cols-3 gap-2 lg:min-w-36 lg:grid-cols-1">
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
          variant="secondary"
          size="small"
          disabled={!isAgentSessionEditable(session)}
          icon={<SlidersHorizontal className="size-4" aria-hidden="true" />}
          onClick={() => onEditScopes(session)}
        >
          Scopes
        </Button>
        <Button
          type="button"
          variant="danger"
          size="small"
          disabled={!isAgentSessionActive(session)}
          onClick={() => onRevoke(session)}
        >
          Revoke
        </Button>
      </div>
    </article>
  );
}

export function ConduitSessionManager({
  allowCreateSigner = false,
  eyebrow,
  title,
  description,
}: ConduitSessionManagerProps) {
  const sessionsQuery = useAgentSessions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [filter, setFilter] = useState<SessionFilter>("active");
  const [search, setSearch] = useState("");
  const [detailsTarget, setDetailsTarget] =
    useState<AgentSessionWithUsage | null>(null);
  const [scopeTarget, setScopeTarget] = useState<AgentSessionWithUsage | null>(
    null,
  );
  const [revokeTarget, setRevokeTarget] =
    useState<AgentSessionWithUsage | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [revokeAllOpen, setRevokeAllOpen] = useState(false);
  const sessions = sessionsQuery.data ?? [];

  const activeSessions = useMemo(
    () => sessions.filter(isAgentSessionActive),
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
  const attentionSessions = useMemo(
    () => sessions.filter(isAttentionSession),
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
    attention: attentionSessions.length,
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
      toast.success("Agent session revoked");
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
      toast.success("Agent sessions revoked", {
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
        onEditScopes={(session) => {
          setScopeTarget(session);
          setDetailsTarget(null);
        }}
        onRevoke={(session) => setRevokeTarget(session)}
      />

      {allowCreateSigner ? (
        <CreateAgentModal
          open={createOpen}
          onClose={() => setCreateOpen(false)}
        />
      ) : null}

      <EditAgentScopesModal
        agent={scopeTarget}
        onClose={() => setScopeTarget(null)}
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
            {eyebrow}
          </span>
          <h1 className="mb-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            {title}
          </h1>
          <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
            {description}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {allowCreateSigner ? (
            <Button
              type="button"
              onClick={() => setCreateOpen(true)}
              icon={<KeyRound className="size-4" aria-hidden="true" />}
            >
              New signer
            </Button>
          ) : null}
          <Link
            href="/conduit/authorize"
            className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-border bg-(--card-bg) px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-(--text-main) transition-colors hover:border-primary hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)"
          >
            <TerminalSquare className="size-4" aria-hidden="true" />
            Conduit auth
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

      <section className="overflow-hidden rounded-lg border border-border bg-surface">
        <div className="grid sm:grid-cols-2 md:grid-cols-5">
          <SummaryCell
            label="Active"
            value={activeSessions.length}
            icon={MonitorCheck}
          />
          <SummaryCell
            label="Needs review"
            value={attentionSessions.length}
            icon={AlertTriangle}
          />
          <SummaryCell
            label="Conduit auth"
            value={deviceFlowSessions.length}
            icon={PlugZap}
          />
          <SummaryCell
            label="Treasury scoped"
            value={scopedSessions.length}
            icon={Shield}
          />
          <SummaryCell
            label="Revoked"
            value={revokedSessions.length}
            icon={CalendarClock}
          />
        </div>
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
            id="agent-session-search"
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
          title="Could not load agent sessions"
          description="Check the owner auth session and agent session policies."
          onRetry={() => void sessionsQuery.refetch()}
        />
      ) : sessions.length === 0 ? (
        <DashboardEmptyState
          icon={KeyRound}
          title="No agent sessions yet"
          description="Start a Conduit authorization request from an agent runtime, then approve the code here with your linked owner wallet."
          action={
            <Link
              href="/conduit/authorize"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-sm border border-border bg-(--card-bg) px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-wider text-(--text-main) transition-colors hover:border-primary hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)"
            >
              <TerminalSquare className="size-4" aria-hidden="true" />
              Open Conduit auth
            </Link>
          }
        />
      ) : visibleSessions.length === 0 ? (
        <DashboardEmptyState
          icon={Search}
          title="No matching sessions"
          description="Adjust the filter or search text to inspect another group of agent sessions."
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
          <div className="hidden grid-cols-[minmax(0,1.1fr)_minmax(18rem,0.75fr)_minmax(14rem,0.55fr)_8.5rem] gap-4 border-b border-border bg-background/60 px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-muted-foreground lg:grid">
            <span>Agent session</span>
            <span>Scopes</span>
            <span>Usage</span>
            <span className="text-right">Actions</span>
          </div>
          {visibleSessions.map((session) => (
            <SessionRow
              key={session.id}
              session={session}
              onDetails={setDetailsTarget}
              onEditScopes={setScopeTarget}
              onRevoke={setRevokeTarget}
            />
          ))}
        </section>
      )}
    </DashboardContent>
  );
}
