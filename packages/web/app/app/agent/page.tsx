"use client";

import { useMemo, useState } from "react";
import { AgentSpendChart } from "@/components/app/charts";
import { PageHeader, StatusPill, Surface } from "@/components/app/ui";
import {
  useAppSettings,
  useOwnedTreasuries,
  useRecentActivity,
} from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";

export default function AgentPage() {
  const settings = useAppSettings();
  const treasuriesQuery = useOwnedTreasuries();
  const treasuries = treasuriesQuery.data ?? [];
  const activityQuery = useRecentActivity(treasuries);
  const activity = activityQuery.data ?? [];
  const [running, setRunning] = useState(false);
  const [selectedTreasury, setSelectedTreasury] = useState("");

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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Agent Panel"
        title="Configure the live AI trading loop."
        copy="This page now stores runtime preferences locally and shows live on-chain treasury activity, but model execution itself still needs an API route / backend worker."
        action={<StatusPill status={running ? "Running" : "Stopped"} />}
      />

      <div className="grid gap-6 xl:grid-cols-[1fr_0.9fr]">
        <Surface
          title="Agent Configuration"
          copy="Configuration is persisted locally in browser settings."
        >
          <div className="grid gap-4 md:grid-cols-2">
            <label>
              <span className="field-label">Model selector</span>
              <select className="select" defaultValue="Mistral Small 4B (NIM)">
                <option>Mistral Small 4B (NIM)</option>
                <option>GPT-4o</option>
                <option>Custom endpoint</option>
              </select>
            </label>
            <label>
              <span className="field-label">Treasury selector</span>
              <select
                className="select"
                value={selectedTreasury}
                onChange={(event) => setSelectedTreasury(event.target.value)}
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
            <label className="md:col-span-2">
              <span className="field-label">NIM API key</span>
              <input
                className="input"
                value={settings.nimApiKey}
                onChange={(event) => settings.setNimApiKey(event.target.value)}
                placeholder="Stored in browser only"
              />
            </label>
            <label>
              <span className="field-label">Trading pairs</span>
              <input
                className="input"
                defaultValue="SOL/USDC, ETH/USDC, BTC/USD"
              />
            </label>
            <label>
              <span className="field-label">Max trade size</span>
              <input className="input" defaultValue="9000" />
            </label>
            <label className="md:col-span-2">
              <span className="field-label">Risk tolerance</span>
              <input className="input" defaultValue="Moderate" />
            </label>
            <div className="md:col-span-2 flex flex-wrap gap-3">
              <button
                type="button"
                className="button-primary"
                onClick={() => setRunning(true)}
              >
                Start Agent
              </button>
              <button
                type="button"
                className="button-secondary"
                onClick={() => setRunning(false)}
              >
                Stop Agent
              </button>
            </div>
          </div>
        </Surface>

        <Surface
          title="Live Activity Feed"
          copy="Parsed from recent on-chain AURA events."
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
    </div>
  );
}
