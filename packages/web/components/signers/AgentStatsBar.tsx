"use client";

import { cn } from "@/lib/utils";

interface AgentStatsBarProps {
  total: number;
  selected: string | null;
}

export function AgentStatsBar({ total, selected }: AgentStatsBarProps) {
  return (
    <div className="grid grid-cols-3 gap-4">
      <div>
        <p className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted)">
          Total
        </p>
        <p className="mt-0.5 text-xl font-semibold text-(--text-main)">
          {total}
        </p>
      </div>

      <div className="min-w-0">
        <p className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted)">
          Active Signer
        </p>
        <p className="mt-0.5 text-xs font-mono text-(--text-main) truncate">
          {selected ?? <span className="text-(--text-muted)">none</span>}
        </p>
      </div>

      <div className="flex flex-col justify-center">
        <p className="font-mono text-[9px] uppercase tracking-widest text-(--text-muted)">
          Status
        </p>
        <div className="mt-0.5 flex items-center gap-1.5">
          <div
            className={cn(
              "size-1.5 rounded-full shrink-0",
              selected ? "bg-success" : "bg-(--text-muted)",
            )}
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
            {selected ? "Ready" : "Idle"}
          </span>
        </div>
      </div>
    </div>
  );
}
