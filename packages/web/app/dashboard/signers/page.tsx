"use client";

import { useConnection } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey } from "@solana/web3.js";
import { useEffect, useRef, useState } from "react";
import { Alert, Button, Skeleton } from "@/components/global";
import { ConfirmDialog } from "@/components/global/ConfirmDialog";
import { Plus, RefreshCw, Zap } from "@/components/icons";
import {
  AgentEmptyState,
  AgentRow,
  AgentStatsBar,
  CreateAgentModal,
} from "@/components/signers";
import type { TreasuryEntry } from "@/lib/aura-app";
import type { AgentKeypair } from "@/lib/hooks";
import { useAgents, useOwnedTreasuries } from "@/lib/hooks";
import { cn } from "@/lib/utils";

// helpers

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
  return treasuries.filter((t) => {
    const authority = t.account.aiAuthority?.toString?.() ?? "";
    return t.account.agentId === agent.agentId || authority === agent.publicKey;
  });
}

// Per-agent balance fetcher

function useAgentBalances(agents: AgentKeypair[]) {
  const { connection } = useConnection();
  const [balances, setBalances] = useState<Record<string, number>>({});
  const fetchedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    for (const agent of agents) {
      if (fetchedRef.current.has(agent.publicKey)) continue;
      fetchedRef.current.add(agent.publicKey);
      connection
        .getBalance(new PublicKey(agent.publicKey))
        .then((lamports) => {
          setBalances((prev) => ({
            ...prev,
            [agent.publicKey]: lamports / LAMPORTS_PER_SOL,
          }));
        })
        .catch(() => {});
    }
  }, [agents, connection]);

  return balances;
}

// Page

export default function AgentsPage() {
  const [createOpen, setCreateOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AgentKeypair | null>(null);

  const treasuriesQuery = useOwnedTreasuries();
  const treasuries = treasuriesQuery.data ?? [];

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

  return (
    <>
      <CreateAgentModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <ConfirmDialog
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => void handleDeleteConfirm()}
        title="Delete agent"
        confirmLabel="Sign & Delete"
        cancelLabel="Cancel"
        loading={deleteAgentMutation.isPending}
        requireWalletSign={
          deleteTarget ? `Delete agent: ${deleteTarget.agentId}` : undefined
        }
        disclaimer="This permanently removes the encrypted keypair from the backend vault. Any treasuries using this agent as ai_authority will lose their signer."
        rows={
          deleteTarget
            ? [
                { label: "Agent ID", value: deleteTarget.agentId },
                {
                  label: "Public key",
                  value: deleteTarget.publicKey.slice(0, 20) + "…",
                },
                {
                  label: "Label",
                  value: deleteTarget.label || "—",
                },
              ]
            : []
        }
      />

      <div className="relative max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-6 sm:mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
              Agent Vault
            </span>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-(--text-main) mb-1.5">
              Signer Agents
            </h1>
            <p className="text-(--text-muted) font-light text-sm leading-relaxed">
              Backend keypairs encrypted at rest. Select one per session to
              authorize dWallet, confidential, and policy flows.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="medium"
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
              variant="primary"
              size="medium"
              icon={<Plus className="size-4" animateOnHover />}
              onClick={() => setCreateOpen(true)}
            >
              New Agent
            </Button>
          </div>
        </header>

        {/* Stats */}
        {!isLoading && agents.length > 0 && (
          <div className="mb-5 sm:mb-6">
            <AgentStatsBar
              total={agents.length}
              selected={selectedAgent?.agentId ?? null}
              lowBalanceCount={
                agents.filter((a) => {
                  const bal = balances[a.publicKey];
                  return bal !== undefined && bal < 0.005;
                }).length
              }
            />
          </div>
        )}

        {/* Callout */}
        <div className="flex items-start gap-2.5 rounded border border-border bg-(--card-bg) px-3 py-2.5 mb-5 sm:mb-6">
          <Zap
            className="mt-0.5 size-3.5 shrink-0 text-(--text-muted)"
            animateOnHover
          />
          <p className="text-[11px] leading-5 text-(--text-muted)">
            The agent's public key is the{" "}
            <code className="mono text-[10px] text-(--text-main)">
              ai_authority
            </code>{" "}
            when creating a treasury. Pure signer, no funds held here. Only
            needs ~0.01 SOL for confidential (FHE) transaction fees.
          </p>
        </div>

        {/* Agent List */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-semibold uppercase tracking-widest text-(--text-muted)">
              {isLoading && agents.length === 0
                ? "Loading…"
                : agents.length === 0
                  ? "No agents"
                  : `${agents.length} agent${agents.length !== 1 ? "s" : ""}`}
            </h2>
            {treasuriesQuery.isFetching && (
              <span className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted)">
                Syncing treasury links…
              </span>
            )}
          </div>

          {isLoading && agents.length === 0 && (
            <div className="space-y-3">
              <Skeleton className="h-36" />
              <Skeleton className="h-36" />
            </div>
          )}

          {!isLoading && error && <Alert variant="error" message={error} />}

          {!isLoading && !error && agents.length === 0 && (
            <AgentEmptyState onCreateClick={() => setCreateOpen(true)} />
          )}

          {agents.length > 0 && (
            <div className="space-y-2">
              {agents.map((agent) => (
                <AgentRow
                  key={agent.id}
                  agent={agent}
                  selected={selectedAgent?.agentId === agent.agentId}
                  linkedTreasuries={linkedFor(agent, treasuries)}
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
          )}
        </section>
      </div>
    </>
  );
}
