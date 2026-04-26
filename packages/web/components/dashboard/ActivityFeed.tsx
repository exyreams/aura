import { StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Card } from "@/components/global/Card";
import { Skeleton } from "@/components/global/Skeleton";
import type { ParsedActivity } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

interface ActivityFeedProps {
  activity?: ParsedActivity[];
  loading?: boolean;
}

export function ActivityFeed({
  activity = [],
  loading = false,
}: ActivityFeedProps) {
  return (
    <Card className="h-full" hover={false}>
      <h2 className="text-xl font-bold text-(--text-main) mb-1">
        Recent Activity
      </h2>
      <p className="text-[12px] text-(--text-muted) mb-8">
        Parsed from recent program events emitted by treasury transactions.
      </p>

      {loading ? (
        <div className="space-y-6">
          {Array.from(
            { length: 4 },
            (_, i) => `loading-${i}-${Date.now()}`,
          ).map((key) => (
            <div key={key} className="space-y-2">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      ) : activity.length === 0 ? (
        <p className="text-sm text-(--text-muted)">
          No recent events found for the current wallet.
        </p>
      ) : (
        <>
          <div className="space-y-0">
            {activity.slice(0, 4).map((item) => {
              const isProposal = item.kind === "proposal";
              const status = isProposal
                ? item.status === 3
                  ? "active"
                  : item.status === 4
                    ? "paused"
                    : "default"
                : "default";

              return (
                <div
                  key={`${item.signature}-${item.kind}-${item.detail ?? item.proposalId}`}
                  className="relative pl-6 pb-6 last:pb-0"
                >
                  {/* Timeline dot */}
                  <div className="absolute left-[-4px] top-1 w-[7px] h-[7px] bg-primary rounded-full" />

                  <div className="flex justify-between items-start mb-1">
                    <span className="mono text-[11px] font-bold text-(--text-main)">
                      {isProposal
                        ? `PROPOSAL #${item.proposalId ?? "?"}`
                        : item.detail?.toUpperCase() || "AUDIT EVENT"}
                    </span>
                    <StatusPill
                      variant={status}
                      className="text-[10px] px-2 py-0.5"
                    >
                      {status === "active"
                        ? "Approved"
                        : status === "paused"
                          ? "Denied"
                          : "Pending"}
                    </StatusPill>
                  </div>
                  <p className="text-[12px] text-(--text-muted) mb-2">
                    {isProposal && item.violation
                      ? `Violation: ${item.violation}`
                      : item.detail || "Treasury event"}
                  </p>
                  <div className="flex justify-between items-center mono text-[10px] text-(--text-muted)">
                    <span>{shortenAddress(item.treasury, 6, 6)}</span>
                    <span>
                      {item.timestamp
                        ? new Date(item.timestamp * 1000).toLocaleTimeString()
                        : "Unknown"}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <Button
            variant="secondary"
            size="small"
            className="w-full mt-4 text-[10px]"
          >
            View Full Event Log
          </Button>
        </>
      )}
    </Card>
  );
}
