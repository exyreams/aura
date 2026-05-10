import { Card } from "@/components/global/Card";
import { Progress } from "@/components/global/Progress";
import { Activity, DollarSign, Shield, TrendingUp } from "@/components/icons";
import { formatCurrency, formatNumber } from "@/lib/utils";

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

interface StatsGridProps {
  totalTreasuries: number;
  totalTransactions: number;
  totalVolume: number;
  activeAgents: number;
  totalSpentToday: number;
  totalDailyLimit: number;
  isConnected: boolean;
}

export function StatsGrid({
  totalTreasuries,
  totalTransactions,
  totalVolume,
  activeAgents: _activeAgents,
  totalSpentToday,
  totalDailyLimit,
  isConnected,
}: StatsGridProps) {
  const spendPct =
    totalDailyLimit > 0
      ? Math.min(100, (totalSpentToday / totalDailyLimit) * 100)
      : 0;

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-10">
      <StatCard
        title="Treasuries"
        value={isConnected ? formatNumber(totalTreasuries) : "—"}
        subtitle={
          isConnected ? "Owned by connected wallet" : "Connect a wallet"
        }
        icon={<Shield className="size-4" animateOnHover />}
      />
      <StatCard
        title="Transactions"
        value={formatNumber(totalTransactions)}
        subtitle="Lifetime across all treasuries"
        icon={<Activity className="size-4" animateOnHover />}
      />
      <StatCard
        title="Total Volume"
        value={formatCurrency(totalVolume / 100)}
        subtitle="Aggregated reputation volume"
        icon={<TrendingUp className="size-4" animateOnHover />}
      />
      <StatCard
        title="Daily Spend"
        value={formatCurrency(totalSpentToday)}
        subtitle={
          totalDailyLimit > 0
            ? `${spendPct.toFixed(0)}% of ${formatCurrency(totalDailyLimit)} limit`
            : "No limit configured"
        }
        icon={<DollarSign className="size-4" animateOnHover />}
        progress={
          totalDailyLimit > 0
            ? { value: totalSpentToday, max: totalDailyLimit }
            : undefined
        }
      />
    </section>
  );
}
