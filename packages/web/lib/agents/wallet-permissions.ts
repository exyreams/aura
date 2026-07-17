import type { AgentWalletPermissionRow } from "@/lib/supabase/types";

export const AGENT_WALLET_PERMISSION_SCOPES = [
  "wallet:read",
  "wallet:create",
  "wallet:transfer",
] as const;

export type AgentWalletPermissionScope =
  (typeof AGENT_WALLET_PERMISSION_SCOPES)[number];

const walletPermissionScopeSet = new Set<string>(
  AGENT_WALLET_PERMISSION_SCOPES,
);

export function isAgentWalletPermissionScope(
  value: string,
): value is AgentWalletPermissionScope {
  return walletPermissionScopeSet.has(value);
}

export function getAgentWalletPermissionLabel(scope: string) {
  switch (scope) {
    case "wallet:read":
      return "Read";
    case "wallet:create":
      return "Create";
    case "wallet:transfer":
      return "Transfer";
    default:
      return scope;
  }
}

export function normalizeAgentWalletPermissionScopes(
  value: unknown,
  agentScopes?: readonly string[],
) {
  if (!Array.isArray(value)) {
    return [];
  }

  const scopes = value
    .filter((scope): scope is string => typeof scope === "string")
    .filter(isAgentWalletPermissionScope);

  const uniqueScopes = Array.from(new Set(scopes));

  if (!agentScopes) {
    return uniqueScopes;
  }

  return uniqueScopes.filter((scope) => agentScopes.includes(scope));
}

export function walletPermissionScopesForAgent(agentScopes: readonly string[]) {
  return AGENT_WALLET_PERMISSION_SCOPES.filter((scope) =>
    agentScopes.includes(scope),
  );
}

export function defaultAgentCreatedWalletScopes(
  agentScopes: readonly string[],
) {
  return walletPermissionScopesForAgent(agentScopes).filter(
    (scope) => scope !== "wallet:transfer",
  );
}

export function findActiveWalletPermission(
  permissions: readonly AgentWalletPermissionRow[],
  walletId: string,
  agentSessionId: string,
) {
  return (
    permissions.find(
      (permission) =>
        permission.wallet_id === walletId &&
        permission.agent_session_id === agentSessionId &&
        permission.status === "active",
    ) ?? null
  );
}

export function hasAgentWalletPermission(
  permissions: readonly AgentWalletPermissionRow[],
  walletId: string,
  agentSessionId: string,
  scope: AgentWalletPermissionScope,
) {
  return Boolean(
    findActiveWalletPermission(
      permissions,
      walletId,
      agentSessionId,
    )?.scopes.includes(scope),
  );
}
