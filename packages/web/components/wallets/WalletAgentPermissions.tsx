"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, RefreshCw, ShieldCheck, Users } from "lucide-react";
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
                  "grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_minmax(320px,auto)] md:items-center",
                  pending && "opacity-80",
                )}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {agent.label}
                    </p>
                    {isWalletSigner ? (
                      <StatusBadge tone="success">wallet signer</StatusBadge>
                    ) : null}
                    {permission ? (
                      <StatusBadge tone="success">
                        {permission.grant_source.replaceAll("_", " ")}
                      </StatusBadge>
                    ) : (
                      <StatusBadge tone="neutral">no grant</StatusBadge>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-2 font-mono text-xs text-muted-foreground">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    <span>{agentDisplayAddress(agent)}</span>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-3">
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
                        className="rounded-md border border-border bg-surface px-3 py-2"
                      >
                        <span
                          className={cn(
                            "grid gap-0.5 text-left",
                            disabled && "text-muted-foreground",
                          )}
                        >
                          <span className="text-sm font-medium">{label}</span>
                          <span className="text-[11px] leading-4 text-muted-foreground">
                            {scopeDescription(scope)}
                          </span>
                        </span>
                      </Checkbox>
                    );

                    return allowedByAgent ? (
                      <div key={scope}>{checkbox}</div>
                    ) : (
                      <Tooltip
                        key={scope}
                        content="Enable this scope on the agent before granting it for this wallet."
                      >
                        <div>{checkbox}</div>
                      </Tooltip>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
