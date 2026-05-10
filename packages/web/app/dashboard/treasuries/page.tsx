"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import Link from "next/link";
import { useState } from "react";
import { Badge, StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Table, type TableColumn } from "@/components/global/Table";
import { Tooltip } from "@/components/global/Tooltip";
import { Check, Copy, Plus, SquareArrowOutUpRight } from "@/components/icons";
import { CreateTreasuryModal } from "@/components/treasuries/CreateTreasuryModal";
import { TreasurySpendChart } from "@/components/treasuries/TreasurySpendChart";
import type { TreasuryEntry } from "@/lib/hooks";
import { useOwnedTreasuries } from "@/lib/hooks";
import { formatCurrency, formatTimeAgo, shortenAddress } from "@/lib/utils";

const ITEMS_PER_PAGE = 20;

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

export default function TreasuriesPage() {
  const { publicKey } = useWallet();
  const [createOpen, setCreateOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);

  const treasuriesQuery = useOwnedTreasuries();
  const treasuries = treasuriesQuery.data ?? [];

  // Sort: active first, paused below
  const sorted = [...treasuries].sort((a, b) => {
    if (a.account.executionPaused === b.account.executionPaused) return 0;
    return a.account.executionPaused ? 1 : -1;
  });

  const totalItems = sorted.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const start = (currentPage - 1) * ITEMS_PER_PAGE;
  const paginatedData = sorted.slice(start, start + ITEMS_PER_PAGE);

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
      render: (item) => (
        <SignerCell address={item.account.aiAuthority.toBase58()} />
      ),
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
          <div className="flex flex-col items-end gap-1.5 min-w-[110px]">
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
    {
      key: "totalTx",
      header: "Tx",
      align: "right",
      render: (item) => (
        <span className="mono text-[11px] text-(--text-muted)">
          {Number(item.account.totalTransactions.toString()).toLocaleString()}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      align: "right",
      render: (item) => (
        <Tooltip
          content={new Date(
            Number(item.account.createdAt.toString()) * 1000,
          ).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
        >
          <span
            className="mono text-[10px] text-(--text-muted)"
            suppressHydrationWarning
          >
            {formatTimeAgo(Number(item.account.createdAt.toString()))}
          </span>
        </Tooltip>
      ),
    },
  ];

  return (
    <>
      <CreateTreasuryModal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
      />

      <div className="relative max-w-[1600px] mx-auto flex flex-col min-h-[calc(100vh-73px-4rem)]">
        {/* Header */}
        <header className="mb-8 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
          <div>
            <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
              Treasuries
            </span>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-(--text-main) mb-2">
              My Treasuries
            </h1>
            <p className="text-(--text-muted) font-light text-sm max-w-xl">
              On-chain treasury accounts owned by the connected wallet.
            </p>
          </div>
          <Button
            variant="primary"
            size="medium"
            icon={<Plus className="size-4" animateOnHover />}
            onClick={() => setCreateOpen(true)}
            className="shrink-0"
          >
            Create Treasury
          </Button>
        </header>

        {/* Error */}
        {treasuriesQuery.isError && (
          <div className="mb-6 p-4 bg-danger/10 border border-danger/20 rounded-sm">
            <p className="text-danger text-sm">
              Failed to load treasuries:{" "}
              {treasuriesQuery.error instanceof Error
                ? treasuriesQuery.error.message
                : "Unknown error"}
            </p>
          </div>
        )}

        {/* Quick stats strip */}
        {!treasuriesQuery.isLoading && treasuries.length > 0 && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mb-8">
            {[
              {
                label: "Total",
                value: treasuries.length.toString(),
                sub: "treasuries",
              },
              {
                label: "Active",
                value: treasuries
                  .filter((e) => !e.account.executionPaused)
                  .length.toString(),
                sub: "running",
              },
              {
                label: "Spent Today",
                value: formatCurrency(
                  treasuries.reduce(
                    (s, e) =>
                      s +
                      Number(e.account.policyState.spentTodayUsd.toString()) /
                        100,
                    0,
                  ),
                ),
                sub: "across all",
              },
              {
                label: "Daily Limit",
                value: formatCurrency(
                  treasuries.reduce(
                    (s, e) =>
                      s +
                      Number(e.account.policyConfig.dailyLimitUsd.toString()) /
                        100,
                    0,
                  ),
                ),
                sub: "combined",
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="border border-border rounded-sm px-4 py-3 bg-(--card-bg)"
              >
                <span className="mono text-[10px] uppercase tracking-[0.2em] text-(--text-muted) block mb-1">
                  {stat.label}
                </span>
                <span className="mono text-xl font-bold text-(--text-main)">
                  {stat.value}
                </span>
                <span className="mono text-[10px] text-(--text-muted) block">
                  {stat.sub}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 7-day spend chart */}
        {!treasuriesQuery.isLoading && treasuries.length > 0 && (
          <div className="mb-8">
            <TreasurySpendChart
              treasuries={treasuries}
              isLoading={treasuriesQuery.isLoading}
            />
          </div>
        )}

        {/* Table */}
        <Table<TreasuryEntry>
          columns={columns}
          data={publicKey ? paginatedData : []}
          keyExtractor={(item) => item.publicKey.toBase58()}
          loading={treasuriesQuery.isLoading}
          emptyState={publicKey ? "empty" : "no-wallet"}
          emptyAction={
            publicKey
              ? { label: "Create Treasury", onClick: () => setCreateOpen(true) }
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
    </>
  );
}
