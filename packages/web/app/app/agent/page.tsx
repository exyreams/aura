"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { AgentSpendChart } from "@/components/app/charts";
import { PageHeader, StatusPill, Surface } from "@/components/app/ui";
import { CHAINS, type TreasuryEntry, TX_TYPES } from "@/lib/aura-app";
import { backendRequest, postBackend } from "@/lib/backend-client";
import {
  useAppSettings,
  useBackendInfo,
  useOwnedTreasuries,
  useRecentActivity,
} from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";

interface AgentJob {
  treasury: string;
  running: boolean;
  intervalMs?: number;
  lastRunAt?: number;
  lastError?: string;
  lastResult?: unknown;
  history: Array<Record<string, unknown>>;
  mode: "public" | "confidential";
  model: string;
}

const initialForm = {
  treasury: "",
  strategy:
    "Rotate into the strongest liquid asset only when daily spend is within limits and there is no pending proposal.",
  mode: "public" as "public" | "confidential",
  model: "gpt-4o-mini",
  endpoint: "https://api.openai.com/v1/chat/completions",
  intervalMs: "60000",
  maxTradeSizeUsd: "9000",
  recipient: "",
  txType: "1",
  chain: "2",
};

function deriveDefaultRecipient(treasury?: TreasuryEntry) {
  const dwallet = treasury?.account.dwallets[0];
  return dwallet?.address ?? "";
}

export default function AgentPage() {
  const settings = useAppSettings();
  const queryClient = useQueryClient();
  const backendInfoQuery = useBackendInfo();
  const treasuriesQuery = useOwnedTreasuries();
  const treasuries = treasuriesQuery.data ?? [];
  const activityQuery = useRecentActivity(treasuries);
  const activity = activityQuery.data ?? [];
  const [form, setForm] = useState(initialForm);

  const jobsQuery = useQuery({
    queryKey: ["agent-status", settings.backendUrl],
    queryFn: () =>
      backendRequest<{ jobs: AgentJob[] }>(
        settings.backendUrl,
        "/v1/agent/status",
      ),
    refetchInterval: 7000,
    retry: 1,
  });

  const selectedTreasury = useMemo(
    () =>
      treasuries.find((entry) => entry.publicKey.toBase58() === form.treasury),
    [form.treasury, treasuries],
  );
  const activeJob = jobsQuery.data?.jobs.find(
    (job) => job.treasury === form.treasury,
  );
  const selectedTreasurySpend = selectedTreasury
    ? Number(selectedTreasury.account.policyState.spentTodayUsd.toString())
    : 0;
  const selectedTreasuryLimit = selectedTreasury
    ? Number(selectedTreasury.account.policyConfig.dailyLimitUsd.toString())
    : 0;

  const chartData = useMemo(
    () =>
      treasuries.map((entry, index) => ({
        time: `T${index + 1}`,
        spend: Number(entry.account.policyState.spentTodayUsd.toString()),
        approved: Number(
          entry.account.reputation.successfulTransactions.toString(),
        ),
      })),
    [treasuries],
  );

  const startMutation = useMutation({
    mutationFn: async () =>
      postBackend(settings.backendUrl, "/v1/agent/start", {
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
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agent-status"] });
    },
  });

  const runOnceMutation = useMutation({
    mutationFn: async () =>
      postBackend(settings.backendUrl, "/v1/agent/run-once", {
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
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agent-status"] });
      await queryClient.invalidateQueries({ queryKey: ["recent-activity"] });
      await queryClient.invalidateQueries({
        queryKey: ["treasury", form.treasury],
      });
    },
  });

  const stopMutation = useMutation({
    mutationFn: async () =>
      postBackend(settings.backendUrl, "/v1/agent/stop", {
        treasury: form.treasury,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["agent-status"] });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent Panel"
        title="Run the backend treasury agent."
        copy="This page now starts, stops, and monitors the backend worker. The worker reads live on-chain treasury state, calls the configured model endpoint, and submits real public or confidential proposals."
        action={
          <StatusPill status={activeJob?.running ? "Running" : "Stopped"} />
        }
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Surface
          title="Agent Configuration"
          copy="The backend uses its own signer. The model key is sent to the backend for runtime use."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="field-label">Treasury selector</span>
              <select
                className="select"
                value={form.treasury}
                onChange={(event) => {
                  const nextTreasury = treasuries.find(
                    (entry) =>
                      entry.publicKey.toBase58() === event.target.value,
                  );
                  setForm((current) => ({
                    ...current,
                    treasury: event.target.value,
                    recipient:
                      current.recipient || deriveDefaultRecipient(nextTreasury),
                  }));
                }}
              >
                <option value="">Select treasury</option>
                {treasuries.map((treasury) => (
                  <option
                    key={treasury.publicKey.toBase58()}
                    value={treasury.publicKey.toBase58()}
                  >
                    {treasury.account.agentId}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Mode</span>
              <select
                className="select"
                value={form.mode}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    mode: event.target.value as "public" | "confidential",
                  }))
                }
              >
                <option value="public">Public</option>
                <option value="confidential">Confidential</option>
              </select>
            </label>
            {selectedTreasury ? (
              <div className="md:col-span-2 rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-3 text-sm text-slate-300">
                <p>
                  Selected treasury:{" "}
                  <span className="text-white">
                    {selectedTreasury.account.agentId}
                  </span>
                </p>
                <p>
                  Spend today:{" "}
                  <span className="text-white">
                    {formatCurrency(selectedTreasurySpend)}
                  </span>{" "}
                  /{" "}
                  <span className="text-white">
                    {formatCurrency(selectedTreasuryLimit)}
                  </span>
                </p>
                <p>
                  Pending proposal:{" "}
                  <span className="text-white">
                    {selectedTreasury.account.pending ? "Yes" : "No"}
                  </span>
                </p>
              </div>
            ) : null}
            <label>
              <span className="field-label">Model</span>
              <input
                className="input"
                value={form.model}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    model: event.target.value,
                  }))
                }
                placeholder="gpt-4o-mini"
              />
            </label>
            <label>
              <span className="field-label">Inference endpoint</span>
              <input
                className="input"
                value={form.endpoint}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    endpoint: event.target.value,
                  }))
                }
                placeholder="https://api.openai.com/v1/chat/completions"
              />
            </label>
            <label className="md:col-span-2">
              <span className="field-label">Model API key</span>
              <input
                className="input"
                value={settings.nimApiKey}
                onChange={(event) => settings.setNimApiKey(event.target.value)}
                placeholder="Stored locally, sent to backend when a job starts"
              />
            </label>
            <label className="md:col-span-2">
              <span className="field-label">Strategy</span>
              <textarea
                className="input min-h-28"
                value={form.strategy}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    strategy: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span className="field-label">Max trade size (USD cents)</span>
              <input
                className="input"
                value={form.maxTradeSizeUsd}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    maxTradeSizeUsd: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span className="field-label">Loop interval (ms)</span>
              <input
                className="input"
                value={form.intervalMs}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    intervalMs: event.target.value,
                  }))
                }
              />
            </label>
            <label>
              <span className="field-label">Target chain</span>
              <select
                className="select"
                value={form.chain}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    chain: event.target.value,
                  }))
                }
              >
                {CHAINS.map((chain) => (
                  <option key={chain.code} value={chain.code}>
                    {chain.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="field-label">Transaction type</span>
              <select
                className="select"
                value={form.txType}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    txType: event.target.value,
                  }))
                }
              >
                {TX_TYPES.map((txType) => (
                  <option key={txType.code} value={txType.code}>
                    {txType.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="md:col-span-2">
              <span className="field-label">Recipient / contract address</span>
              <input
                className="input"
                value={form.recipient}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    recipient: event.target.value,
                  }))
                }
                placeholder="Destination address or contract"
              />
            </label>
            <div className="md:col-span-2 rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-3 text-sm text-slate-300">
              Backend signer:{" "}
              <span className="mono text-white">
                {backendInfoQuery.data?.publicKey ??
                  (backendInfoQuery.isError ? "Unavailable" : "Loading")}
              </span>
            </div>
            <div className="md:col-span-2 flex flex-wrap gap-3">
              <button
                type="button"
                className="button-primary"
                onClick={() => startMutation.mutate()}
                disabled={
                  startMutation.isPending ||
                  !form.treasury ||
                  !form.recipient ||
                  !settings.nimApiKey
                }
              >
                {startMutation.isPending ? "Starting..." : "Start Agent"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => runOnceMutation.mutate()}
                disabled={
                  runOnceMutation.isPending ||
                  !form.treasury ||
                  !form.recipient ||
                  !settings.nimApiKey
                }
              >
                {runOnceMutation.isPending ? "Running..." : "Run Once"}
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => stopMutation.mutate()}
                disabled={stopMutation.isPending || !form.treasury}
              >
                {stopMutation.isPending ? "Stopping..." : "Stop Agent"}
              </button>
            </div>
          </div>
        </Surface>

        <Surface
          title="Worker Status"
          copy="Live backend job state and recent decisions."
        >
          <div className="space-y-4">
            <div className="rounded-[1.2rem] border border-white/8 bg-white/4 px-4 py-3 text-sm text-slate-300">
              {activeJob ? (
                <>
                  <p>
                    Status:{" "}
                    <span className="text-white">
                      {activeJob.running ? "Running" : "Stopped"}
                    </span>
                  </p>
                  <p>
                    Last run:{" "}
                    <span className="text-white">
                      {activeJob.lastRunAt
                        ? new Date(activeJob.lastRunAt).toLocaleString()
                        : "Never"}
                    </span>
                  </p>
                  <p>
                    Model: <span className="text-white">{activeJob.model}</span>
                  </p>
                  <p>
                    Interval:{" "}
                    <span className="text-white">
                      {activeJob.intervalMs ?? "n/a"} ms
                    </span>
                  </p>
                </>
              ) : (
                <p>No backend job is active for the selected treasury.</p>
              )}
            </div>

            {activeJob?.lastError ? (
              <div className="rounded-[1.2rem] border border-rose-400/16 bg-rose-400/10 p-4 text-sm text-slate-200">
                {activeJob.lastError}
              </div>
            ) : null}

            <div className="space-y-3">
              {(activeJob?.history ?? []).length === 0 ? (
                <p className="text-sm text-slate-400">
                  No backend decisions recorded yet.
                </p>
              ) : (
                activeJob?.history.map((item) => (
                  <div
                    key={`${activeJob.treasury}-${String(item.timestamp ?? JSON.stringify(item))}`}
                    className="rounded-[1.2rem] border border-white/8 bg-white/4 p-4 text-sm text-slate-300"
                  >
                    <pre className="overflow-x-auto whitespace-pre-wrap text-xs text-slate-200">
                      {JSON.stringify(item, null, 2)}
                    </pre>
                  </div>
                ))
              )}
            </div>
          </div>
        </Surface>
      </div>

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Surface
          title="Spend Over Time"
          copy="Live spent-today counters across owned treasuries."
        >
          {chartData.length === 0 ? (
            <p className="text-sm text-slate-400">
              Connect a wallet with treasuries to render spend data.
            </p>
          ) : (
            <>
              <AgentSpendChart data={chartData} />
              <p className="mt-4 text-sm text-slate-400">
                Aggregate spend{" "}
                {formatCurrency(
                  chartData.reduce((sum, item) => sum + item.spend, 0),
                )}
              </p>
            </>
          )}
        </Surface>

        <Surface
          title="Recent Chain Activity"
          copy="This remains sourced from live treasury events."
        >
          <div className="space-y-3">
            {activity.length === 0 ? (
              <p className="text-sm text-slate-400">
                No recent treasury events found.
              </p>
            ) : (
              activity.map((item) => (
                <div
                  key={`${item.signature}-${item.kind}`}
                  className="rounded-[1.2rem] border border-white/8 bg-white/4 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">
                        {item.detail ?? `Proposal #${item.proposalId}`}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {item.treasury}
                      </p>
                    </div>
                    <StatusPill
                      status={
                        item.kind === "proposal"
                          ? item.status === 4
                            ? "Denied"
                            : item.status === 3
                              ? "Approved"
                              : "Pending"
                          : "Active"
                      }
                    />
                  </div>
                  <p className="mt-3 text-xs uppercase tracking-[0.18em] text-slate-500">
                    {item.timestamp
                      ? new Date(item.timestamp * 1000).toLocaleString()
                      : "Unknown time"}
                  </p>
                </div>
              ))
            )}
          </div>
        </Surface>
      </div>
    </div>
  );
}
