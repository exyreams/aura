"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useState } from "react";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import { SpendingChart } from "@/components/dashboard/SpendingChart";
import { StatsGrid } from "@/components/dashboard/StatsGrid";
import { Badge, StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Table, type TableColumn } from "@/components/global/Table";
import { Tooltip } from "@/components/global/Tooltip";
import { Check, Copy, SquareArrowOutUpRight } from "@/components/icons";
import { ChevronRight } from "@/components/icons/ChevronRight";
import { CreateTreasuryModal } from "@/components/treasuries/CreateTreasuryModal";
import { mapBackendEvents } from "@/lib/aura-app";
import type { TreasuryEntry } from "@/lib/hooks";
import { useActivity, useOwnedTreasuries } from "@/lib/hooks";
import { formatCurrency, shortenAddress } from "@/lib/utils";

// Signer address cell with copy + explorer
function SignerCell({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <span className="inline-flex items-center gap-1.5">
      <Tooltip content={address}>
        <span className="mono text-[10px] text-(--text-muted)">
          {shortenAddress(address, 4, 4)}
        </span>
      </Tooltip>
      <Tooltip content={copied ? "Copied!" : "Copy address"}>
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            await navigator.clipboard.writeText(address);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-(--text-muted) hover:text-primary transition-colors"
        >
          {copied ? (
            <Check className="size-2.5 text-success" animateOnHover />
          ) : (
            <Copy className="size-2.5" animateOnHover />
          )}
        </button>
      </Tooltip>
      <Tooltip content="View on Explorer">
        <a
          href={`https://explorer.solana.com/address/${address}?cluster=devnet`}
          target="_blank"
          rel="noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="text-(--text-muted) hover:text-primary transition-colors"
        >
          <SquareArrowOutUpRight className="size-2.5" animateOnHover />
        </a>
      </Tooltip>
    </span>
  );
}

const ITEMS_PER_PAGE = 5;

// Inline spend bar — shows spentToday / dailyLimit visually
function SpendBar({ spent, limit }: { spent: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
  const color =
    pct > 80 ? "var(--danger)" : pct > 50 ? "var(--warning)" : "var(--success)";
  return (
    <div className="flex items-center gap-2 min-w-0">
      <div className="flex-1 h-1 bg-border rounded-full overflow-hidden min-w-[40px]">
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="mono text-[10px] text-(--text-muted) shrink-0 w-8 text-right">
        {pct.toFixed(0)}%
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { publicKey } = useWallet();
  const [currentPage, setCurrentPage] = useState(1);
  const [createOpen, setCreateOpen] = useState(false);

  const treasuriesQuery = useOwnedTreasuries();
  const treasuries = treasuriesQuery.data ?? [];
  const activityQuery = useActivity({ limit: 20 });
  const activity = mapBackendEvents(activityQuery.data?.events ?? []);

  // Stats
  const totalTransactions = treasuries.reduce(
    (sum, e) => sum + Number(e.account.totalTransactions.toString()),
    0,
  );
  const totalVolume = treasuries.reduce(
    (sum, e) => sum + Number(e.account.reputation.totalVolumeUsd.toString()),
    0,
  );
  const activeAgents = treasuries.filter(
    (e) => !e.account.executionPaused,
  ).length;
  const totalDailyLimit = treasuries.reduce(
    (sum, e) =>
      sum + Number(e.account.policyConfig.dailyLimitUsd.toString()) / 100,
    0,
  );
  const totalSpentToday = treasuries.reduce(
    (sum, e) =>
      sum + Number(e.account.policyState.spentTodayUsd.toString()) / 100,
    0,
  );

  // Sort: active first, paused below
  const sortedTreasuries = [...treasuries].sort((a, b) => {
    if (a.account.executionPaused === b.account.executionPaused) return 0;
    return a.account.executionPaused ? 1 : -1;
  });

  // Pagination on sorted list
  const totalItems = sortedTreasuries.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedData = sortedTreasuries.slice(start, start + ITEMS_PER_PAGE);

  const chartData = treasuries.flatMap((e) =>
    e.account?.agentId
      ? [
          {
            agentId: e.account.agentId,
            dailyLimit:
              Number(e.account.policyConfig.dailyLimitUsd.toString()) / 100,
            spentToday:
              Number(e.account.policyState.spentTodayUsd.toString()) / 100,
          },
        ]
      : [],
  );

  const columns: TableColumn<TreasuryEntry>[] = [
    {
      key: "agentId",
      header: "Agent",
      align: "left",
      render: (item) => (
        <div className="flex flex-col gap-0.5">
          <Link
            href={`/dashboard/treasuries/${item.publicKey.toBase58()}`}
            className="mono text-[11px] font-bold text-(--text-main) hover:text-primary transition-colors"
          >
            {item.account.agentId}
          </Link>
          <Tooltip content={item.publicKey.toBase58()}>
            <span className="mono text-[10px] text-(--text-muted)">
              {shortenAddress(item.publicKey.toBase58(), 4, 4)}
            </span>
          </Tooltip>
        </div>
      ),
    },
    {
      key: "signer",
      header: "AI Signer",
      align: "left",
      render: (item) => {
        const addr = item.account.aiAuthority.toBase58();
        return <SignerCell address={addr} />;
      },
    },
    {
      key: "status",
      header: "Status",
      align: "center",
      render: (item) => (
        <div className="flex flex-col items-center gap-1">
          <StatusPill
            variant={item.account.executionPaused ? "paused" : "active"}
          >
            {item.account.executionPaused ? "paused" : "active"}
          </StatusPill>
          {item.account.dwallets.length > 0 && (
            <Badge variant="default" className="text-[9px] px-1.5 py-0">
              {item.account.dwallets.length} chain
              {item.account.dwallets.length !== 1 ? "s" : ""}
            </Badge>
          )}
        </div>
      ),
    },
    {
      key: "spend",
      header: "Spend / Limit",
      align: "right",
      render: (item) => {
        const spent =
          Number(item.account.policyState.spentTodayUsd.toString()) / 100;
        const limit =
          Number(item.account.policyConfig.dailyLimitUsd.toString()) / 100;
        return (
          <div className="flex flex-col items-end gap-1.5 min-w-[100px]">
            <span className="mono text-[11px] text-(--text-main)">
              {formatCurrency(spent)}
              <span className="text-(--text-muted)">
                {" "}
                / {formatCurrency(limit)}
              </span>
            </span>
            <SpendBar spent={spent} limit={limit} />
          </div>
        );
      },
    },
  ];

  return (
    <>
      <CreateTreasuryModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <div className="relative max-w-[1600px] mx-auto">
        {/* Header */}
        <header className="mb-10 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
              Dashboard Overview
            </span>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-(--text-main) mb-2">
              Treasury Overview
            </h1>
            <p className="text-(--text-muted) font-light text-sm max-w-xl">
              Live account data and recent on-chain events for the connected
              wallet.
            </p>
          </div>
          <Button
            variant="primary"
            size="medium"
            onClick={() => setCreateOpen(true)}
            className="shrink-0"
          >
            + New Treasury
          </Button>
        </header>

        {/* Stats */}
        <StatsGrid
          totalTreasuries={publicKey ? treasuries.length : 0}
          totalTransactions={totalTransactions}
          totalVolume={totalVolume}
          activeAgents={activeAgents}
          totalSpentToday={totalSpentToday}
          totalDailyLimit={totalDailyLimit}
          isConnected={!!publicKey}
        />

        {/* Main grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-10">
          {" "}
          {/* Treasury table */}
          <section className="lg:col-span-8 flex flex-col">
            <div className="flex items-center justify-between mb-4">
              {" "}
              <div>
                <span className="mono text-[10px] uppercase tracking-[0.2em] text-(--text-muted) block mb-1">
                  Treasuries
                </span>
                <h2 className="text-base font-semibold text-(--text-main)">
                  Treasury List
                </h2>
              </div>
              <Link href="/dashboard/treasuries">
                <Button
                  variant="ghost"
                  size="small"
                  className="text-[10px] mono uppercase tracking-widest flex items-center gap-1"
                >
                  View all <ChevronRight size={12} />
                </Button>
              </Link>
            </div>
            <div className="flex-1">
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
                        onClick: () => setCreateOpen(true),
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
          </section>
          {/* Activity feed */}
          <aside className="lg:col-span-4 self-start">
            <ActivityFeed
              activity={activity}
              loading={activityQuery.isLoading}
            />
          </aside>
        </div>

        {/* Spending chart */}
        <SpendingChart data={chartData} />
      </div>
    </>
  );
}
