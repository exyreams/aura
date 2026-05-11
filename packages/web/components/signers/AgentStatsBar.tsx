"use client";

import { Card } from "@/components/global/Card";
import { KeyRound, Shield, Zap } from "@/components/icons";
import { cn } from "@/lib/utils";

interface AgentStatsBarProps {
  total: number;
  selected: string | null;
  lowBalanceCount?: number;
}

export function AgentStatsBar({
  total,
  selected,
  lowBalanceCount = 0,
}: AgentStatsBarProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <Card className="p-5" hover={false}>
        <div className="flex items-center justify-between mb-2">
          <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted)">
            Total Agents
          </p>
          <KeyRound className="size-4 text-(--text-muted)" animateOnHover />
        </div>
        <p className="text-3xl font-bold text-(--text-main)">{total}</p>
      </Card>

      <Card className="p-5" hover={false}>
        <div className="flex items-center justify-between mb-2">
          <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted)">
            Active Signer
          </p>
          <Shield className="size-4 text-(--text-muted)" animateOnHover />
        </div>
        {selected ? (
          <p className="text-sm font-mono font-semibold text-(--text-main) truncate">
            {selected}
          </p>
        ) : (
          <p className="text-sm text-(--text-muted)">None selected</p>
        )}
        <div className="flex items-center gap-1.5 mt-1.5">
          <div
            className={cn(
              "size-1.5 rounded-full shrink-0",
              selected ? "bg-success animate-pulse" : "bg-(--text-muted)",
            )}
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
            {selected ? "Ready" : "Idle"}
          </span>
        </div>
      </Card>

      <Card className="p-5" hover={false}>
        <div className="flex items-center justify-between mb-2">
          <p className="mono text-[10px] uppercase tracking-widest text-(--text-muted)">
            Low Balance
          </p>
          <Zap className="size-4 text-(--text-muted)" animateOnHover />
        </div>
        <p
          className={cn(
            "text-3xl font-bold",
            lowBalanceCount > 0 ? "text-warning" : "text-(--text-main)",
          )}
        >
          {lowBalanceCount}
        </p>
        <p className="text-[10px] text-(--text-muted) mt-1">
          {lowBalanceCount > 0 ? "need funding for FHE fees" : "all funded"}
        </p>
      </Card>
    </div>
  );
}
