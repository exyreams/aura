import { Card } from "@/components/global/Card";
import type { TreasuryEntry } from "@/lib/hooks";
import { formatCurrency } from "@/lib/utils";

interface TreasuryStatsProps {
  treasury: TreasuryEntry;
}

export const TreasuryStats = ({ treasury }: TreasuryStatsProps) => {
  const dailyLimit = Number(
    treasury.account.policyConfig.dailyLimitUsd.toString(),
  );
  const perTxLimit = Number(
    treasury.account.policyConfig.perTxLimitUsd.toString(),
  );
  const totalTx = Number(treasury.account.totalTransactions.toString());
  const reputationVolume = Number(
    treasury.account.reputation.totalVolumeUsd.toString(),
  );
  const successfulTransactions = Number(
    treasury.account.reputation.successfulTransactions.toString(),
  );

  return (
    <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      <Card hover={true}>
        <div className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) mb-4">
          Daily Limit
        </div>
        <div className="text-3xl font-bold text-(--text-main) font-mono mb-1">
          {formatCurrency(dailyLimit)}
        </div>
        <div className="text-[10px] text-(--text-muted) uppercase font-mono">
          Policy config
        </div>
      </Card>
      <Card hover={true}>
        <div className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) mb-4">
          Per-tx Limit
        </div>
        <div className="text-3xl font-bold text-(--text-main) font-mono mb-1">
          {formatCurrency(perTxLimit)}
        </div>
        <div className="text-[10px] text-(--text-muted) uppercase font-mono">
          Policy config
        </div>
      </Card>
      <Card hover={true}>
        <div className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) mb-4">
          Total Transactions
        </div>
        <div className="text-3xl font-bold text-(--text-main) font-mono mb-1">
          {totalTx.toLocaleString()}
        </div>
        <div className="text-[10px] text-(--text-muted) uppercase font-mono">
          On-chain counter
        </div>
      </Card>
      <Card hover={true}>
        <div className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted) mb-4">
          Reputation Volume
        </div>
        <div className="text-3xl font-bold text-(--text-main) font-mono mb-1">
          {formatCurrency(reputationVolume)}
        </div>
        <div className="text-[10px] text-(--text-muted) uppercase font-mono">
          {successfulTransactions.toLocaleString()} successful tx
        </div>
      </Card>
    </section>
  );
};
