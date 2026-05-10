"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/global/Skeleton";
import type { TreasuryEntry } from "@/lib/hooks";

const Area = dynamic(
  () =>
    import("@/components/charts/AreaImpl").then((m) => ({ default: m.Area })),
  { ssr: false, loading: () => <Skeleton className="h-[200px] w-full" /> },
);

const DAYS = [
  "6d ago",
  "5d ago",
  "4d ago",
  "3d ago",
  "2d ago",
  "Yesterday",
  "Today",
];

interface TreasurySpendChartProps {
  treasuries: TreasuryEntry[];
  isLoading?: boolean;
}

export function TreasurySpendChart({
  treasuries,
  isLoading,
}: TreasurySpendChartProps) {
  // Build 7-day chart data from dailyBuckets ring buffer
  // Each treasury contributes its buckets; we sum across all treasuries per day
  const data = DAYS.map((day, i) => {
    const point: Record<string, string | number> = { day };
    for (const entry of treasuries) {
      const buckets = entry.account.policyState.dailyBuckets;
      const head = entry.account.policyState.dailyBucketHead;
      // Ring buffer: index = (head - (6 - i) + 7) % 7
      const idx = (((head - (6 - i)) % 7) + 7) % 7;
      const val = Number(buckets[idx]?.toString() ?? "0") / 100;
      const key = entry.account.agentId;
      point[key] = val;
    }
    return point;
  });

  // Pick distinct colors for up to 5 treasuries
  const COLORS = ["#9ca3b0", "#10b981", "#f59e0b", "#3b82f6", "#ef4444"];

  const areas = treasuries.slice(0, 5).map((entry, i) => ({
    dataKey: entry.account.agentId,
    color: COLORS[i] ?? "#9ca3b0",
    label: entry.account.agentId,
  }));

  const hasData = treasuries.some((e) =>
    e.account.policyState.dailyBuckets.some((b) => Number(b.toString()) > 0),
  );

  return (
    <Area
      title="7-Day Spend Trend"
      description="Daily spend across all treasuries over the past 7 days."
      data={hasData ? data : []}
      xAxisKey="day"
      areas={areas}
      height={200}
      showLegend={treasuries.length > 1}
      isLoading={isLoading}
      emptyMessage="No spend data in the last 7 days"
    />
  );
}
