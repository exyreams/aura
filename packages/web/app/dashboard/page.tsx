"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { ChevronRight, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Card } from "@/components/global/Card";
import { Table, type TableColumn } from "@/components/global/Table";
import type { TreasuryEntry } from "@/lib/hooks";
import { useOwnedTreasuries, useRecentActivity } from "@/lib/hooks";
import { formatCurrency, shortenAddress } from "@/lib/utils";

const ITEMS_PER_PAGE = 5;

export default function DashboardPage() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);

  const treasuriesQuery = useOwnedTreasuries();
  const treasuries = treasuriesQuery.data ?? [];
  const activityQuery = useRecentActivity(treasuries);
  const activity = activityQuery.data ?? [];

  // Calculate stats from real data
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

  // Pagination
  const totalItems = treasuries.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedData = treasuries.slice(startIndex, endIndex);

  // Transform data for SpendingChart - ensure we have valid data
  const chartData = treasuries
    .filter((entry) => entry.account?.agentId) // Only include entries with agentId
    .map((entry) => ({
      agentId: entry.account.agentId,
      dailyLimit: Number(entry.account.policyConfig.dailyLimitUsd.toString()),
      spentToday: Number(entry.account.policyState.spentTodayUsd.toString()),
    }));

  const columns: TableColumn<TreasuryEntry>[] = [
    {
      key: "agentId",
      header: "Agent",
      align: "left",
      render: (item) => (
        <Link
          href={`/dashboard/treasuries/${item.publicKey.toBase58()}`}
          className="font-medium text-(--text-main) hover:text-primary transition-colors cursor-pointer"
        >
          {item.account.agentId}
        </Link>
      ),
    },
    {
      key: "pda",
      header: "PDA",
      align: "left",
      render: (item) => (
        <span className="mono text-[11px] text-(--text-muted)">
          {shortenAddress(item.publicKey.toBase58(), 4, 3)}
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (item) => (
        <StatusPill
          variant={item.account.executionPaused ? "paused" : "active"}
        >
          {item.account.executionPaused ? "paused" : "active"}
        </StatusPill>
      ),
    },
    {
      key: "dailyLimit",
      header: "Daily Limit",
      align: "right",
      render: (item) => (
        <span className="mono text-[11px] text-(--text-main)">
          {formatCurrency(
            Number(item.account.policyConfig.dailyLimitUsd.toString()),
          )}
        </span>
      ),
    },
    {
      key: "spentToday",
      header: "Spent Today",
      align: "right",
      render: (item) => (
        <span className="mono text-[11px] text-(--text-muted)">
          {formatCurrency(
            Number(item.account.policyState.spentTodayUsd.toString()),
          )}
        </span>
      ),
    },
  ];

  return (
    <div className="relative max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="mb-12 flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
            Dashboard Overview
          </span>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-(--text-main) mb-2">
            Connected treasury activity at a glance.
          </h1>
          <p className="text-(--text-muted) font-light max-w-xl">
            This page reads treasury accounts and recent program events from the
            connected wallet.
          </p>
        </div>
        <Link href="/dashboard/treasuries/new">
          <Button
            variant="primary"
            size="medium"
            icon={<Plus className="w-4 h-4" />}
          >
            Create Treasury
          </Button>
        </Link>
      </header>

      {/* Stats Grid */}
      <StatsGrid
        totalTreasuries={publicKey ? treasuries.length : 0}
        totalTransactions={totalTransactions}
        totalVolume={totalVolume}
        activeAgents={activeAgents}
        totalSpentToday={totalSpentToday}
        totalDailyLimit={totalDailyLimit}
        isConnected={!!publicKey}
      />

      {/* Main Content Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
        {/* Treasury List */}
        <section className="lg:col-span-8 flex flex-col">
          <Card className="h-full p-0" hover={false}>
            <div className="flex items-center justify-between mb-8 px-8 pt-8">
              <div>
                <h2 className="text-xl font-bold text-(--text-main)">
                  Treasury List
                </h2>
                <p className="text-[12px] text-(--text-muted)">
                  Live account fetch for every treasury owned by the connected
                  wallet.
                </p>
              </div>
              <Link href="/dashboard/treasuries">
                <Button variant="secondary" size="small">
                  View All
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </Link>
            </div>

            <div className="px-8 pb-8">
              <Table<TreasuryEntry>
                columns={columns}
                data={publicKey ? paginatedData : []}
                keyExtractor={(item) => item.publicKey.toBase58()}
                loading={treasuriesQuery.isLoading}
                emptyState={publicKey ? "empty" : "no-wallet"}
                emptyAction={
                  publicKey
                    ? {
                        label: "Create Treasury",
                        onClick: () => router.push("/dashboard/treasuries/new"),
                      }
                    : undefined
                }
                pagination={
                  publicKey && totalItems > 0
                    ? {
                        currentPage,
                        totalPages,
                        onPageChange: setCurrentPage,
                        totalItems,
                        itemsPerPage: ITEMS_PER_PAGE,
                      }
                    : undefined
                }
              />
            </div>
          </Card>
        </section>

        {/* Activity Feed */}
        <aside className="lg:col-span-4">
          <ActivityFeed activity={activity} loading={activityQuery.isLoading} />
        </aside>
      </div>

      {/* Spending Chart */}
      <SpendingChart data={chartData} />
    </div>
  );
}
