"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Table, type TableColumn } from "@/components/global/Table";
import type { TreasuryEntry } from "@/lib/hooks";
import { useOwnedTreasuries } from "@/lib/hooks";
import { formatCurrency, shortenAddress } from "@/lib/utils";

export default function TreasuriesPage() {
  const { publicKey } = useWallet();
  const router = useRouter();
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 20;

  const treasuriesQuery = useOwnedTreasuries();
  const treasuries = treasuriesQuery.data ?? [];

  // Pagination
  const totalItems = treasuries.length;
  const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE);
  const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
  const endIndex = startIndex + ITEMS_PER_PAGE;
  const paginatedData = treasuries.slice(startIndex, endIndex);

  const columns: TableColumn<TreasuryEntry>[] = [
    {
      key: "agentId",
      header: "Agent ID",
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
      key: "totalTx",
      header: "Total Tx",
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
        <span className="text-[11px] text-(--text-muted)">
          {new Date(
            Number(item.account.createdAt.toString()) * 1000,
          ).toLocaleDateString("en-US", {
            month: "short",
            day: "numeric",
            year: "numeric",
          })}
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
            TREASURIES
          </span>
          <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-(--text-main) mb-2">
            My Treasuries
          </h1>
          <p className="text-(--text-muted) font-light max-w-xl">
            This directory is loaded from on-chain treasury accounts owned by
            the connected wallet.
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

      {/* Treasury Table */}
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
  );
}
