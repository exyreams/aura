import { useMemo } from "react";
import { Bar } from "@/components/charts/Bar";
import { Card } from "@/components/global/Card";
import { Progress } from "@/components/global/Progress";
import type { TreasuryEntry } from "@/lib/hooks";
import { useTreasuryAuditTrail } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";

interface SpendingProgressProps {
  treasury: TreasuryEntry;
}

export const SpendingProgress = ({ treasury }: SpendingProgressProps) => {
  const spentToday = Number(
    treasury.account.policyState.spentTodayUsd.toString(),
  );
  const dailyLimit = Number(
    treasury.account.policyConfig.dailyLimitUsd.toString(),
  );

  const { data: events } = useTreasuryAuditTrail(
    treasury.publicKey.toBase58(),
    50,
  );

  // Build chart data from real blockchain events
  const chartData = useMemo(() => {
    if (!events || events.length === 0) return [];

    // Group approved transactions by day
    const dailySpending = new Map<string, number>();

    events.forEach((event) => {
      if (event.kind === "proposal" && event.approved && event.timestamp) {
        const date = new Date(event.timestamp * 1000);
        const dayKey = date.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });

        // Aggregate spending per day (placeholder amounts - would need actual transaction amounts from events)
        const currentAmount = dailySpending.get(dayKey) || 0;
        dailySpending.set(dayKey, currentAmount + 100);
      }
    });

    // Convert to array and take last 7 days
    return Array.from(dailySpending.entries())
      .map(([day, amount]) => ({ day, amount }))
      .slice(-7);
  }, [events]);

  return (
    <Card className="lg:col-span-6 h-full flex flex-col" hover={false}>
      <div className="mb-8">
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Spending Progress
        </h2>
        <p className="text-[12px] text-(--text-muted)">
          Real-time spending counters and recent transaction history.
        </p>
      </div>

      <div className="mb-6">
        <Progress
          value={spentToday}
          max={dailyLimit}
          label="Spent today"
          showPercentage={false}
          size="large"
        />
        <div className="mt-2 text-right">
          <span className="font-mono text-sm text-(--text-main)">
            {formatCurrency(spentToday)} / {formatCurrency(dailyLimit)}
          </span>
        </div>
      </div>

      <div className="flex-1 mt-auto">
        <Bar
          title=""
          data={chartData}
          xAxisKey="day"
          bars={[
            {
              dataKey: "amount",
              label: "Amount",
              darkColor: "var(--primary)",
              lightColor: "var(--text-muted)",
            },
          ]}
          height={240}
        />
      </div>
    </Card>
  );
};
