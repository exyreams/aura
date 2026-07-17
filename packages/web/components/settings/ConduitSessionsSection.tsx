import { Bot, RefreshCw, ShieldOff } from "lucide-react";
import Link from "next/link";
import { DashboardErrorState } from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { Skeleton } from "@/components/global/Skeleton";
import { StatusBadge } from "@/components/global/StatusBadge";
import { Tooltip } from "@/components/global/Tooltip";
import {
  SettingsRow,
  SettingsSection,
} from "@/components/settings/SettingsPrimitives";
import {
  formatDateTime,
  getErrorMessage,
  isRevokable,
  statusTone,
} from "@/components/settings/utils";
import { getAgentScopeLabel } from "@/lib/agents/scopes";
import type { AgentKeypair } from "@/lib/hooks";

export function ConduitSessionsSection({
  agents,
  isLoading,
  error,
  isDeleting,
  revokingAgentId,
  onRefresh,
  onRevoke,
}: {
  agents: AgentKeypair[];
  isLoading: boolean;
  error: unknown;
  isDeleting: boolean;
  revokingAgentId: string | null;
  onRefresh: () => void;
  onRevoke: (agent: AgentKeypair) => void;
}) {
  return (
    <SettingsSection
      id="conduit"
      icon={Bot}
      eyebrow="Conduit"
      title="Authorized agent sessions"
      description="Conduit sessions are scoped agent authorizations. Revoke anything that should no longer operate under this account."
    >
      <div className="grid gap-0">
        <SettingsRow
          label="Sessions"
          description="Active and historical agent authorizations for this account."
        >
          <div className="mb-4 flex flex-col gap-2 sm:flex-row">
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={onRefresh}
              disabled={isLoading}
              icon={
                <RefreshCw
                  className={isLoading ? "size-3 animate-spin" : "size-3"}
                  aria-hidden="true"
                />
              }
            >
              Refresh
            </Button>
            <Link
              href="/dashboard/agents"
              className="inline-flex min-h-10 items-center justify-center rounded-sm border border-border bg-(--card-bg) px-4 py-2 font-mono font-bold text-[10px] text-(--text-main) uppercase tracking-wider transition-colors hover:border-primary hover:bg-(--hover-bg) focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-(--primary) focus-visible:ring-offset-2 focus-visible:ring-offset-(--bg)"
            >
              Manage agents
            </Link>
          </div>

          {isLoading ? (
            <div className="grid gap-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-16" />
            </div>
          ) : error ? (
            <DashboardErrorState
              title="Couldn't load Conduit sessions"
              description={getErrorMessage(error)}
              onRetry={onRefresh}
            />
          ) : agents.length === 0 ? (
            <div className="rounded-md border border-dashed border-border px-4 py-8 text-center">
              <Bot
                className="mx-auto size-6 text-muted-foreground"
                aria-hidden="true"
              />
              <h3 className="mt-3 text-sm font-semibold">
                No Conduit sessions yet
              </h3>
              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
                Run the Conduit agent login flow, then approve it from the
                device page with your linked owner wallet.
              </p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border border-border">
              {agents.slice(0, 4).map((agent) => (
                <AgentSessionRow
                  key={agent.id}
                  agent={agent}
                  loading={isDeleting && revokingAgentId === agent.id}
                  onRevoke={onRevoke}
                />
              ))}
            </div>
          )}
        </SettingsRow>
      </div>
    </SettingsSection>
  );
}

function AgentSessionRow({
  agent,
  loading,
  onRevoke,
}: {
  agent: AgentKeypair;
  loading: boolean;
  onRevoke: (agent: AgentKeypair) => void;
}) {
  const visibleScopes = agent.scopes.slice(0, 3);
  const hiddenScopeCount = Math.max(
    agent.scopes.length - visibleScopes.length,
    0,
  );

  return (
    <div className="grid gap-3 border-border border-t p-4 first:border-t-0 lg:grid-cols-[minmax(0,1fr)_160px_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate text-sm font-semibold">
            {agent.label || agent.agentId}
          </p>
          <StatusBadge tone={statusTone(agent.status)}>
            {agent.status}
          </StatusBadge>
        </div>
        <p className="mt-1 break-all font-mono text-[10px] text-muted-foreground">
          {agent.agentId}
        </p>
        <div className="mt-2 flex flex-wrap gap-1">
          {visibleScopes.map((scope) => (
            <ScopeChip key={scope} scope={scope} />
          ))}
          {hiddenScopeCount > 0 ? (
            <span className="inline-flex cursor-default items-center rounded-sm border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
              +{hiddenScopeCount}
            </span>
          ) : null}
        </div>
      </div>

      <div className="text-left lg:text-right">
        <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
          Expires
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {agent.expiresAt ? formatDateTime(agent.expiresAt) : "Never"}
        </p>
      </div>
      <div className="flex lg:justify-end">
        <Button
          type="button"
          variant="danger"
          size="small"
          onClick={() => onRevoke(agent)}
          loading={loading}
          disabled={loading || !isRevokable(agent.status)}
          icon={<ShieldOff className="size-3" aria-hidden="true" />}
        >
          Revoke
        </Button>
      </div>
    </div>
  );
}

function ScopeChip({ scope }: { scope: string }) {
  return (
    <Tooltip content={getAgentScopeLabel(scope)}>
      <span className="inline-flex cursor-default items-center rounded-sm border border-border bg-background px-2 py-0.5 font-mono text-[9px] uppercase tracking-wide text-muted-foreground">
        {scope}
      </span>
    </Tooltip>
  );
}
