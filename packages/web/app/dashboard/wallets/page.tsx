"use client";

import {
  ChevronRight,
  FileSignature,
  Plus,
  RefreshCw,
  Wallet,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  DashboardContent,
  DashboardEmptyState,
  DashboardErrorState,
  DashboardPanel,
  DashboardPanelHeader,
} from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { Skeleton } from "@/components/global/Skeleton";
import { StatusBadge } from "@/components/global/StatusBadge";
import { RegisterDWalletModal } from "@/components/wallets/RegisterDWalletModal";
import { WalletCard } from "@/components/wallets/WalletCard";
import { formatAddress } from "@/lib/formatting/addresses";
import { useSignRequests } from "@/lib/hooks";
import { useWalletRegistry } from "@/lib/hooks/use-wallet-registry";
import type {
  Json,
  SignRequestRow,
  WalletRegistryRow,
} from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import { getDWalletStatusModel } from "@/lib/wallets/dwallet-status";

function payloadText(payload: Json, key: string) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const transfer = payload.transfer;
  if (!transfer || typeof transfer !== "object" || Array.isArray(transfer)) {
    return null;
  }

  const value = transfer[key];
  return typeof value === "string" ? value : null;
}

function PendingRequestRow({ request }: { request: SignRequestRow }) {
  const symbol = payloadText(request.payload, "symbol") ?? "asset";
  const amount = payloadText(request.payload, "amount_ui") ?? "unknown";
  const recipient = payloadText(request.payload, "recipient_address");

  return (
    <div className="flex flex-col gap-3 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge
            tone={
              request.status === "pending"
                ? "warning"
                : request.status === "approved" || request.status === "consumed"
                  ? "success"
                  : "neutral"
            }
          >
            {request.status}
          </StatusBadge>
          <p className="font-mono text-xs text-muted-foreground">
            {new Date(request.created_at).toLocaleString()}
          </p>
        </div>
        <p className="mt-2 text-sm font-medium">
          {amount} {symbol}
        </p>
        <p className="mt-1 truncate font-mono text-xs text-muted-foreground">
          {recipient ? `to ${formatAddress(recipient)}` : request.message}
        </p>
      </div>
      <p className="shrink-0 font-mono text-[11px] text-muted-foreground">
        {formatAddress(request.id)}
      </p>
    </div>
  );
}

function WalletListItem({
  wallet,
  selected,
  onSelect,
}: {
  wallet: WalletRegistryRow;
  selected: boolean;
  onSelect: () => void;
}) {
  const statusModel = getDWalletStatusModel(wallet);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "flex min-h-24 w-full items-center gap-3 px-4 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
        selected
          ? "bg-background text-foreground"
          : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
      )}
    >
      <div className="flex size-10 shrink-0 items-center justify-center rounded-md border border-border bg-surface-raised">
        <Wallet className="size-4" aria-hidden="true" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-2">
          <p className="truncate text-sm font-semibold text-foreground">
            {wallet.label || `${wallet.chain_name} dWallet`}
          </p>
          <StatusBadge tone={statusModel.statusTone}>
            {statusModel.statusLabel}
          </StatusBadge>
        </div>
        <p className="mt-1 font-mono text-xs text-muted-foreground">
          {formatAddress(wallet.chain_address)}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
            {wallet.chain_name}
          </span>
          <span className="rounded border border-border px-1.5 py-0.5 font-mono text-[9px] uppercase text-muted-foreground">
            {statusModel.bindingLabel}
          </span>
        </div>
      </div>
      <ChevronRight
        className={cn(
          "size-4 shrink-0 transition-transform",
          selected && "translate-x-0.5 text-foreground",
        )}
        aria-hidden="true"
      />
    </button>
  );
}

export default function WalletsPage() {
  const walletsQuery = useWalletRegistry();
  const signRequestsQuery = useSignRequests();
  const [registerOpen, setRegisterOpen] = useState(false);
  const [selectedWalletId, setSelectedWalletId] = useState<string | null>(null);
  const wallets = walletsQuery.data ?? [];
  const signRequests = signRequestsQuery.data ?? [];
  const selectedWallet = useMemo(
    () => wallets.find((wallet) => wallet.id === selectedWalletId) ?? null,
    [selectedWalletId, wallets],
  );

  useEffect(() => {
    if (wallets.length === 0) {
      setSelectedWalletId(null);
      return;
    }

    if (
      !selectedWalletId ||
      !wallets.some((wallet) => wallet.id === selectedWalletId)
    ) {
      setSelectedWalletId(wallets[0]?.id ?? null);
    }
  }, [selectedWalletId, wallets]);

  return (
    <DashboardContent>
      <RegisterDWalletModal
        open={registerOpen}
        onClose={() => setRegisterOpen(false)}
      />

      <DashboardPanel>
        <DashboardPanelHeader
          eyebrow="Wallets"
          title="Agent custody wallets"
          description="Create or register dWallets for signer agents, fund them from any wallet, and monitor live Solana balances from RPC."
          action={
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <Button type="button" onClick={() => setRegisterOpen(true)}>
                <Plus className="size-4" aria-hidden="true" />
                Add wallet
              </Button>
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
          }
        />
      </DashboardPanel>

      {walletsQuery.isLoading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <DashboardPanel className="grid gap-3 p-4">
            <Skeleton className="h-12" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
            <Skeleton className="h-24" />
          </DashboardPanel>
          <Skeleton className="h-[32rem]" />
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
          description="Create an Ika dWallet for a signer agent, or register an existing dWallet you already control."
          action={
            <Button type="button" onClick={() => setRegisterOpen(true)}>
              <Plus className="size-4" aria-hidden="true" />
              Add wallet
            </Button>
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-[minmax(280px,360px)_minmax(0,1fr)]">
          <DashboardPanel className="overflow-hidden p-0">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Wallet registry</p>
                <p className="mt-1 font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
                  {wallets.length} {wallets.length === 1 ? "wallet" : "wallets"}
                </p>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="small"
                onClick={() => void walletsQuery.refetch()}
                disabled={walletsQuery.isFetching}
                aria-label="Refresh wallet registry"
              >
                <RefreshCw className="size-3.5" aria-hidden="true" />
                Refresh
              </Button>
            </div>
            <div className="divide-y divide-border" role="listbox">
              {wallets.map((wallet) => (
                <WalletListItem
                  key={wallet.id}
                  wallet={wallet}
                  selected={wallet.id === selectedWallet?.id}
                  onSelect={() => setSelectedWalletId(wallet.id)}
                />
              ))}
            </div>
          </DashboardPanel>
          <div className="min-w-0">
            {selectedWallet ? (
              <WalletCard wallet={selectedWallet} />
            ) : (
              <DashboardEmptyState
                icon={Wallet}
                title="Select a wallet"
                description="Choose a wallet from the registry to view balances, transfer requests, receive details, and on-chain binding state."
              />
            )}
          </div>
        </div>
      )}

      {signRequests.length > 0 ? (
        <DashboardPanel className="grid gap-4">
          <DashboardPanelHeader
            eyebrow="Signer queue"
            title="Pending wallet transfer requests"
            description="Wallet movement requests are recorded here for review, policy checks, and later execution by the signer runtime."
            action={
              <Button
                type="button"
                variant="secondary"
                onClick={() => void signRequestsQuery.refetch()}
                disabled={signRequestsQuery.isFetching}
              >
                <RefreshCw className="size-4" aria-hidden="true" />
                Refresh
              </Button>
            }
          />
          <div className="grid gap-2">
            {signRequests.slice(0, 5).map((request) => (
              <PendingRequestRow key={request.id} request={request} />
            ))}
          </div>
        </DashboardPanel>
      ) : walletsQuery.isLoading || signRequestsQuery.isLoading ? null : (
        <div className="flex items-start gap-3 rounded-lg border border-dashed border-border bg-background/40 p-4">
          <div className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border bg-surface">
            <FileSignature
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          </div>
          <div>
            <p className="text-sm font-medium">No transfer requests queued</p>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              dWallet and token transfers will appear here after you create a
              signer-agent request.
            </p>
          </div>
        </div>
      )}
    </DashboardContent>
  );
}
