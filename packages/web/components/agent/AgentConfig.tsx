"use client";

import type { QueryClient } from "@tanstack/react-query";
import { useMutation } from "@tanstack/react-query";
import { Play, Square, Zap } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useMemo } from "react";
import { Button, Card, Dropdown, Input, Textarea } from "@/components/global";
import { UsdInput } from "@/components/global/UsdInput";
import type { TreasuryEntry } from "@/lib/aura-app";
import { CHAINS, getActivePendingProposal, TX_TYPES } from "@/lib/aura-app";
import { postBackend } from "@/lib/backend-client";
import { useAgents, useAppSettings, useBackendInfo } from "@/lib/hooks";

interface FormState {
  treasury: string;
  strategy: string;
  mode: "public" | "confidential";
  model: string;
  endpoint: string;
  intervalMs: string;
  maxTradeSizeUsd: string;
  recipient: string;
  txType: string;
  chain: string;
}

interface AgentConfigProps {
  treasuries: TreasuryEntry[];
  form: FormState;
  setForm: Dispatch<SetStateAction<FormState>>;
  queryClient: QueryClient;
}

function deriveDefaultRecipient(treasury?: TreasuryEntry) {
  const dwallet = treasury?.account.dwallets[0];
  return dwallet?.address ?? "";
}

export function AgentConfig({
  treasuries,
  form,
  setForm,
  queryClient,
}: AgentConfigProps) {
  const settings = useAppSettings();
  const { selectedAgent } = useAgents();
  const backendInfoQuery = useBackendInfo();

  const treasury = useMemo(
    () => treasuries.find((t) => t.publicKey.toBase58() === form.treasury),
    [treasuries, form.treasury],
  );

  const selectedTreasurySpend = treasury
    ? Number(treasury.account.policyState.spentTodayUsd.toString()) / 100
    : 0;
  const selectedTreasuryLimit = treasury
    ? Number(treasury.account.policyConfig.dailyLimitUsd.toString()) / 100
    : 0;
  const activePending = getActivePendingProposal(treasury?.account);

  const startMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId) {
        throw new Error(
          "Create and select an agent before starting automation.",
        );
      }
      return postBackend(settings.backendUrl, "/v1/agent/start", {
        agentId: selectedAgent.agentId,
        treasury: form.treasury,
        strategy: form.strategy,
        mode: form.mode,
        model: form.model,
        apiKey: settings.nimApiKey,
        endpoint: form.endpoint,
        intervalMs: Number(form.intervalMs),
        maxTradeSizeUsd: Number(form.maxTradeSizeUsd),
        recipient: form.recipient,
        txType: Number(form.txType),
        chain: Number(form.chain),
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agent-status"] });
    },
  });

  const runOnceMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId) {
        throw new Error(
          "Create and select an agent before running automation.",
        );
      }
      return postBackend(settings.backendUrl, "/v1/agent/run-once", {
        agentId: selectedAgent.agentId,
        treasury: form.treasury,
        strategy: form.strategy,
        mode: form.mode,
        model: form.model,
        apiKey: settings.nimApiKey,
        endpoint: form.endpoint,
        intervalMs: Number(form.intervalMs),
        maxTradeSizeUsd: Number(form.maxTradeSizeUsd),
        recipient: form.recipient,
        txType: Number(form.txType),
        chain: Number(form.chain),
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-status"] }),
        queryClient.invalidateQueries({ queryKey: ["recent-activity"] }),
        queryClient.invalidateQueries({ queryKey: ["treasury", form.treasury] }),
      ]);
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId) {
        throw new Error(
          "Create and select an agent before stopping automation.",
        );
      }
      return postBackend(settings.backendUrl, "/v1/agent/stop", {
        agentId: selectedAgent.agentId,
        treasury: form.treasury,
      });
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agent-status"] });
    },
  });

  return (
    <Card className="space-y-8" hover={false}>
      <div className="mb-8">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Agent Configuration
        </h2>
        <p className="text-sm text-(--text-muted)">
          The backend uses its own signer. The model key is sent to the backend
          for runtime use.
        </p>
      </div>

      <form className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <label
            htmlFor="treasury-selector"
            className="mono text-[10px] uppercase text-(--text-muted) font-bold"
          >
            Treasury Selector
          </label>
          <Dropdown
            options={[
              { value: "", label: "Select treasury" },
              ...treasuries.map((t) => ({
                value: t.publicKey.toBase58(),
                label: t.account.agentId,
              })),
            ]}
            value={form.treasury}
            onChange={(value) => {
              const nextTreasury = treasuries.find(
                (t) => t.publicKey.toBase58() === value,
              );
              setForm((current) => ({
                ...current,
                treasury: value,
                recipient:
                  current.recipient || deriveDefaultRecipient(nextTreasury),
              }));
            }}
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="mode-selector"
            className="mono text-[10px] uppercase text-(--text-muted) font-bold"
          >
            Mode
          </label>
          <Dropdown
            options={[
              { value: "public", label: "Public" },
              { value: "confidential", label: "Confidential" },
            ]}
            value={form.mode}
            onChange={(value) =>
              setForm((current) => ({
                ...current,
                mode: value as "public" | "confidential",
              }))
            }
          />
        </div>
        <Input
          label="Model"
          value={form.model}
          onChange={(e) =>
            setForm((current) => ({ ...current, model: e.target.value }))
          }
        />
        <Input
          label="Inference Endpoint"
          value={form.endpoint}
          onChange={(e) =>
            setForm((current) => ({ ...current, endpoint: e.target.value }))
          }
        />
        <Input
          label="Model API Key"
          type="password"
          placeholder="sk-..."
          value={settings.nimApiKey}
          onChange={(e) => settings.setNimApiKey(e.target.value)}
        />
        <div className="space-y-2">
          <label
            htmlFor="chain-selector"
            className="mono text-[10px] uppercase text-(--text-muted) font-bold"
          >
            Target Chain
          </label>
          <Dropdown
            options={CHAINS.map((chain) => ({
              value: String(chain.code),
              label: chain.label,
            }))}
            value={form.chain}
            onChange={(value) =>
              setForm((current) => ({ ...current, chain: value }))
            }
          />
        </div>
        <div className="space-y-2">
          <label
            htmlFor="txtype-selector"
            className="mono text-[10px] uppercase text-(--text-muted) font-bold"
          >
            Transaction Type
          </label>
          <Dropdown
            options={TX_TYPES.map((txType) => ({
              value: String(txType.code),
              label: txType.label,
            }))}
            value={form.txType}
            onChange={(value) =>
              setForm((current) => ({ ...current, txType: value }))
            }
          />
        </div>
        <UsdInput
          label="Max Trade Size"
          valueCents={form.maxTradeSizeUsd}
          onChangeCents={(v) =>
            setForm((current) => ({ ...current, maxTradeSizeUsd: v }))
          }
        />
        <Input
          label="Loop Interval (ms)"
          type="number"
          value={form.intervalMs}
          onChange={(e) =>
            setForm((current) => ({ ...current, intervalMs: e.target.value }))
          }
        />
        <Input
          label="Recipient / Contract Address"
          placeholder="0x..."
          value={form.recipient}
          onChange={(e) =>
            setForm((current) => ({ ...current, recipient: e.target.value }))
          }
        />
        <Textarea
          label="Strategy Prompt"
          containerClassName="md:col-span-2"
          className="h-48"
          value={form.strategy}
          onChange={(e) =>
            setForm((current) => ({ ...current, strategy: e.target.value }))
          }
        />
      </form>

      {treasury ? (
        <div className="mt-8 p-6 bg-(--card-bg) border border-border rounded-lg grid grid-cols-1 sm:grid-cols-3 gap-6">
          <div>
            <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
              Active Treasury
            </span>
            <div className="text-sm font-bold text-(--text-main)">
              {treasury.account.agentId}
            </div>
          </div>
          <div>
            <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
              Today's Spend / Limit
            </span>
            <div className="text-sm font-bold text-(--text-main)">
              ${selectedTreasurySpend.toFixed(2)} / $
              {selectedTreasuryLimit.toFixed(2)}
            </div>
          </div>
          <div>
            <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
              Pending Proposal
            </span>
            <div
              className={`text-sm font-bold ${activePending ? "text-warning" : "text-success"}`}
            >
              {activePending ? "Yes" : "None"}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mt-8 flex items-center justify-between border-t border-border pt-6">
        <div>
          <span className="mono text-[10px] uppercase text-(--text-muted) block mb-1">
            Backend Signer
          </span>
          <code className="text-xs text-(--text-muted)">
            {selectedAgent?.publicKey
              ? `${selectedAgent.publicKey.slice(0, 8)}...`
              : backendInfoQuery.isLoading
                ? "Loading..."
                : "No agent selected"}
          </code>
        </div>
        <div className="flex gap-3">
          <Button
            variant="primary"
            size="small"
            icon={<Play className="w-3 h-3" />}
            disabled={
              startMutation.isPending ||
              !form.treasury ||
              !form.recipient ||
              !settings.nimApiKey ||
              !selectedAgent
            }
            onClick={() => startMutation.mutate()}
            className="font-mono! text-[10px]! uppercase! tracking-widest!"
          >
            {startMutation.isPending ? "Starting..." : "Start Agent"}
          </Button>
          <Button
            variant="secondary"
            size="small"
            icon={<Zap className="w-3 h-3" />}
            disabled={
              runOnceMutation.isPending ||
              !form.treasury ||
              !form.recipient ||
              !settings.nimApiKey ||
              !selectedAgent
            }
            onClick={() => runOnceMutation.mutate()}
            className="font-mono! text-[10px]! uppercase! tracking-widest!"
          >
            {runOnceMutation.isPending ? "Running..." : "Run Once"}
          </Button>
          <Button
            variant="danger"
            size="small"
            icon={<Square className="w-3 h-3" />}
            disabled={
              stopMutation.isPending || !form.treasury || !selectedAgent
            }
            onClick={() => stopMutation.mutate()}
            className="font-mono! text-[10px]! uppercase! tracking-widest!"
          >
            {stopMutation.isPending ? "Stopping..." : "Stop Agent"}
          </Button>
        </div>
      </div>
    </Card>
  );
}
