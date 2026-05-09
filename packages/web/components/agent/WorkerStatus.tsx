"use client";

import { Alert, Card } from "@/components/global";

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

interface WorkerStatusProps {
  activeJob?: AgentJob;
}

export function WorkerStatus({ activeJob }: WorkerStatusProps) {
  return (
    <Card hover={false} className="space-y-8">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Worker Status
        </h2>
        <p className="text-sm text-(--text-muted)">
          Live backend job state and recent decisions.
        </p>
      </div>

      <div className="space-y-4">
        <div className="p-4 bg-(--card-bg) border border-border rounded grid grid-cols-2 gap-4">
          {activeJob ? (
            <>
              <div>
                <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
                  Status
                </span>
                <div className="flex items-center gap-2">
                  <div
                    className={`w-2 h-2 rounded-full ${activeJob.running ? "bg-success animate-pulse" : "bg-danger"}`}
                  />
                  <span
                    className={`text-sm font-bold ${activeJob.running ? "text-success" : "text-danger"}`}
                  >
                    {activeJob.running ? "Running" : "Stopped"}
                  </span>
                </div>
              </div>
              <div>
                <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
                  Last Run
                </span>
                <div
                  className="text-sm font-bold text-(--text-main)"
                  suppressHydrationWarning
                >
                  {activeJob.lastRunAt
                    ? new Date(activeJob.lastRunAt).toLocaleString()
                    : "Never"}
                </div>
              </div>
              <div>
                <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
                  Model
                </span>
                <div className="text-sm font-bold text-(--text-main)">
                  {activeJob.model}
                </div>
              </div>
              <div>
                <span className="mono text-[9px] uppercase text-(--text-muted) block mb-1">
                  Interval
                </span>
                <div className="text-sm font-bold text-(--text-main)">
                  {activeJob.intervalMs ?? "n/a"} ms
                </div>
              </div>
            </>
          ) : (
            <div className="col-span-2">
              <p className="text-sm text-(--text-muted)">
                No backend job is active for the selected treasury.
              </p>
            </div>
          )}
        </div>

        {activeJob?.lastError ? (
          <Alert variant="error" message={activeJob.lastError} />
        ) : null}

        <div className="space-y-3">
          <span className="mono text-[10px] uppercase text-(--text-muted) font-bold block">
            Decision History
          </span>
          <div className="bg-(--input-bg) border border-border rounded p-4 font-mono text-[11px] text-(--text-muted) h-64 overflow-y-auto space-y-6 custom-scrollbar">
            {(activeJob?.history ?? []).length === 0 ? (
              <p className="text-sm text-(--text-muted)">
                No backend decisions recorded yet.
              </p>
            ) : (
              activeJob?.history.map((item) => (
                <pre
                  key={`${activeJob.treasury}-${String(item.timestamp ?? JSON.stringify(item))}`}
                  className="whitespace-pre-wrap"
                >
                  {JSON.stringify(item, null, 2)}
                </pre>
              ))
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}
