"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { SpendingBarChart } from "@/components/app/charts";
import {
  EmptyState,
  PageHeader,
  SectionLink,
  StatCard,
  StatusPill,
  Surface,
} from "@/components/app/ui";
import { formatProposalStatus, formatViolation } from "@/lib/aura-app";
import { useOwnedTreasuries, useRecentActivity } from "@/lib/hooks";
import { formatCurrency, formatNumber, shortenAddress } from "@/lib/utils";

export default function DashboardOverviewPage() {
  const { publicKey } = useWallet();
  const treasuriesQuery = useOwnedTreasuries();
  const treasuries = treasuriesQuery.data ?? [];
  const activityQuery = useRecentActivity(treasuries);
  const activity = activityQuery.data ?? [];

  const totalTransactions = treasuries.reduce(
    (sum, entry) => sum + Number(entry.account.totalTransactions.toString()),
    0,
  );
  const totalVolume = treasuries.reduce(
    (sum, entry) =>
      sum + Number(entry.account.reputation.totalVolumeUsd.toString()),
    0,
  );
  const activeAgents = treasuries.filter(
    (entry) => !entry.account.executionPaused,
  ).length;
  const totalDailyLimit = treasuries.reduce(
    (sum, entry) =>
      sum + Number(entry.account.policyConfig.dailyLimitUsd.toString()),
    0,
  );
  const totalSpentToday = treasuries.reduce(
    (sum, entry) =>
      sum + Number(entry.account.policyState.spentTodayUsd.toString()),
    0,
  );

  const spendingSeries = treasuries.map((entry) => ({
    day: entry.account.agentId.slice(0, 8),
    spend: Number(entry.account.policyState.spentTodayUsd.toString()),
    limit: Number(entry.account.policyConfig.dailyLimitUsd.toString()),
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Dashboard Overview"
        title="Connected treasury activity at a glance."
        copy="This page now reads treasury accounts and recent program events from the connected wallet."
        action={
          <SectionLink href="/app/treasuries/new" label="Create Treasury" />
        }
      />

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total Treasuries"
          value={publicKey ? formatNumber(treasuries.length) : "0"}
          helper={publicKey ? "Owned by connected wallet" : "Connect a wallet"}
        />
        <StatCard
          label="Total Transactions"
          value={formatNumber(totalTransactions)}
          helper="From treasury account counters"
        />
        <StatCard
          label="Total Volume"
          value={formatCurrency(totalVolume)}
          helper="Aggregated reputation volume"
        />
        <StatCard
          label="Active Agents"
          value={formatNumber(activeAgents)}
          helper={`${formatCurrency(totalSpentToday)} spent today of ${formatCurrency(totalDailyLimit)}`}
        />
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <Surface
          title="Treasury List"
          copy="Live account fetch for every treasury owned by the connected wallet."
          action={
            <SectionLink href="/app/treasuries" label="Open all treasuries" />
          }
        >
          {!publicKey ? (
            <EmptyState
              title="Wallet not connected"
              copy="Connect a wallet from the app shell to load owned treasuries."
            />
          ) : treasuries.length === 0 ? (
            <EmptyState
              title="No treasuries yet"
              copy="Create your first treasury on-chain to start using the rest of the dashboard."
              action={
                <Link className="button-primary" href="/app/treasuries/new">
                  Create treasury
                </Link>
              }
            />
          ) : (
            <div className="table-shell">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>PDA</th>
                    <th>Status</th>
                    <th>Daily Limit</th>
                    <th>Spent Today</th>
                  </tr>
                </thead>
                <tbody>
                  {treasuries.map((treasury) => (
                    <tr key={treasury.publicKey.toBase58()}>
                      <td>
                        <Link
                          href={`/app/treasuries/${treasury.publicKey.toBase58()}`}
                          className="font-medium text-white"
                        >
                          {treasury.account.agentId}
                        </Link>
                      </td>
                      <td className="mono text-slate-300">
                        {shortenAddress(treasury.publicKey.toBase58(), 5, 5)}
                      </td>
                      <td>
                        <StatusPill
                          status={
                            treasury.account.executionPaused
                              ? "Paused"
                              : "Active"
                          }
                        />
                      </td>
                      <td>
                        {formatCurrency(
                          Number(
                            treasury.account.policyConfig.dailyLimitUsd.toString(),
                          ),
                        )}
                      </td>
                      <td>
                        {formatCurrency(
                          Number(
                            treasury.account.policyState.spentTodayUsd.toString(),
                          ),
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Surface>

        <Surface
          title="Recent Activity"
          copy="Parsed from recent program events emitted by treasury transactions."
        >
          <div className="space-y-4">
            {activity.length === 0 ? (
              <p className="text-sm text-slate-400">
                No recent events found for the current wallet.
              </p>
            ) : (
              activity.map((item) => (
                <div
                  key={`${item.signature}-${item.kind}-${item.detail ?? item.proposalId}`}
                  className="rounded-[1.4rem] border border-white/8 bg-white/4 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-medium text-white">
                        {item.kind === "proposal"
                          ? `Proposal #${item.proposalId ?? "?"}`
                          : (item.detail ?? "Audit event")}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        {shortenAddress(item.treasury, 6, 6)}
                      </p>
                    </div>
                    {item.kind === "proposal" ? (
                      <StatusPill
                        status={
                          item.status === undefined
                            ? "Pending"
                            : item.status === 3
                              ? "Approved"
                              : item.status === 4
                                ? "Denied"
                                : "Pending"
                        }
                      />
                    ) : null}
                  </div>
                  <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
                    <span>
                      {item.kind === "proposal"
                        ? `${formatProposalStatus(item.status ?? 0)}${item.violation ? ` • ${formatViolation(item.violation)}` : ""}`
                        : item.detail}
                    </span>
                    <span>
                      {item.timestamp
                        ? new Date(item.timestamp * 1000).toLocaleString()
                        : "Unknown time"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </Surface>
      </section>

      <Surface
        title="Spending Chart"
        copy="Current spent-today versus daily limit for each connected treasury."
      >
        <SpendingBarChart data={spendingSeries} />
      </Surface>
    </div>
  );
}
