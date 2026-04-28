"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
  AgentConfig,
  AgentHeader,
  RecentEvents,
  SpendingOverview,
  WorkerStatus,
} from "@/components/agent";
import { backendRequest } from "@/lib/backend-client";
import {
  useAppSettings,
  useOwnedTreasuries,
  useRecentActivity,
} from "@/lib/hooks";

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

export default function AgentControlPage() {
  const settings = useAppSettings();
  const queryClient = useQueryClient();
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

  const activeJob = jobsQuery.data?.jobs.find(
    (job) => job.treasury === form.treasury,
  );

  const chartData = useMemo(
    () =>
      treasuries.map((entry) => ({
        name: entry.account.agentId.slice(0, 8),
        spent: Number(entry.account.policyState.spentTodayUsd.toString()) / 100,
        limit:
          Number(entry.account.policyConfig.dailyLimitUsd.toString()) / 100,
      })),
    [treasuries],
  );

  return (
    <div className="space-y-12">
      <AgentHeader status={activeJob?.running ? "Running" : "Stopped"} />

      <div className="grid grid-cols-1 lg:grid-cols-10 gap-8">
        <div className="lg:col-span-6 space-y-8">
          <AgentConfig
            treasuries={treasuries}
            form={form}
            setForm={setForm}
            queryClient={queryClient}
          />
          <SpendingOverview data={chartData} />
        </div>

        <div className="lg:col-span-4 space-y-8">
          <WorkerStatus activeJob={activeJob} />
          <RecentEvents activity={activity} />
        </div>
      </div>
    </div>
  );
}
