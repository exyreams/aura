"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useState } from "react";
import { StatusPill } from "@/components/global/Badge";
import { Card } from "@/components/global/Card";
import { Skeleton } from "@/components/global/Skeleton";
import { useOwnedTreasuries, useRecentActivity } from "@/lib/hooks";
import { shortenAddress } from "@/lib/utils";

export default function ActivityLogPage() {
  const { publicKey } = useWallet();
  const [filter, setFilter] = useState<"all" | "proposals" | "audits">("all");

  const treasuriesQuery = useOwnedTreasuries();
  const treasuries = treasuriesQuery.data ?? [];
  const activityQuery = useRecentActivity(treasuries);
  const activity = activityQuery.data ?? [];

  // Filter activity
  const filteredActivity = activity.filter((item) => {
    if (filter === "proposals") return item.kind === "proposal";
    if (filter === "audits") return item.kind === "audit";
    return true;
  });

  return (
    <div className="relative z-10 max-w-[1600px] mx-auto">
      {/* Header */}
      <header className="mb-12">
        <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
          ACTIVITY LOG
        </span>
        <h1 className="text-3xl lg:text-4xl font-bold tracking-tight text-(--text-main) mb-2">
          Recent Activity
        </h1>
        <p className="text-(--text-muted) font-light max-w-xl">
          Parsed from recent program events emitted by treasury transactions.
        </p>
      </header>

      {/* Filter Tabs */}
      <div className="flex gap-2 mb-8">
        <button
          type="button"
          onClick={() => setFilter("all")}
          className={`mono text-[10px] uppercase tracking-widest px-4 py-2 rounded-sm transition-all ${
            filter === "all"
              ? "bg-(--hover-bg) text-(--text-main) border border-border"
              : "text-(--text-muted) hover:text-(--text-main)"
          }`}
        >
          All Events
        </button>
        <button
          type="button"
          onClick={() => setFilter("proposals")}
          className={`mono text-[10px] uppercase tracking-widest px-4 py-2 rounded-sm transition-all ${
            filter === "proposals"
              ? "bg-(--hover-bg) text-(--text-main) border border-border"
              : "text-(--text-muted) hover:text-(--text-main)"
          }`}
        >
          Proposals
        </button>
        <button
          type="button"
          onClick={() => setFilter("audits")}
          className={`mono text-[10px] uppercase tracking-widest px-4 py-2 rounded-sm transition-all ${
            filter === "audits"
              ? "bg-(--hover-bg) text-(--text-main) border border-border"
              : "text-(--text-muted) hover:text-(--text-main)"
          }`}
        >
          Audits
        </button>
      </div>

      {/* Activity List */}
      <Card>
        {activityQuery.isLoading ? (
          <div className="space-y-6">
            {Array.from({ length: 8 }, (_, i) => `skeleton-${i}`).map((key) => (
              <div
                key={key}
                className="space-y-3 pb-6 border-b border-border last:border-0"
              >
                <div className="flex justify-between items-start">
                  <Skeleton className="h-5 w-48" />
                  <Skeleton className="h-6 w-20" />
                </div>
                <Skeleton className="h-4 w-full" />
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-32" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            ))}
          </div>
        ) : !publicKey ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-(--card-content) rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
              <svg
                className="w-8 h-8 text-(--text-muted)"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                role="img"
                aria-label="Wallet icon"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-(--text-main) mb-2">
              Wallet not connected
            </h3>
            <p className="text-(--text-muted) text-sm">
              Connect your wallet to view activity logs.
            </p>
          </div>
        ) : filteredActivity.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-(--card-content) rounded-full flex items-center justify-center mx-auto mb-4 border border-border">
              <svg
                className="w-8 h-8 text-(--text-muted)"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                role="img"
                aria-label="Document icon"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-bold text-(--text-main) mb-2">
              No activity found
            </h3>
            <p className="text-(--text-muted) text-sm">
              No recent events found for the current wallet.
            </p>
          </div>
        ) : (
          <div className="space-y-0">
            {filteredActivity.map((item) => {
              const isProposal = item.kind === "proposal";
              const status = isProposal
                ? item.status === 3
                  ? "active"
                  : item.status === 4
                    ? "paused"
                    : "default"
                : "default";

              return (
                <div
                  key={`${item.signature}-${item.kind}-${item.detail ?? item.proposalId}`}
                  className="py-6 border-b border-border last:border-0 hover:bg-(--hover-bg) transition-colors px-4 -mx-4 rounded-sm"
                >
                  <div className="flex justify-between items-start mb-3">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 mb-2">
                        <span className="mono text-[11px] font-bold text-(--text-main) uppercase">
                          {isProposal
                            ? `Proposal #${item.proposalId ?? "?"}`
                            : item.detail?.toUpperCase() || "AUDIT EVENT"}
                        </span>
                        <StatusPill
                          variant={status}
                          className="text-[10px] px-2 py-0.5"
                        >
                          {status === "active"
                            ? "Approved"
                            : status === "paused"
                              ? "Denied"
                              : "Pending"}
                        </StatusPill>
                      </div>
                      <p className="text-sm text-(--text-muted) mb-2">
                        {isProposal && item.violation
                          ? `Policy Violation: ${item.violation}`
                          : item.detail || "Treasury event"}
                      </p>
                      <div className="flex items-center gap-4 mono text-[10px] text-(--text-muted)">
                        <span>
                          Treasury: {shortenAddress(item.treasury, 6, 6)}
                        </span>
                        <span>•</span>
                        <span>
                          {item.timestamp
                            ? new Date(item.timestamp * 1000).toLocaleString(
                                "en-US",
                                {
                                  month: "short",
                                  day: "numeric",
                                  year: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                },
                              )
                            : "Unknown time"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mono text-[10px] text-(--text-muted)">
                    Signature: {shortenAddress(item.signature, 8, 8)}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
