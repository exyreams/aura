import { Bar } from "@/components/charts/Bar";
import { Card } from "@/components/global/Card";
import { Progress } from "@/components/global/Progress";
import type { TreasuryEntry } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";

interface SpendingProgressProps {
  treasury: TreasuryEntry;
}

export const SpendingProgress = ({ treasury }: SpendingProgressProps) => {
  // Values are stored in USD cents — divide by 100 for display
  const spentToday =
    Number(treasury.account.policyState.spentTodayUsd.toString()) / 100;
  const dailyLimit =
    Number(treasury.account.policyConfig.dailyLimitUsd.toString()) / 100;

  const recentAmounts = treasury.account.policyState.recentAmounts as Array<{
    toString(): string;
  }>;
  const chartData =
    recentAmounts.length > 0
      ? recentAmounts.map((amount, index) => ({
          day: `Tx ${index + 1}`,
          amount: Number(amount.toString()) / 100,
        }))
      : [{ day: "Current", amount: spentToday }];

  return (
    <Card className="lg:col-span-6 h-full flex flex-col" hover={false}>
      <div className="mb-8">
        <h2 className="text-xl font-semibold text-(--text-main) mb-1">
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
