"use client";

import { AgentCard } from "@/components/agents/AgentCard";
import { Alert, Skeleton } from "@/components/global";
import type { TreasuryEntry } from "@/lib/aura-app";
import type { AgentKeypair } from "@/lib/hooks";
import { useAgents } from "@/lib/hooks";

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function linkedFor(agent: AgentKeypair, treasuries: TreasuryEntry[]) {
  return treasuries.filter((treasury) => {
    const authority = treasury.account.aiAuthority?.toString?.() ?? "";
    return (
      treasury.account.agentId === agent.agentId ||
      authority === agent.publicKey
    );
  });
}

export function AgentList({ treasuries }: { treasuries: TreasuryEntry[] }) {
  const {
    agents,
    selectedAgent,
    setSelectedAgentId,
    isLoading,
    error,
    deleteAgent,
    deleteAgentMutation,
    downloadAgentIdentity,
  } = useAgents();

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-48" />
        <Skeleton className="h-48" />
      </div>
    );
  }

  if (error) {
    return <Alert variant="error" message={error} />;
  }

  if (agents.length === 0) {
    return (
      <div className="rounded-sm border border-dashed border-border p-8 text-center">
        <p className="text-sm text-(--text-muted)">
          No agent keypairs yet. Create one to sign backend-assisted treasury
          actions.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {agents.map((agent) => (
        <AgentCard
          key={agent.id}
          agent={agent}
          selected={selectedAgent?.agentId === agent.agentId}
          linkedTreasuries={linkedFor(agent, treasuries)}
          deleting={deleteAgentMutation.isPending}
          onSelect={() => setSelectedAgentId(agent.agentId)}
          onDownload={async () => {
            const identity = await downloadAgentIdentity(agent);
            downloadJson(`${agent.agentId}.aura-agent.json`, identity);
          }}
          onDelete={() => {
            if (
              window.confirm(
                `Delete agent '${agent.agentId}'? This removes the encrypted signer from the backend vault.`,
              )
            ) {
              void deleteAgent(agent.id);
            }
          }}
        />
      ))}
    </div>
  );
}
