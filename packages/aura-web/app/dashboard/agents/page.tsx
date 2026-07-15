"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useEffect, useRef, useState } from "react";
import { AgentEmptyState } from "@/components/agents/AgentEmptyState";
import { AgentRow, type AgentTreasuryLink } from "@/components/agents/AgentRow";
import { AgentStatsBar } from "@/components/agents/AgentStatsBar";
import { CreateAgentModal } from "@/components/agents/CreateAgentModal";
import { DashboardContent } from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { Modal } from "@/components/global/Modal";
import { Skeleton } from "@/components/global/Skeleton";
import { Plus, RefreshCw, Zap } from "@/components/icons";
import type { AgentKeypair } from "@/lib/hooks";
import { useAgents } from "@/lib/hooks";
import { cn } from "@/lib/utils";

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

function linkedFor(agent: AgentKeypair): AgentTreasuryLink[] {
  if (!agent.treasuryPda || agent.onchainStatus !== "treasury_linked") {
    return [];
  }

  return [
    {
      agentId: agent.agentId,
      treasuryPda: agent.treasuryPda,
    },
  ];
}

function useAgentBalances(agents: AgentKeypair[]) {
  const { connection } = useConnection();
  const [balances, setBalances] = useState<Record<string, number>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const agent of agents) {
      if (!agent.publicKey || fetchedRef.current.has(agent.publicKey)) {
        continue;
      }

      fetchedRef.current.add(agent.publicKey);

      try {
        const publicKey = new PublicKey(agent.publicKey);
        connection
          .getBalance(publicKey)
          .then((lamports) => {
            setBalances((prev) => ({
              ...prev,
              [agent.publicKey]: lamports / LAMPORTS_PER_SOL,
            }));
          })
          .catch(() => {});
      } catch {
        // Session-only agents do not have a usable on-chain authority key yet.
      }
    }
  }, [agents, connection]);

  return balances;
}

function RevokeAgentModal({
  agent,
  loading,
  onClose,
  onConfirm,
}: {
  agent: AgentKeypair | null;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      isOpen={Boolean(agent)}
      onClose={onClose}
      ariaLabelledBy="revoke-agent-title"
      ariaDescribedBy="revoke-agent-description"
      className="sm:max-w-md"
    >
      <div className="grid gap-5 pt-2 pr-8">
        <div>
          <h2 id="revoke-agent-title" className="text-lg font-semibold">
            Revoke agent
          </h2>
          <p
            id="revoke-agent-description"
            className="mt-2 text-sm leading-6 text-muted-foreground"
          >
            This revokes the web session token. It does not change any on-chain
            treasury authority. Rotate or update the treasury separately if this
            signer is already the{" "}
            <span className="font-mono">ai_authority</span>.
          </p>
        </div>

        {agent ? (
          <div className="grid gap-2 rounded-sm border border-border bg-background p-3">
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Agent ID
              </span>
              <span className="truncate font-mono text-xs">
                {agent.agentId}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                Public key
              </span>
              <span className="truncate font-mono text-xs">
                {agent.publicKey || "Not recorded"}
              </span>
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

export default function AgentsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentKeypair | null>(null);
  const {
    agents,
    selectedAgent,
    setSelectedAgentId,
    isLoading,
    error,
    deleteAgent,
    deleteAgentMutation,
    downloadAgentIdentity,
    refetch,
  } = useAgents();
  const balances = useAgentBalances(agents);

  const handleRefresh = async () => {
    setRefreshing(true);
    await refetch();
    setRefreshing(false);
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    await deleteAgent(deleteTarget.id);
    setDeleteTarget(null);
  };

  const errorMessage = error instanceof Error ? error.message : null;

  return (
    <DashboardContent className="max-w-[1600px]">
      <CreateAgentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={(session) => {
          setSelectedAgentId(session.agent_id);
        }}
      />

      <RevokeAgentModal
        agent={deleteTarget}
        loading={deleteAgentMutation.isPending}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
      />

      <header className="mb-4 flex flex-col justify-between gap-4 sm:mb-2 sm:flex-row sm:items-end">
        <div>
          <span className="mb-2 block font-mono text-[10px] uppercase tracking-[0.3em] text-muted-foreground">
            Agent Vault
          </span>
          <h1 className="mb-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
            Signer Agents
          </h1>
          <p className="text-sm leading-relaxed text-muted-foreground">
            Runtime signer keypairs for AURA treasuries. Treasury and dWallet
            records are created through wallet-signed on-chain flows.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button
            type="button"
            variant="secondary"
            icon={
              <RefreshCw
                className={cn("size-3.5", refreshing && "animate-spin")}
                animateOnHover
              />
            }
            onClick={() => void handleRefresh()}
            disabled={refreshing}
          >
            Refresh
          </Button>
          <Button
            type="button"
            icon={<Plus className="size-4" animateOnHover />}
            onClick={() => setCreateOpen(true)}
          >
            New Agent
          </Button>
        </div>
      </header>

      {!isLoading && agents.length > 0 ? (
        <AgentStatsBar
          total={agents.length}
          selected={selectedAgent?.agentId ?? null}
          lowBalanceCount={
            agents.filter((agent) => {
              const balance = balances[agent.publicKey];
              return balance !== undefined && balance < 0.005;
            }).length
          }
        />
      ) : null}

      <div className="flex items-start gap-2.5 rounded-sm border border-border bg-surface px-3 py-2.5">
        <Zap
          className="mt-0.5 size-3.5 shrink-0 text-muted-foreground"
          animateOnHover
        />
        <p className="text-[11px] leading-5 text-muted-foreground">
          The agent public key is the{" "}
          <code className="font-mono text-[10px] text-foreground">
            ai_authority
          </code>{" "}
          when creating a treasury. Agent creation prepares the signer and
          runtime token; it does not bind a treasury until the wallet signs the
          on-chain create/register flow.
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">
            {isLoading && agents.length === 0
              ? "Loading..."
              : agents.length === 0
                ? "No agents"
                : `${agents.length} agent${agents.length !== 1 ? "s" : ""}`}
          </h2>
        </div>

        {isLoading && agents.length === 0 ? (
          <div className="space-y-3">
            <Skeleton className="h-36" />
            <Skeleton className="h-36" />
          </div>
        ) : null}

        {!isLoading && errorMessage ? (
          <div className="rounded-sm border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
            {errorMessage}
          </div>
        ) : null}

        {!isLoading && !errorMessage && agents.length === 0 ? (
          <AgentEmptyState onCreateClick={() => setCreateOpen(true)} />
        ) : null}

        {agents.length > 0 ? (
          <div className="space-y-2">
            {agents.map((agent) => (
              <AgentRow
                key={agent.id}
                agent={agent}
                selected={selectedAgent?.agentId === agent.agentId}
                linkedTreasuries={linkedFor(agent)}
                solBalance={balances[agent.publicKey] ?? null}
                deleting={deleteAgentMutation.isPending}
                onSelect={() => setSelectedAgentId(agent.agentId)}
                onDownload={async () => {
                  const identity = await downloadAgentIdentity(agent);
                  downloadJson(`${agent.agentId}.aura-agent.json`, identity);
                }}
                onDelete={() => setDeleteTarget(agent)}
              />
            ))}
          </div>
        ) : null}
      </section>
    </DashboardContent>
  );
}
