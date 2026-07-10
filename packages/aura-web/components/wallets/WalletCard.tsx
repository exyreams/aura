"use client";

import { Copy, ExternalLink, RefreshCw, Send, Wallet } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/global/Button";
import { Skeleton } from "@/components/global/Skeleton";
import { StatusBadge } from "@/components/global/StatusBadge";
import { SOLANA_CHAIN_ID } from "@/lib/aura/chains";
import { formatAddress } from "@/lib/formatting/addresses";
import { formatSol, formatTokenAmount } from "@/lib/formatting/amounts";
import { useSolanaWalletBalance } from "@/lib/hooks/use-solana-wallet-balance";
import type { WalletRegistryRow } from "@/lib/supabase/types";

function explorerUrl(address: string) {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

export function WalletCard({ wallet }: { wallet: WalletRegistryRow }) {
  const [copied, setCopied] = useState(false);
  const supportsLiveBalance = wallet.chain_id === SOLANA_CHAIN_ID;
  const balanceQuery = useSolanaWalletBalance(
    wallet.chain_address,
    supportsLiveBalance,
  );

  const copyAddress = async () => {
    await navigator.clipboard.writeText(wallet.chain_address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-md border border-border bg-surface-raised">
              <Wallet
                className="size-4 text-muted-foreground"
                aria-hidden="true"
              />
            </div>
            <div>
              <h2 className="text-base font-semibold">
                {wallet.label || `${wallet.chain_name} dWallet`}
              </h2>
              <p className="font-mono text-xs text-muted-foreground">
                {wallet.wallet_kind} / {wallet.status}
              </p>
            </div>
            <StatusBadge tone={supportsLiveBalance ? "success" : "warning"}>
              {supportsLiveBalance ? "live rpc" : "metadata only"}
            </StatusBadge>
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Address
              </dt>
              <dd className="mt-1 font-mono text-sm">
                {formatAddress(wallet.chain_address)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Treasury
              </dt>
              <dd className="mt-1 font-mono text-sm">
                {formatAddress(wallet.treasury_pda)}
              </dd>
            </div>
            {wallet.dwallet_id ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  dWallet ID
                </dt>
                <dd className="mt-1 font-mono text-sm">
                  {formatAddress(wallet.dwallet_id)}
                </dd>
              </div>
            ) : null}
            {wallet.dwallet_state_pda ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  State PDA
                </dt>
                <dd className="mt-1 font-mono text-sm">
                  {formatAddress(wallet.dwallet_state_pda)}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button type="button" variant="secondary" onClick={copyAddress}>
            <Copy className="size-4" aria-hidden="true" />
            {copied ? "Copied" : "Copy"}
          </Button>
          {supportsLiveBalance ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => void balanceQuery.refetch()}
              disabled={balanceQuery.isFetching}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh
            </Button>
          ) : null}
          {supportsLiveBalance ? (
            <a
              href={explorerUrl(wallet.chain_address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Explorer
            </a>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            disabled={true}
            title="Real dWallet movement will be enabled after the proposal/signing path is wired."
          >
            <Send className="size-4" aria-hidden="true" />
            Move funds
          </Button>
        </div>
      </div>

      <div className="mt-5 rounded-md border border-border bg-background p-4">
        {!supportsLiveBalance ? (
          <p className="text-sm text-muted-foreground">
            Live balance reads for {wallet.chain_name} need a chain indexer.
            Metadata is still tracked so agent-created wallets are visible.
          </p>
        ) : balanceQuery.isLoading ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : balanceQuery.isError ? (
          <p className="text-sm text-danger">
            Could not load live balances. Check the address and RPC endpoint.
          </p>
        ) : balanceQuery.data ? (
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-md border border-border bg-surface p-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Native
              </p>
              <p className="mt-1 font-mono text-lg">
                {formatSol(balanceQuery.data.native.amount)}
              </p>
            </div>
            {balanceQuery.data.tokens.length > 0 ? (
              balanceQuery.data.tokens.slice(0, 5).map((token) => (
                <div
                  key={`${token.tokenProgram}:${token.tokenAccount}`}
                  className="rounded-md border border-border bg-surface p-3"
                >
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">
                    {token.symbol}
                  </p>
                  <p className="mt-1 font-mono text-lg">
                    {formatTokenAmount(token.amount)}
                  </p>
                  <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                    {formatAddress(token.mint)}
                  </p>
                </div>
              ))
            ) : (
              <div className="rounded-md border border-dashed border-border bg-surface p-3">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  Tokens
                </p>
                <p className="mt-1 text-sm text-muted-foreground">
                  No funded token accounts found.
                </p>
              </div>
            )}
          </div>
        ) : null}
      </div>
    </article>
  );
}
