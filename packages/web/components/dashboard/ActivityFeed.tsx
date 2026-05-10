"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { Badge } from "@/components/global/Badge";
import { Skeleton } from "@/components/global/Skeleton";
import type { ParsedActivity } from "@/lib/hooks";
import { formatTimeAgo, shortenAddress } from "@/lib/utils";

interface ActivityFeedProps {
  activity?: ParsedActivity[];
  loading?: boolean;
}

const EMPTY_ACTIVITY: ParsedActivity[] = [];

function kindLabel(item: ParsedActivity): string {
  if (item.kind === "proposal") return `Proposal #${item.proposalId ?? "?"}`;
  if (item.kind === "execution") return "Execution";
  const raw = item.detail?.split(":")[0]?.trim() ?? "audit";
  return raw.replace(/_/g, " ");
}

function outcomeVariant(
  item: ParsedActivity,
): "active" | "error" | "paused" | "default" {
  if (item.kind !== "proposal") return "default";
  if (item.approved === true) return "active";
  if (item.approved === false) return "error";
  if (item.status === 5 || item.status === 6) return "paused";
  return "default";
}

function outcomeLabel(item: ParsedActivity): string {
  if (item.kind !== "proposal") return "event";
  if (item.approved === true) return "approved";
  if (item.approved === false) return "denied";
  if (item.status === 5 || item.status === 6) return "cancelled";
  return "pending";
}

function detailText(item: ParsedActivity): string {
  return (
    item.detail?.split(":").slice(1).join(":").trim() ||
    shortenAddress(item.treasury, 5, 4)
  );
}

export function ActivityFeed({
  activity = EMPTY_ACTIVITY,
  loading = false,
}: ActivityFeedProps) {
  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.2em] text-(--text-muted) block mb-1">
            Recent Activity
          </span>
          <h2 className="text-base font-semibold text-(--text-main)">
            Event Feed
          </h2>
        </div>
      </div>

      {/* Items */}
      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }, (_, i) => `sk-${i}`).map((k) => (
            <div key={k} className="flex gap-3 py-2">
              <Skeleton className="size-[6px] rounded-full mt-1.5 shrink-0" />
              <div className="flex-1 space-y-1.5">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-2.5 w-48" />
              </div>
            </div>
          ))}
        </div>
      ) : activity.length === 0 ? (
        <p className="text-sm text-(--text-muted) py-4">
          No recent events for this wallet.
        </p>
      ) : (
        <div>
          {activity.slice(0, 4).map((item, i) => (
            <Link
              key={`${item.signature}-${item.kind}-${item.detail ?? item.proposalId}`}
              href={`/dashboard/activity`}
              className="flex gap-3 py-2.5 -mx-2 px-2 rounded-sm hover:bg-(--hover-bg) transition-colors group"
            >
              {/* dot */}
              <div className="flex flex-col items-center shrink-0">
                <div className="size-[7px] rounded-full bg-primary mt-[5px]" />
                {i < Math.min(activity.length, 4) - 1 && (
                  <div className="w-px flex-1 bg-border mt-1" />
                )}
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-2 mb-0.5">
                  <span className="mono text-[10px] font-bold text-(--text-main) uppercase tracking-wide truncate group-hover:text-primary transition-colors">
                    {kindLabel(item)}
                  </span>
                  <Badge
                    variant={outcomeVariant(item)}
                    className="text-[9px] px-1.5 py-0.5 shrink-0"
                  >
                    {outcomeLabel(item)}
                  </Badge>
                </div>
                <p className="mono text-[10px] text-(--text-muted) truncate">
                  {detailText(item)}
                  <span className="mx-1 opacity-40">·</span>
                  {formatTimeAgo(item.timestamp)}
                </p>
              </div>
            </Link>
          ))}

          {/* Footer */}
          <div className="mt-3 pt-3 border-t border-border flex justify-end">
            <Link
              href="/dashboard/activity"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md mono text-[10px] uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors"
            >
              View full activity log
              <ChevronRight className="size-2.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
