"use client";

import { Card } from "@/components/global";
import { Badge } from "@/components/global/Badge";

interface ParsedActivity {
  signature: string;
  treasury: string;
  proposalId?: string;
  kind: "proposal" | "audit";
  status?: number;
  approved?: boolean;
  violation?: number;
  detail?: string;
  timestamp?: number;
}

interface RecentEventsProps {
  activity: ParsedActivity[];
}

export function RecentEvents({ activity }: RecentEventsProps) {
  return (
    <Card hover={false}>
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-(--text-main) mb-1">
          Recent Chain Activity
        </h2>
        <p className="text-[12px] text-(--text-muted)">
          Sourced from live treasury events.
        </p>
      </div>

      <div className="space-y-0 relative">
        {/* Vertical timeline line */}
        {activity.length > 0 && (
          <div className="absolute left-0 top-2 bottom-6 w-px bg-border" />
        )}

        {activity.length === 0 ? (
          <p className="text-sm text-(--text-muted)">
            No recent treasury events found.
          </p>
        ) : (
          activity.map((event) => {
            const status =
              event.kind === "proposal"
                ? event.status === 4
                  ? "error"
                  : event.status === 3
                    ? "active"
                    : "paused"
                : "active";

            const statusLabel =
              event.kind === "proposal"
                ? event.status === 4
                  ? "Denied"
                  : event.status === 3
                    ? "Approved"
                    : "Pending"
                : "Success";

            return (
              <div
                key={event.signature}
                className="relative pl-6 pb-6 last:pb-0"
              >
                {/* Timeline dot */}
                <div className="absolute left-[-4px] top-1.5 size-[8px] bg-primary rounded-full z-10" />

                <div className="flex justify-between items-start mb-1">
                  <span className="mono text-[11px] font-bold text-(--text-main) uppercase tracking-wider">
                    {event.kind}
                  </span>
                  <Badge
                    variant={status}
                    className="text-[9px] px-2 py-0.5 min-w-[70px]"
                  >
                    {statusLabel}
                  </Badge>
                </div>

                <p className="text-[12px] text-(--text-muted) mb-2 leading-relaxed">
                  {event.detail ?? `Proposal #${event.proposalId}`}
                </p>

                <div
                  className="mono text-[10px] text-(--text-muted) uppercase tracking-widest"
                  suppressHydrationWarning
                >
                  {event.timestamp
                    ? new Date(event.timestamp * 1000).toLocaleString()
                    : "Unknown time"}
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
