import { KeyRound, Shield, Zap } from "@/components/icons";
import { cn } from "@/lib/utils";

export function AgentStatsBar({
  total,
  selected,
  lowBalanceCount = 0,
}: {
  total: number;
  selected: string | null;
  lowBalanceCount?: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      <div className="rounded-sm border border-border bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Total Agents
          </p>
          <KeyRound className="size-4 text-muted-foreground" animateOnHover />
        </div>
        <p className="text-3xl font-bold">{total}</p>
      </div>

      <div className="rounded-sm border border-border bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Active Signer
          </p>
          <Shield className="size-4 text-muted-foreground" animateOnHover />
        </div>
        {selected ? (
          <p className="truncate font-mono text-sm font-semibold">{selected}</p>
        ) : (
          <p className="text-sm text-muted-foreground">None selected</p>
        )}
        <div className="mt-1.5 flex items-center gap-1.5">
          <div
            className={cn(
              "size-1.5 shrink-0 rounded-full",
              selected ? "bg-success" : "bg-muted-foreground",
            )}
          />
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            {selected ? "Ready" : "Idle"}
          </span>
        </div>
      </div>

      <div className="rounded-sm border border-border bg-surface p-5">
        <div className="mb-2 flex items-center justify-between">
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            Low Balance
          </p>
          <Zap className="size-4 text-muted-foreground" animateOnHover />
        </div>
        <p
          className={cn(
            "text-3xl font-bold",
            lowBalanceCount > 0 ? "text-warning" : "text-foreground",
          )}
        >
          {lowBalanceCount}
        </p>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {lowBalanceCount > 0 ? "need funding for FHE fees" : "all funded"}
        </p>
      </div>
    </div>
  );
}
