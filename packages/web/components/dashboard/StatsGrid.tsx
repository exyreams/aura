import { Activity, BarChart3, Box, TrendingUp } from "lucide-react";
import { Card } from "@/components/global/Card";
import { formatCurrency, formatNumber } from "@/lib/utils";

interface StatCardProps {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}

function StatCard({ title, value, subtitle, icon }: StatCardProps) {
  return (
    <Card>
      <div className="mono text-[10px] uppercase text-(--text-muted) mb-4 flex justify-between items-center">
        {title}
        {icon}
      </div>
      <div className="text-3xl font-bold text-(--text-main) mono mb-1">
        {value}
      </div>
      <div className="text-[11px] text-(--text-muted)">{subtitle}</div>
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
  activeAgents,
  totalSpentToday,
  totalDailyLimit,
  isConnected,
}: StatsGridProps) {
  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-12">
      <StatCard
        title="Total Treasuries"
        value={isConnected ? formatNumber(totalTreasuries) : "0"}
        subtitle={
          isConnected ? "Owned by connected wallet" : "Connect a wallet"
        }
        icon={<Box className="w-4 h-4" />}
      />
      <StatCard
        title="Total Transactions"
        value={formatNumber(totalTransactions)}
        subtitle="From treasury account counters"
        icon={<TrendingUp className="w-4 h-4" />}
      />
      <StatCard
        title="Total Volume"
        value={formatCurrency(totalVolume)}
        subtitle="Aggregated reputation volume"
        icon={<BarChart3 className="w-4 h-4" />}
      />
      <StatCard
        title="Active Agents"
        value={formatNumber(activeAgents)}
        subtitle={`${formatCurrency(totalSpentToday)} spent today of ${formatCurrency(totalDailyLimit)}`}
        icon={<Activity className="w-4 h-4" />}
      />
    </section>
  );
}
