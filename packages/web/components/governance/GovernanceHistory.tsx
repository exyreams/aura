"use client";

import { Badge, Card, StatusPill } from "@/components/global";
import type { ParsedActivity } from "@/lib/aura-app";
import { shortenAddress } from "@/lib/utils";

interface GovernanceHistoryProps {
  activity: ParsedActivity[];
}

export function GovernanceHistory({ activity }: GovernanceHistoryProps) {
  // Filter for audit events that might be governance-related
  const governanceEvents = activity.filter((event) => event.kind === "audit");

  return (
    <Card className="p-8 md:p-10" hover={false}>
      <div className="mb-8">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Governance Events
        </h2>
        <p className="text-sm text-(--text-muted)">
          Recent governance actions and decisions for this treasury agent.
        </p>
      </div>

      <div className="space-y-4">
        {governanceEvents.length === 0 ? (
          <div className="p-8 text-center text-sm text-(--text-muted) italic">
            No governance events yet
          </div>
        ) : (
          governanceEvents.map((event) => {
            // Parse the detail field to determine event type
            const getEventDetails = () => {
              const detail = event.detail?.toLowerCase() ?? "";

              if (detail.includes("multisig") || detail.includes("guardian")) {
                return {
                  type: "Multisig Configured",
                  description: event.detail ?? "Guardian configuration updated",
                  variant: "active" as const,
                  status: "Success",
                };
              }
              if (detail.includes("override")) {
                return {
                  type: "Override Proposed",
                  description: event.detail ?? "Daily limit override proposed",
                  variant: "paused" as const,
                  status: "Pending",
                };
              }
              if (detail.includes("swarm")) {
                return {
                  type: "Swarm Configured",
                  description: event.detail ?? "Agent swarm settings updated",
                  variant: "active" as const,
                  status: "Success",
                };
              }
              return {
                type: "Governance Action",
                description: event.detail ?? "Governance event",
                variant: "default" as const,
                status: "Completed",
              };
            };

            const details = getEventDetails();
            const timestamp = event.timestamp ?? Math.floor(Date.now() / 1000);
            const timeAgo = Math.floor(
              (Date.now() - timestamp * 1000) / 1000 / 60,
            );
            const timeStr =
              timeAgo < 60
                ? `${timeAgo}m ago`
                : timeAgo < 1440
                  ? `${Math.floor(timeAgo / 60)}h ago`
                  : `${Math.floor(timeAgo / 1440)}d ago`;

            return (
              <div key={event.signature} className="history-item">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-5 bg-white/1 border border-white/5 rounded-sm hover:border-white/10 transition-colors">
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-3">
                      <Badge variant={details.variant} className="text-[8px]">
                        {details.type}
                      </Badge>
                      <span className="mono text-[10px] text-(--text-muted)">
                        {timeStr}
                      </span>
                    </div>
                    <p className="text-xs text-(--text-main) opacity-80">
                      {details.description}
                    </p>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-right">
                      <div className="text-[9px] mono text-(--text-muted) uppercase">
                        Transaction
                      </div>
                      <div className="text-[10px] text-(--text-main) mono">
                        {shortenAddress(event.signature, 6, 6)}
                      </div>
                    </div>
                    <StatusPill
                      variant={details.variant}
                      className="text-[9px]"
                    >
                      {details.status}
                    </StatusPill>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
