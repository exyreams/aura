import { Card } from "@/components/global/Card";
import { Progress } from "@/components/global/Progress";
import { Activity, DollarSign, Shield, TrendingUp } from "@/components/icons";
import type { TreasuryEntry } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";

interface TreasuryStatsProps {
  treasury: TreasuryEntry;
}

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
  progress?: { value: number; max: number };
}

function StatCard({ title, value, subtitle, icon, progress }: StatCardProps) {
  return (
    <Card hover={false} className="flex flex-col gap-0">
      <div className="flex items-start justify-between gap-3 mb-5">
        <span className="mono text-[10px] uppercase tracking-[0.2em] text-(--text-muted)">
          {title}
        </span>
        <span className="text-(--text-muted) shrink-0">{icon}</span>
      </div>
      <div className="text-3xl font-bold text-(--text-main) mono tracking-tight mb-1.5">
        {value}
      </div>
      <div className="text-[11px] text-(--text-muted) leading-relaxed mb-4">
        {subtitle}
      </div>
      {progress ? (
        <Progress
          value={progress.value}
          max={progress.max}
          size="extraSmall"
          showPercentage={false}
          label={undefined}
          className="mt-auto"
        />
      ) : (
        <div className="h-1.5 mt-auto" />
      )}
    </Card>
  );
}

export const TreasuryStats = ({ treasury }: TreasuryStatsProps) => {
  // Values are stored on-chain in USD cents — divide by 100 for display
  const dailyLimit =
    Number(treasury.account.policyConfig.dailyLimitUsd.toString()) / 100;
  const perTxLimit =
    Number(treasury.account.policyConfig.perTxLimitUsd.toString()) / 100;
  const totalTx = Number(treasury.account.totalTransactions.toString());
  const reputationVolume =
    Number(treasury.account.reputation.totalVolumeUsd.toString()) / 100;
  const successfulTransactions = Number(
    treasury.account.reputation.successfulTransactions.toString(),
  );
  const spentToday =
    Number(treasury.account.policyState.spentTodayUsd.toString()) / 100;

  const spendPct =
    dailyLimit > 0 ? Math.min(100, (spentToday / dailyLimit) * 100) : 0;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <StatCard
        title="Daily Limit"
        value={formatCurrency(dailyLimit)}
        subtitle={
          dailyLimit > 0
            ? `${spendPct.toFixed(0)}% of ${formatCurrency(dailyLimit)} used today`
            : "No daily limit configured"
        }
        icon={<Shield className="size-4" animateOnHover />}
        progress={
          dailyLimit > 0 ? { value: spentToday, max: dailyLimit } : undefined
        }
      />
      <StatCard
        title="Per-tx Limit"
        value={formatCurrency(perTxLimit)}
        subtitle="Per transaction cap"
        icon={<DollarSign className="size-4" animateOnHover />}
      />
      <StatCard
        title="Total Transactions"
        value={totalTx.toLocaleString()}
        subtitle="On-chain counter"
        icon={<Activity className="size-4" animateOnHover />}
      />
      <StatCard
        title="Reputation Volume"
        value={formatCurrency(reputationVolume)}
        subtitle={`${successfulTransactions.toLocaleString()} successful tx`}
        icon={<TrendingUp className="size-4" animateOnHover />}
      />
    </section>
  );
};
