export const AGENT_SCOPE_OPTIONS = [
  {
    value: "read",
    label: "Read session",
    description: "Allows the agent to identify itself and inspect basic state.",
  },
  {
    value: "wallet:read",
    label: "Read wallets",
    description: "Allows wallet registry and live balance reads.",
  },
  {
    value: "policy:preview",
    label: "Preview policy",
    description: "Allows dry-run checks before a proposal is created.",
  },
  {
    value: "proposal:create",
    label: "Create proposals",
    description: "Allows draft proposal creation for owner review.",
  },
  {
    value: "proposal:execute",
    label: "Execute proposals",
    description: "Allows execution requests after policy and approvals pass.",
  },
  {
    value: "wallet:transfer",
    label: "Request transfers",
    description: "Allows transfer requests through the gated wallet flow.",
  },
  {
    value: "session:admin",
    label: "Session admin",
    description: "Allows session-management requests such as rotation.",
  },
] as const;

export type AgentScope = (typeof AGENT_SCOPE_OPTIONS)[number]["value"];

export const DEFAULT_AGENT_SCOPES: AgentScope[] = [
  "read",
  "wallet:read",
  "policy:preview",
];

const agentScopeSet = new Set<string>(
  AGENT_SCOPE_OPTIONS.map((scope) => scope.value),
);

export function normalizeAgentScopes(value: unknown): AgentScope[] {
  if (!Array.isArray(value)) {
    return DEFAULT_AGENT_SCOPES;
  }

  const uniqueScopes = value
    .filter((scope): scope is string => typeof scope === "string")
    .filter((scope) => agentScopeSet.has(scope));

  return Array.from(new Set(uniqueScopes)) as AgentScope[];
}

export function isAgentScope(value: string): value is AgentScope {
  return agentScopeSet.has(value);
}
