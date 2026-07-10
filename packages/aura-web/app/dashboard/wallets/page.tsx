"use client";

import { RefreshCw, Wallet } from "lucide-react";
import {
  DashboardContent,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardPanel,
  DashboardPanelHeader,
} from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { Skeleton } from "@/components/global/Skeleton";
import { WalletCard } from "@/components/wallets/WalletCard";
import { useWalletRegistry } from "@/lib/hooks/use-wallet-registry";

export default function WalletsPage() {
  const walletsQuery = useWalletRegistry();
  const wallets = walletsQuery.data ?? [];

  return (
    <DashboardContent>
      <DashboardPanel>
        <DashboardPanelHeader
          eyebrow="Wallet controls"
          title="Registered custody endpoints"
          description="Wallet metadata comes from Supabase. Solana balances are read live from RPC so this page does not trust cached balance rows."
          action={
            <Button
              type="button"
              variant="secondary"
              onClick={() => void walletsQuery.refetch()}
              disabled={walletsQuery.isFetching}
            >
              <RefreshCw className="size-4" aria-hidden="true" />
              Refresh registry
            </Button>
          }
        />
      </DashboardPanel>

      {walletsQuery.isLoading ? (
        <div className="grid gap-4">
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : walletsQuery.isError ? (
        <DashboardErrorState
          title="Could not load wallet registry"
          description="Check Supabase migrations, RLS policies, and the owner session."
          onRetry={() => void walletsQuery.refetch()}
        />
      ) : wallets.length === 0 ? (
        <DashboardEmptyState
          icon={Wallet}
          title="No wallets registered"
          description="Once Conduit or the wallet sync flow records dWallet metadata, each wallet will appear here with live Solana balances and deposit addresses."
        />
      ) : (
        <div className="grid gap-4">
          {wallets.map((wallet) => (
            <WalletCard key={wallet.id} wallet={wallet} />
          ))}
        </div>
      )}
    </DashboardContent>
  );
}
