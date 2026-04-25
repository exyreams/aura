import { Archive, Wallet } from "lucide-react";
import type React from "react";
import { cn } from "@/lib/utils";
import { Button } from "./Button";
import { Skeleton } from "./Skeleton";

export interface TableColumn<T> {
  key: string;
  header: string;
  render?: (item: T) => React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}

export interface TableProps<T> {
  columns: TableColumn<T>[];
  data: T[];
  keyExtractor: (item: T) => string;
  onRowClick?: (item: T) => void;
  loading?: boolean;
  emptyState?: "no-wallet" | "empty" | "custom";
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: {
    label: string;
    onClick: () => void;
  };
  pagination?: {
    currentPage: number;
    totalPages: number;
    onPageChange: (page: number) => void;
    totalItems: number;
    itemsPerPage: number;
  };
  className?: string;
}

export function Table<T extends Record<string, unknown>>({
  columns,
  data,
  keyExtractor,
  onRowClick,
  loading = false,
  emptyState,
  emptyTitle,
  emptyDescription,
  emptyAction,
  pagination,
  className,
}: TableProps<T>) {
  // Loading State - Dynamic to match actual table structure
  if (loading) {
    return (
      <div className={cn("space-y-6", className)}>
        <div className="border border-border rounded-sm overflow-hidden bg-(--card-bg)">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-(--card-content)">
                <tr className="border-b border-border">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "px-6 py-4 mono text-[10px] uppercase tracking-[0.15em] text-(--text-muted) font-bold",
                        column.align === "center" && "text-center",
                        column.align === "right" && "text-right",
                        column.className,
                      )}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {Array.from(
                  { length: pagination?.itemsPerPage || 5 },
                  (_, i) => `skeleton-${i}`,
                ).map((skeletonId) => (
                  <tr key={skeletonId}>
                    {columns.map((column) => (
                      <td
                        key={`${skeletonId}-${column.key}`}
                        className={cn(
                          "px-6 py-4",
                          column.align === "center" && "text-center",
                          column.align === "right" && "text-right",
                        )}
                      >
                        <Skeleton
                          className={cn(
                            "h-5",
                            column.align === "center"
                              ? "w-24 mx-auto"
                              : column.align === "right"
                                ? "w-24 ml-auto"
                                : "w-40",
                          )}
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Empty States - Dynamic to match actual table structure
  if (data.length === 0) {
    const isNoWallet = emptyState === "no-wallet";
    const isEmpty = emptyState === "empty";
    const rowHeight = 57; // py-4 (16px top + 16px bottom) + content height (~25px)
    const itemsPerPage = pagination?.itemsPerPage || 10;
    const emptyHeight = rowHeight * itemsPerPage;

    return (
      <div className={cn("space-y-6", className)}>
        <div className="bg-(--card-bg) border border-border rounded-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead className="bg-(--card-content)">
                <tr className="border-b border-border">
                  {columns.map((column) => (
                    <th
                      key={column.key}
                      className={cn(
                        "px-6 py-4 mono text-[10px] uppercase tracking-[0.15em] text-(--text-muted) font-bold",
                        column.align === "center" && "text-center",
                        column.align === "right" && "text-right",
                        column.className,
                      )}
                    >
                      {column.header}
                    </th>
                  ))}
                </tr>
              </thead>
            </table>
          </div>
          <div
            className="flex items-center justify-center"
            style={{ height: `${emptyHeight}px` }}
          >
            <div className="text-center space-y-4 px-6">
              <div className="w-16 h-16 bg-(--card-content) rounded-full flex items-center justify-center mx-auto border border-border">
                {isNoWallet ? (
                  <Wallet className="text-(--text-muted) w-8 h-8" />
                ) : isEmpty ? (
                  <Archive className="text-(--text-muted) w-8 h-8" />
                ) : null}
              </div>
              <div>
                <h3 className="text-lg font-bold text-(--text-main) mb-2">
                  {isNoWallet
                    ? "Wallet not connected"
                    : isEmpty
                      ? "No treasuries found"
                      : emptyTitle || "No data"}
                </h3>
                <p className="text-(--text-muted) text-sm max-w-md mx-auto">
                  {isNoWallet
                    ? "Connect your wallet to view your treasuries."
                    : isEmpty
                      ? "You don't have any treasury accounts yet. Create your first treasury to get started."
                      : emptyDescription || "No data available"}
                </p>
              </div>
              {emptyAction && (
                <Button
                  variant="primary"
                  size="medium"
                  onClick={emptyAction.onClick}
                >
                  {emptyAction.label}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Table with Data
  return (
    <div className={cn("space-y-6", className)}>
      <div className="border border-border rounded-sm overflow-hidden bg-(--card-bg)">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead className="bg-(--card-content)">
              <tr className="border-b border-border">
                {columns.map((column) => (
                  <th
                    key={column.key}
                    className={cn(
                      "px-6 py-4 mono text-[10px] uppercase tracking-[0.15em] text-(--text-muted) font-bold",
                      column.align === "center" && "text-center",
                      column.align === "right" && "text-right",
                      column.className,
                    )}
                  >
                    {column.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((item) => (
                <tr
                  key={keyExtractor(item)}
                  onClick={() => onRowClick?.(item)}
                  className="transition-all hover:bg-(--hover-bg)"
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={cn(
                        "px-6 py-4",
                        column.align === "center" && "text-center",
                        column.align === "right" && "text-right",
                      )}
                    >
                      {column.render
                        ? column.render(item)
                        : (item[column.key] as React.ReactNode)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {pagination && (
        <div className="flex justify-between items-center text-[10px] mono text-(--text-muted)">
          <span>
            Showing {(pagination.currentPage - 1) * pagination.itemsPerPage + 1}
            -
            {Math.min(
              pagination.currentPage * pagination.itemsPerPage,
              pagination.totalItems,
            )}{" "}
            of {pagination.totalItems}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="small"
              onClick={() =>
                pagination.onPageChange(pagination.currentPage - 1)
              }
              disabled={pagination.currentPage === 1}
            >
              Prev
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={() =>
                pagination.onPageChange(pagination.currentPage + 1)
              }
              disabled={pagination.currentPage === pagination.totalPages}
            >
              Next
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
