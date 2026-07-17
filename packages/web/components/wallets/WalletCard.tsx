"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Copy,
  ExternalLink,
  FileText,
  Link2,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Wallet,
} from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/global/Button";
import { Modal } from "@/components/global/Modal";
import { Skeleton } from "@/components/global/Skeleton";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useToast } from "@/components/global/Toast";
import { DWalletDetailsModal } from "@/components/wallets/DWalletDetailsModal";
import { WalletReceiveModal } from "@/components/wallets/WalletReceiveModal";
import { WalletTransferModal } from "@/components/wallets/WalletTransferModal";
import { SOLANA_CHAIN_ID } from "@/lib/aura/chains";
import { formatAddress } from "@/lib/formatting/addresses";
import { formatSol, formatTokenAmount } from "@/lib/formatting/amounts";
import { useAgents, useAppSettings, useSolanaWalletBalance } from "@/lib/hooks";
import {
  confirmAgentTreasuryLink,
  confirmDWalletRegistration,
  createAgentTreasuryOnChain,
  registerDWalletOnChain,
} from "@/lib/solana/dwallet-registration";
import type { WalletRegistryRow } from "@/lib/supabase/types";
import {
  metadataNestedString,
  metadataString,
  walletAddressExplorerUrl,
  walletTransactionExplorerUrl,
} from "@/lib/wallets/dwallet-details";

function statusTone(status: string) {
  if (status === "onchain_registered" || status === "ika_provisioned") {
    return "success" as const;
  }

  if (
    status === "metadata_registered" ||
    status === "agent_created_pending" ||
    status === "unknown"
  ) {
    return "warning" as const;
  }

  return "neutral" as const;
}

function statusLabel(status: string) {
  if (status === "agent_created_pending") {
    return "link from dashboard";
  }

  return status.replaceAll("_", " ");
}

async function deleteDWallet(walletId: string) {
  const response = await fetch(`/api/wallets/dwallets/${walletId}`, {
    method: "DELETE",
  });
  const payload = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Could not remove dWallet.");
  }

  return payload;
}

export function WalletCard({ wallet }: { wallet: WalletRegistryRow }) {
  const { connection } = useConnection();
  const ownerWallet = useWallet();
  const settings = useAppSettings();
  const { agents } = useAgents();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [receiveOpen, setReceiveOpen] = useState(false);
  const [removeOpen, setRemoveOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const supportsLiveBalance = wallet.chain_id === SOLANA_CHAIN_ID;
  const balanceQuery = useSolanaWalletBalance(
    wallet.chain_address,
    supportsLiveBalance,
  );
  const sessionMaterial = metadataString(wallet.metadata, "session_material");
  const createdVia = metadataString(wallet.metadata, "source");
  const provider = metadataString(wallet.metadata, "provider");
  const createdByAgent =
    metadataString(wallet.metadata, "created_via") === "conduit_agent";
  const authorizedUser = metadataNestedString(
    wallet.metadata,
    "dwallet",
    "authorized_user_pubkey",
  );
  const linkedAgent = wallet.agent_session_id
    ? (agents.find((agent) => agent.id === wallet.agent_session_id) ?? null)
    : null;
  const hasEncryptedSession = sessionMaterial === "encrypted_service_only";
  const isAuraBound = wallet.status === "onchain_registered";
  const hasRegistrationTx = Boolean(
    metadataString(wallet.metadata, "registration_tx_signature") ||
      metadataNestedString(wallet.metadata, "binding", "tx_signature"),
  );
  const canRemoveWallet =
    wallet.wallet_kind === "dwallet" &&
    wallet.status !== "onchain_registered" &&
    !hasRegistrationTx;
  const linkActionTitle = wallet.treasury_pda
    ? "Register this dWallet on the AURA treasury."
    : "Create the signer agent treasury, then register this dWallet.";
  const balanceError =
    balanceQuery.error instanceof Error ? balanceQuery.error.message : null;
  const linkMutation = useMutation({
    mutationFn: async () => {
      const ownerAddress = ownerWallet.publicKey?.toBase58();

      if (!ownerAddress) {
        throw new Error(
          "Connect the owner wallet before linking this dWallet.",
        );
      }

      let treasurySignature: string | null = null;
      let walletForRegistration = wallet;

      if (!walletForRegistration.treasury_pda) {
        if (!wallet.agent_session_id) {
          throw new Error(
            "This dWallet is not attached to a signer agent session.",
          );
        }

        const agent = agents.find(
          (candidate) => candidate.id === wallet.agent_session_id,
        );

        if (!agent) {
          throw new Error(
            "Could not find the signer agent for this dWallet. Refresh agents and try again.",
          );
        }

        const treasury = await createAgentTreasuryOnChain({
          connection,
          walletAdapter: ownerWallet,
          agent,
          programId: settings.resolvedProgramId,
        });

        if (!treasury.signature) {
          throw new Error(
            "This signer agent has a treasury, but this wallet registry row is stale. Refresh the page and try again.",
          );
        }

        await confirmAgentTreasuryLink({
          agentSessionId: agent.id,
          ownerAddress,
          treasuryPda: treasury.treasuryPda,
          signature: treasury.signature,
        });

        treasurySignature = treasury.signature;
        walletForRegistration = {
          ...walletForRegistration,
          treasury_pda: treasury.treasuryPda,
        };
      }

      const signature = await registerDWalletOnChain({
        connection,
        walletAdapter: ownerWallet,
        wallet: walletForRegistration,
        programId: settings.resolvedProgramId,
      });
      const updatedWallet = await confirmDWalletRegistration({
        walletId: wallet.id,
        ownerAddress,
        signature,
      });

      return { signature, treasurySignature, wallet: updatedWallet };
    },
    onSuccess: async ({ signature, treasurySignature }) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["agent-sessions"] }),
        queryClient.invalidateQueries({ queryKey: ["wallet-registry"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
      toast.success("dWallet linked on-chain", {
        description: treasurySignature
          ? "The owner wallet created the AURA treasury and registered the dWallet."
          : "The owner wallet signed the AURA registration transaction.",
        action: {
          label: "View transaction",
          href: walletTransactionExplorerUrl(signature),
        },
      });
    },
    onError: (error) => {
      toast.danger("Could not link dWallet", {
        description:
          error instanceof Error
            ? error.message
            : "The registration transaction could not be completed.",
      });
    },
  });
  const removeMutation = useMutation({
    mutationFn: () => deleteDWallet(wallet.id),
    onSuccess: async () => {
      setRemoveOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["wallet-registry"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
      toast.success("dWallet removed", {
        description: "The unregistered dWallet was removed from the dashboard.",
      });
    },
    onError: (error) => {
      toast.danger("Could not remove dWallet", {
        description:
          error instanceof Error
            ? error.message
            : "The dWallet record could not be removed.",
      });
    },
  });

  const copyAddress = async () => {
    await navigator.clipboard.writeText(wallet.chain_address);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  };

  return (
    <article className="rounded-lg border border-border bg-surface p-4">
      <WalletReceiveModal
        open={receiveOpen}
        wallet={wallet}
        onClose={() => setReceiveOpen(false)}
      />
      <DWalletDetailsModal
        open={detailsOpen}
        wallet={wallet}
        onClose={() => setDetailsOpen(false)}
      />
      <RemoveDWalletModal
        open={removeOpen}
        wallet={wallet}
        loading={removeMutation.isPending}
        onClose={() => setRemoveOpen(false)}
        onConfirm={() => removeMutation.mutate()}
      />
      <WalletTransferModal
        open={transferOpen}
        wallet={wallet}
        balance={balanceQuery.data ?? null}
        onClose={() => setTransferOpen(false)}
      />

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
                {formatAddress(wallet.chain_address)}
              </p>
            </div>
            <StatusBadge tone={statusTone(wallet.status)}>
              {statusLabel(wallet.status)}
            </StatusBadge>
            <StatusBadge tone={supportsLiveBalance ? "success" : "warning"}>
              {supportsLiveBalance ? "live balances" : "metadata only"}
            </StatusBadge>
            {hasEncryptedSession ? (
              <StatusBadge tone="success">encrypted session</StatusBadge>
            ) : null}
            <StatusBadge tone={isAuraBound ? "success" : "warning"}>
              {isAuraBound
                ? "on-chain registered"
                : wallet.treasury_pda
                  ? "on-chain pending"
                  : "treasury pending"}
            </StatusBadge>
          </div>

          <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                Funding address
              </dt>
              <dd className="mt-1 font-mono text-sm">
                {formatAddress(wallet.chain_address)}
              </dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                AURA treasury
              </dt>
              <dd className="mt-1 font-mono text-sm">
                {wallet.treasury_pda
                  ? formatAddress(wallet.treasury_pda)
                  : "Not bound"}
              </dd>
            </div>
            {wallet.agent_session_id ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Signer agent
                </dt>
                <dd className="mt-1 font-mono text-sm">
                  {linkedAgent
                    ? linkedAgent.label
                    : formatAddress(wallet.agent_session_id)}
                </dd>
              </div>
            ) : null}
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
            {authorizedUser ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Ika authority
                </dt>
                <dd className="mt-1 font-mono text-sm">
                  {formatAddress(authorizedUser)}
                </dd>
              </div>
            ) : null}
            {provider || createdVia ? (
              <div>
                <dt className="text-xs uppercase tracking-wide text-muted-foreground">
                  Source
                </dt>
                <dd className="mt-1 font-mono text-sm">
                  {[provider, createdVia].filter(Boolean).join(" / ")}
                </dd>
              </div>
            ) : null}
          </dl>
        </div>

        <div className="flex flex-wrap gap-2 lg:justify-end">
          <Button
            type="button"
            variant="secondary"
            onClick={() => setReceiveOpen(true)}
          >
            <Wallet className="size-4" aria-hidden="true" />
            Receive
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setDetailsOpen(true)}
          >
            <FileText className="size-4" aria-hidden="true" />
            Details
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setTransferOpen(true)}
            disabled={!supportsLiveBalance || balanceQuery.isLoading}
            title={
              supportsLiveBalance
                ? undefined
                : "Transfer requests for non-Solana chains need a chain-specific execution path."
            }
          >
            <Send className="size-4" aria-hidden="true" />
            Transfer
          </Button>
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
          {!isAuraBound ? (
            <Button
              type="button"
              variant="secondary"
              onClick={() => linkMutation.mutate()}
              loading={linkMutation.isPending}
              title={linkActionTitle}
            >
              <Link2 className="size-4" aria-hidden="true" />
              Link from dashboard
            </Button>
          ) : null}
          {supportsLiveBalance ? (
            <a
              href={walletAddressExplorerUrl(wallet.chain_address)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-10 items-center justify-center gap-2 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              Explorer
            </a>
          ) : null}
          {canRemoveWallet ? (
            <Button
              type="button"
              variant="danger"
              onClick={() => setRemoveOpen(true)}
              disabled={removeMutation.isPending}
            >
              <Trash2 className="size-4" aria-hidden="true" />
              Remove
            </Button>
          ) : null}
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="grid gap-1">
              <p className="text-sm text-danger">
                Could not load live balances from the configured Solana RPC.
              </p>
              {balanceError ? (
                <p className="text-xs text-muted-foreground">{balanceError}</p>
              ) : null}
            </div>
            <Button
              type="button"
              variant="secondary"
              size="small"
              onClick={() => void balanceQuery.refetch()}
            >
              <RefreshCw className="size-3.5" aria-hidden="true" />
              Retry
            </Button>
          </div>
        ) : balanceQuery.data ? (
          <div className="grid gap-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ShieldCheck
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Live balances
              </div>
              <p className="font-mono text-[11px] text-muted-foreground">
                Refreshed{" "}
                {new Date(balanceQuery.data.refreshedAt).toLocaleTimeString()}
              </p>
            </div>

            {balanceQuery.data.warnings.length > 0 ? (
              <div className="flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-warning">
                <AlertTriangle
                  className="mt-0.5 size-3.5 shrink-0"
                  aria-hidden="true"
                />
                <span>{balanceQuery.data.warnings[0]?.message}</span>
              </div>
            ) : null}

            <div className="overflow-hidden rounded-md border border-border bg-surface">
              <BalanceAssetRow
                logoURI={null}
                symbol="SOL"
                name="Solana"
                amount={formatSol(balanceQuery.data.native.amount)}
                detail={`${balanceQuery.data.native.lamports.toLocaleString("en-US")} lamports`}
              />
              {balanceQuery.data.tokens.length > 0 ? (
                balanceQuery.data.tokens.map((token) => (
                  <BalanceAssetRow
                    key={`${token.tokenProgram}:${token.tokenAccount}`}
                    logoURI={token.logoURI}
                    symbol={token.symbol}
                    name={token.name ?? token.symbol}
                    amount={`${formatTokenAmount(token.amount)} ${token.symbol}`}
                    detail={`${formatAddress(token.mint)} mint`}
                  />
                ))
              ) : (
                <div className="border-t border-border px-3 py-4">
                  <p className="mt-1 text-sm text-muted-foreground">
                    No funded token accounts found.
                  </p>
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>

      {!isAuraBound ? (
        <div className="mt-3 flex items-start gap-2 rounded-md border border-warning/30 bg-warning/10 px-3 py-2 text-sm text-warning">
          <Link2 className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          <span>
            {createdByAgent
              ? "This wallet was created by an agent runtime. Review the details, then link it from the dashboard with your owner wallet before agent execution can use it."
              : wallet.treasury_pda
                ? "This wallet is fundable now. Register it on-chain with the owner wallet before agent execution can use it."
                : "This wallet is fundable now, but its signer agent has no AURA treasury PDA yet. Link on-chain will create the treasury with your owner wallet, then register the dWallet."}
          </span>
        </div>
      ) : null}
    </article>
  );
}

function RemoveDWalletModal({
  open,
  wallet,
  loading,
  onClose,
  onConfirm,
}: {
  open: boolean;
  wallet: WalletRegistryRow;
  loading: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      ariaLabelledBy="remove-dwallet-title"
      ariaDescribedBy="remove-dwallet-description"
      className="sm:max-w-md"
    >
      <div className="grid gap-5 pt-2 pr-8">
        <div>
          <div className="flex items-start gap-3">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-sm border border-danger/30 bg-danger/10">
              <Trash2 className="size-4 text-danger" aria-hidden="true" />
            </div>
            <div>
              <h2 id="remove-dwallet-title" className="text-lg font-semibold">
                Remove dWallet
              </h2>
              <p
                id="remove-dwallet-description"
                className="mt-2 text-sm leading-6 text-muted-foreground"
              >
                This removes the unregistered dWallet from the dashboard and
                deletes its saved session record. It does not move funds or
                change anything on-chain.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-2 rounded-sm border border-border bg-background p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Wallet
            </span>
            <span className="truncate text-xs font-medium">
              {wallet.label || `${wallet.chain_name} dWallet`}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Address
            </span>
            <span className="truncate font-mono text-xs">
              {formatAddress(wallet.chain_address)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Status
            </span>
            <span className="truncate font-mono text-xs">
              {statusLabel(wallet.status)}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onClose}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="danger"
            onClick={onConfirm}
            loading={loading}
          >
            Remove
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function BalanceAssetRow({
  logoURI,
  symbol,
  name,
  amount,
  detail,
}: {
  logoURI: string | null;
  symbol: string;
  name: string;
  amount: string;
  detail: string;
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border px-3 py-3 first:border-t-0">
      <TokenAvatar logoURI={logoURI} symbol={symbol} />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="font-mono text-sm tabular-nums text-foreground">
            {amount}
          </p>
        </div>
        <p className="mt-1 truncate font-mono text-[11px] text-muted-foreground">
          {detail}
        </p>
      </div>
    </div>
  );
}

function TokenAvatar({
  logoURI,
  symbol,
}: {
  logoURI: string | null;
  symbol: string;
}) {
  const [failed, setFailed] = useState(false);
  const fallback = symbol.slice(0, 2).toUpperCase();

  return (
    <div className="flex size-8 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-background">
      {logoURI && !failed ? (
        // biome-ignore lint/performance/noImgElement: Token logos come from arbitrary metadata URLs, so next/image remote patterns are not practical here.
        <img
          src={logoURI}
          alt={`${symbol} logo`}
          className="size-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="font-mono text-[10px] text-muted-foreground">
          {fallback}
        </span>
      )}
    </div>
  );
}
