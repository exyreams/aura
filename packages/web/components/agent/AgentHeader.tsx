"use client";

import { cn } from "@/lib/utils";

interface AgentHeaderProps {
  status: "Running" | "Stopped" | "Pending";
}

export function AgentHeader({ status }: AgentHeaderProps) {
  return (
    <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between mb-12">
      <div className="space-y-3">
        <p className="eyebrow">AGENT PANEL</p>
        <h1 className="text-4xl font-semibold tracking-tight text-(--text-main)">
          Run the backend treasury agent.
        </h1>
        <p className="max-w-3xl text-sm leading-7 text-(--text-muted)">
          This page starts, stops, and monitors the backend worker. The worker
          reads live on-chain treasury state, calls the configured model
          endpoint, and submits real public or confidential proposals.
        </p>
      </div>

      <div className="flex items-center gap-3 bg-(--card-bg) border border-border p-2 rounded-lg">
        <span className="text-[10px] mono text-(--text-muted) uppercase tracking-widest px-2">
          Status
        </span>
        <span
          className={cn(
            "inline-flex items-center justify-center px-3 py-1 rounded-full text-[10px] font-semibold mono uppercase border",
            status === "Running"
              ? "bg-(--success-bg) border-(--success-border) text-(--success-text)"
              : status === "Pending"
                ? "bg-(--warning-bg) border-(--warning-border) text-(--warning-text)"
                : "bg-(--danger-bg) border-(--danger-border) text-(--danger-text)",
          )}
        >
          {status}
        </span>
      </div>
    </div>
  );
}
