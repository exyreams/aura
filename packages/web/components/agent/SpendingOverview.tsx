"use client";

import { Bar } from "@/components/charts/Bar";

interface SpendingOverviewProps {
  data: Array<{
    name: string;
    spent: number;
    limit: number;
  }>;
}

export function SpendingOverview({ data }: SpendingOverviewProps) {
  const totalSpent = data.reduce((sum, item) => sum + item.spent, 0);

  return (
    <Bar
      title="Spend Over Time"
      description="Live spent-today counters across owned treasuries."
      data={data}
      xAxisKey="name"
      height={250}
      bars={[
        {
          dataKey: "spent",
          label: "Spent Today (USD)",
          darkColor: "#6B7280",
          lightColor: "#4B5563",
        },
      ]}
      footer={
        data.length === 0 ? (
          <p className="text-sm text-(--text-muted)">
            Connect a wallet with treasuries to render spend data.
          </p>
        ) : (
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 bg-slate-600 rounded-sm" />
              <span className="mono text-[10px] text-(--text-muted) uppercase">
                Aggregate Spending
              </span>
            </div>
            <span className="mono text-sm text-(--text-main) font-bold">
              ${totalSpent.toFixed(2)} total spent today
            </span>
          </div>
        )
      }
    />
  );
}
