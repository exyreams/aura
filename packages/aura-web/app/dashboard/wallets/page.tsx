"use client";

import { AlertTriangle, RefreshCw, Wallet } from "lucide-react";
import { Button } from "@/components/global/Button";
import { Skeleton } from "@/components/global/Skeleton";
import { WalletCard } from "@/components/wallets/WalletCard";
import { useWalletRegistry } from "@/lib/hooks/use-wallet-registry";

export default function WalletsPage() {
  const walletsQuery = useWalletRegistry();
  const wallets = walletsQuery.data ?? [];

  return (
    <div className="mx-auto w-full max-w-7xl">
      <div className="mb-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            Wallet controls
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">
            Registered agent wallets
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground">
            Wallet metadata comes from Supabase. Solana balances are read live
            from RPC so this page does not trust cached balance rows.
          </p>
        </div>
        <Button
          type="button"
          variant="secondary"
          onClick={() => void walletsQuery.refetch()}
          disabled={walletsQuery.isFetching}
        >
          <RefreshCw className="size-4" aria-hidden="true" />
          Refresh registry
        </Button>
      </div>

      {walletsQuery.isLoading ? (
        <div className="grid gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : walletsQuery.isError ? (
        <section className="rounded-lg border border-red-500/25 bg-red-500/10 p-5">
          <div className="flex items-start gap-3">
            <AlertTriangle
              className="mt-0.5 size-5 text-red-200"
              aria-hidden="true"
            />
            <div>
              <h2 className="font-semibold text-red-100">
                Could not load wallet registry
              </h2>
              <p className="mt-1 text-sm text-red-100/80">
                Check Supabase migrations, RLS policies, and the owner session.
              </p>
            </div>
          </div>
        </section>
      ) : wallets.length === 0 ? (
        <section className="rounded-lg border border-dashed border-border bg-surface p-8 text-center">
          <div className="mx-auto flex size-12 items-center justify-center rounded-md border border-border bg-surface-raised">
            <Wallet
              className="size-6 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <h2 className="mt-4 text-lg font-semibold">No wallets registered</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-muted-foreground">
            Once Conduit or the wallet sync flow records dWallet metadata, each
            wallet will appear here with its live Solana balances and deposit
            address.
          </p>
        </section>
      ) : (
        <div className="grid gap-4">
          {wallets.map((wallet) => (
            <WalletCard key={wallet.id} wallet={wallet} />
          ))}
        </div>
      )}
    </div>
  );
}
