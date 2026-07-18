"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Info, KeyRound, RefreshCw, ShieldCheck, Users } from "lucide-react";
import { Button } from "@/components/global/Button";
import { Checkbox } from "@/components/global/Checkbox";
import { Skeleton } from "@/components/global/Skeleton";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useToast } from "@/components/global/Toast";
import { Tooltip } from "@/components/global/Tooltip";
import {
  AGENT_WALLET_PERMISSION_SCOPES,
  type AgentWalletPermissionScope,
  findActiveWalletPermission,
  getAgentWalletPermissionLabel,
  walletPermissionScopesForAgent,
} from "@/lib/agents/wallet-permissions";
import { formatAddress } from "@/lib/formatting/addresses";
import {
  type AgentKeypair,
  useAgents,
  useAgentWalletPermissions,
} from "@/lib/hooks";
import type {
  AgentWalletPermissionRow,
  WalletRegistryRow,
} from "@/lib/supabase/types";
import { cn } from "@/lib/utils";

interface UpdateWalletPermissionBody {
  walletId: string;
  agentSessionId: string;
  scopes: AgentWalletPermissionScope[];
}

async function updateWalletPermission(body: UpdateWalletPermissionBody) {
  const response = await fetch("/api/wallets/agent-permissions", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as {
    permission?: AgentWalletPermissionRow;
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not update wallet access.");
  }

  return payload.permission;
}

function scopeDescription(scope: AgentWalletPermissionScope) {
  switch (scope) {
    case "wallet:read":
      return "Allows this agent session to inspect wallet metadata and balances.";
    case "wallet:create":
      return "Allows this agent session to record pending dWallets for owner linking.";
    case "wallet:transfer":
      return "Allows this agent session to receive owner-reviewed transfer requests for this wallet.";
  }
}

function agentDisplayAddress(agent: AgentKeypair) {
  return agent.publicKey
    ? formatAddress(agent.publicKey)
    : formatAddress(agent.id);
}

const permissionGridClass =
  "grid min-w-[600px] grid-cols-[minmax(220px,1fr)_repeat(3,minmax(108px,128px))] items-center gap-3";

function nextScopes(
  currentScopes: readonly string[],
  scope: AgentWalletPermissionScope,
  checked: boolean,
) {
  const current = currentScopes.filter(
    (value): value is AgentWalletPermissionScope =>
      AGENT_WALLET_PERMISSION_SCOPES.includes(
        value as AgentWalletPermissionScope,
      ),
  );

  if (checked) {
    return Array.from(new Set([...current, scope]));
  }

  return current.filter((candidate) => candidate !== scope);
}

export function WalletAgentPermissions({
  wallet,
}: {
  wallet: WalletRegistryRow;
}) {
  const { agents, isLoading: agentsLoading } = useAgents();
  const permissionsQuery = useAgentWalletPermissions();
  const queryClient = useQueryClient();
  const toast = useToast();
  const activeWalletAgents = agents.filter(
    (agent) =>
      agent.status === "active" &&
      walletPermissionScopesForAgent(agent.scopes).length > 0,
  );
  const permissions = permissionsQuery.data ?? [];
  const mutation = useMutation({
    mutationFn: updateWalletPermission,
    onSuccess: async (_permission, variables) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: ["agent-wallet-permissions"],
        }),
        queryClient.invalidateQueries({ queryKey: ["wallet-registry"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
      const agent = agents.find(
        (candidate) => candidate.id === variables.agentSessionId,
      );
      toast.success("Wallet access updated", {
        description: agent
          ? `${agent.label} permissions were saved for this wallet.`
          : "The wallet permission grant was saved.",
      });
    },
    onError: (error) => {
      toast.danger("Could not update wallet access", {
        description:
          error instanceof Error
            ? error.message
            : "The wallet permission grant could not be saved.",
      });
    },
  });

  const loading = agentsLoading || permissionsQuery.isLoading;
  const error =
    permissionsQuery.error instanceof Error
      ? permissionsQuery.error.message
      : null;

  const handleScopeChange = (
    agent: AgentKeypair,
    permission: AgentWalletPermissionRow | null,
    scope: AgentWalletPermissionScope,
    checked: boolean,
  ) => {
    mutation.mutate({
      walletId: wallet.id,
      agentSessionId: agent.id,
      scopes: nextScopes(permission?.scopes ?? [], scope, checked),
    });
  };

  return (
    <section className="mt-5 overflow-hidden rounded-md border border-border bg-background">
      <div className="flex flex-col gap-3 border-b border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
            <Users className="size-4 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <h3 className="text-sm font-semibold">Agent wallet access</h3>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Grant wallet scopes per agent session. Transfer still requires
              owner review before anything can execute.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="small"
          onClick={() => void permissionsQuery.refetch()}
          disabled={permissionsQuery.isFetching}
        >
          <RefreshCw className="size-3.5" aria-hidden />
          Refresh
        </Button>
      </div>

      {loading ? (
        <div className="grid gap-3 p-4">
          <Skeleton className="h-16" />
          <Skeleton className="h-16" />
        </div>
      ) : error ? (
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-danger">{error}</p>
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={() => void permissionsQuery.refetch()}
          >
            Retry
          </Button>
        </div>
      ) : activeWalletAgents.length === 0 ? (
        <div className="flex items-start gap-3 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
            <KeyRound className="size-4 text-muted-foreground" aria-hidden />
          </div>
          <div>
            <p className="text-sm font-medium">No wallet-capable agents</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              Add wallet scopes to an active agent before assigning wallet
              access here.
            </p>
          </div>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <div className="min-w-[600px]">
            <div
              className={cn(
                permissionGridClass,
                "border-b border-border bg-surface/40 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-muted-foreground",
              )}
            >
              <span>Agent</span>
              {AGENT_WALLET_PERMISSION_SCOPES.map((scope) => (
                <span
                  key={scope}
                  className="inline-flex min-h-8 items-center justify-center gap-1.5 px-2 text-center"
                >
                  <span>{getAgentWalletPermissionLabel(scope)}</span>
                  <Tooltip content={scopeDescription(scope)}>
                    <button
                      type="button"
                      className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                      aria-label={`${getAgentWalletPermissionLabel(scope)} scope details`}
                    >
                      <Info className="size-3.5" aria-hidden />
                    </button>
                  </Tooltip>
                </span>
              ))}
            </div>

            <div className="divide-y divide-border">
              {activeWalletAgents.map((agent) => {
                const permission = findActiveWalletPermission(
                  permissions,
                  wallet.id,
                  agent.id,
                );
                const grantedScopes = permission?.scopes ?? [];
                const pending =
                  mutation.isPending &&
                  mutation.variables?.agentSessionId === agent.id;
                const isWalletSigner = wallet.agent_session_id === agent.id;

                return (
                  <div
                    key={agent.id}
                    className={cn(
                      permissionGridClass,
                      "px-4 py-3",
                      pending && "opacity-80",
                    )}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-medium">
                          {agent.label}
                        </p>
                        {isWalletSigner ? (
                          <StatusBadge tone="success">
                            wallet signer
                          </StatusBadge>
                        ) : null}
                        {permission ? (
                          <StatusBadge tone="success">
                            {permission.grant_source.replaceAll("_", " ")}
                          </StatusBadge>
                        ) : (
                          <StatusBadge tone="neutral">no grant</StatusBadge>
                        )}
                      </div>
                      <div className="mt-1 flex min-w-0 items-center gap-2 font-mono text-xs text-muted-foreground">
                        <ShieldCheck
                          className="size-3.5 shrink-0"
                          aria-hidden
                        />
                        <span className="truncate">
                          {agentDisplayAddress(agent)}
                        </span>
                      </div>
                    </div>

                    {AGENT_WALLET_PERMISSION_SCOPES.map((scope) => {
                      const allowedByAgent = agent.scopes.includes(scope);
                      const checked = grantedScopes.includes(scope);
                      const label = getAgentWalletPermissionLabel(scope);
                      const disabled = pending || !allowedByAgent;
                      const checkbox = (
                        <Checkbox
                          key={scope}
                          checked={checked}
                          disabled={disabled}
                          onChange={(nextChecked) =>
                            handleScopeChange(
                              agent,
                              permission,
                              scope,
                              nextChecked,
                            )
                          }
                          className="min-h-10 w-full justify-center gap-0 rounded-md px-2 py-2 transition-colors hover:bg-muted/40"
                        >
                          <span className="sr-only">
                            {label} access for {agent.label}
                          </span>
                        </Checkbox>
                      );

                      return allowedByAgent ? (
                        <div key={scope}>{checkbox}</div>
                      ) : (
                        <Tooltip
                          key={scope}
                          className="w-full"
                          content="Enable this scope on the agent before granting it for this wallet."
                        >
                          <span className="block w-full">{checkbox}</span>
                        </Tooltip>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
