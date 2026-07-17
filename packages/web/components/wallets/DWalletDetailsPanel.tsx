"use client";

import { Check, Copy, Download, ExternalLink, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/global/Button";
import type { WalletRegistryRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import {
  getDWalletDetailRows,
  getDWalletDetailsExport,
  getDWalletHasEncryptedSession,
} from "@/lib/wallets/dwallet-details";

function safeFilename(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9.-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "dwallet"
  );
}

function downloadJson(filename: string, value: unknown) {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

export function exportDWalletDetails(wallet: WalletRegistryRow) {
  downloadJson(
    `${safeFilename(wallet.label ?? wallet.chain_address)}.aura-dwallet.json`,
    getDWalletDetailsExport(wallet),
  );
}

export function DWalletDetailsPanel({
  wallet,
  className,
}: {
  wallet: WalletRegistryRow;
  className?: string;
}) {
  const details = useMemo(() => getDWalletDetailRows(wallet), [wallet]);
  const [copiedDetail, setCopiedDetail] = useState<string | null>(null);
  const hasEncryptedSession = getDWalletHasEncryptedSession(wallet);

  const copyDetail = async (label: string, value: string) => {
    await navigator.clipboard.writeText(value);
    setCopiedDetail(label);
    window.setTimeout(() => setCopiedDetail(null), 1500);
  };

  return (
    <div className={cn("grid gap-3", className)}>
      <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-sm border border-border bg-surface">
            <ShieldCheck
              className={cn(
                "size-4",
                hasEncryptedSession ? "text-success" : "text-muted-foreground",
              )}
              aria-hidden="true"
            />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-medium">Saved dWallet details</p>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              Export includes public registry metadata only. Encrypted session
              material stays server-side.
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="secondary"
          size="small"
          onClick={() => exportDWalletDetails(wallet)}
          className="shrink-0"
        >
          <Download className="size-3.5" aria-hidden="true" />
          Export JSON
        </Button>
      </div>

      {details.length > 0 ? (
        <div className="grid gap-2">
          {details.map((row) => (
            <div
              key={row.label}
              className="rounded-md border border-border bg-background p-3"
            >
              <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                {row.label}
              </p>
              <div className="mt-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 break-all font-mono text-xs text-foreground">
                  {row.value}
                </p>
                <button
                  type="button"
                  onClick={() => void copyDetail(row.label, row.value)}
                  className="flex size-10 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                  aria-label={`Copy ${row.label}`}
                >
                  {copiedDetail === row.label ? (
                    <Check className="size-3.5" aria-hidden="true" />
                  ) : (
                    <Copy className="size-3.5" aria-hidden="true" />
                  )}
                </button>
                {row.explorer ? (
                  <a
                    href={row.explorer}
                    target="_blank"
                    rel="noreferrer"
                    className="flex size-10 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
                    aria-label={`Open ${row.label} in explorer`}
                  >
                    <ExternalLink className="size-3.5" aria-hidden="true" />
                  </a>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
