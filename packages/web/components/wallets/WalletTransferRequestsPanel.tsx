"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import bs58 from "bs58";
import {
  CheckCircle2,
  Clock,
  FileSignature,
  RefreshCw,
  ShieldCheck,
  XCircle,
} from "lucide-react";
import { useOwnerAuth } from "@/components/auth/OwnerAuthProvider";
import {
  DashboardEmptyState,
  DashboardPanel,
  DashboardPanelHeader,
} from "@/components/dashboard/DashboardPrimitives";
import { Button } from "@/components/global/Button";
import { Skeleton } from "@/components/global/Skeleton";
import { StatusBadge } from "@/components/global/StatusBadge";
import { useToast } from "@/components/global/Toast";
import { Tooltip } from "@/components/global/Tooltip";
import { formatAddress } from "@/lib/formatting/addresses";
import { useAgents } from "@/lib/hooks";
import type { SignRequestRow, WalletRegistryRow } from "@/lib/supabase/types";
import { cn } from "@/lib/utils";
import {
  buildWalletTransferReviewMessage,
  canApproveTransferRequest,
  canRejectTransferRequest,
  canRevokeTransferRequest,
  getTransferRequestDisplayStatus,
  getTransferRequestStatusTone,
  getTransferRequestSummary,
} from "@/lib/wallets/transfer-requests";

type ReviewAction = "approve" | "reject" | "revoke";

interface ReviewTransferRequestVariables {
  request: SignRequestRow;
  action: ReviewAction;
}

interface ReviewTransferRequestResponse {
  signRequest: SignRequestRow;
  error?: string;
}

async function readJson<T>(response: Response) {
  const payload = (await response.json()) as T & { error?: string };

  if (!response.ok) {
    throw new Error(payload.error ?? "Request failed.");
  }

  return payload;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "None";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(request: SignRequestRow) {
  const status = getTransferRequestDisplayStatus(request);

  if (status === "approved") {
    return "approved for runtime";
  }

  if (status === "consumed") {
    return "consumed by runtime";
  }

  return status;
}

function policyStatusTone(status: string | null) {
  if (status === "blocked") {
    return "danger" as const;
  }
  if (
    status === "flagged" ||
    status === "not_configured" ||
    status === "onchain_review" ||
    status === "treasury_missing" ||
    status === "policy_unavailable"
  ) {
    return "warning" as const;
  }
  if (status === "passed") {
    return "success" as const;
  }
  return "neutral" as const;
}

function formatPolicyStatus(status: string | null) {
  if (!status) {
    return "unknown";
  }

  if (status === "onchain_review") {
    return "on-chain review";
  }

  return status.replaceAll("_", " ");
}

function SourceLine({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className={cn("min-w-0 truncate text-right", mono && "font-mono")}>
        {value}
      </span>
    </div>
  );
}

function EmptyRequests() {
  return (
    <div className="rounded-lg border border-dashed border-border bg-background/40">
      <DashboardEmptyState
        icon={FileSignature}
        title="No transfer requests queued"
        description="dWallet and token transfer requests will appear here after an owner or agent runtime creates one."
      />
    </div>
  );
}

export function WalletTransferRequestsPanel({
  requests,
  wallets,
  isLoading,
  isFetching,
  onRefresh,
}: {
  requests: SignRequestRow[];
  wallets: WalletRegistryRow[];
  isLoading: boolean;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const auth = useOwnerAuth();
  const wallet = useWallet();
  const { agents } = useAgents();
  const queryClient = useQueryClient();
  const toast = useToast();
  const connectedWalletAddress = wallet.publicKey?.toBase58() ?? null;
  const primaryWalletAddress = auth.primaryWallet?.wallet_address ?? null;
  const canSignWithPrimary =
    Boolean(primaryWalletAddress) &&
    connectedWalletAddress === primaryWalletAddress &&
    Boolean(wallet.signMessage);
  const reviewMutation = useMutation({
    mutationFn: async ({ request, action }: ReviewTransferRequestVariables) => {
      if (action === "approve") {
        if (!auth.user?.id) {
          throw new Error("Sign in before approving transfer requests.");
        }

        if (!primaryWalletAddress) {
          throw new Error(
            "Set up a primary owner wallet before approving transfer requests.",
          );
        }

        if (!connectedWalletAddress) {
          throw new Error("Connect the primary owner wallet before approving.");
        }

        if (connectedWalletAddress !== primaryWalletAddress) {
          throw new Error(
            "Switch to the primary owner wallet before approving.",
          );
        }

        if (!wallet.signMessage) {
          throw new Error(
            "The connected wallet cannot sign transfer approval messages.",
          );
        }

        const message = buildWalletTransferReviewMessage({
          origin: window.location.origin,
          userId: auth.user.id,
          email: auth.user.email ?? auth.profile?.email ?? null,
          walletAddress: connectedWalletAddress,
          action: "approve",
          request,
        });
        const signatureBytes = await wallet.signMessage(
          new TextEncoder().encode(message),
        );
        const signature = bs58.encode(signatureBytes);

        return readJson<ReviewTransferRequestResponse>(
          await fetch(`/api/wallets/transfer-requests/${request.id}`, {
            method: "PATCH",
            credentials: "same-origin",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action,
              walletAddress: connectedWalletAddress,
              signature,
            }),
          }),
        );
      }

      return readJson<ReviewTransferRequestResponse>(
        await fetch(`/api/wallets/transfer-requests/${request.id}`, {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action }),
        }),
      );
    },
    onSuccess: async (_payload, variables) => {
      toast.success(
        variables.action === "approve"
          ? "Transfer request approved"
          : variables.action === "revoke"
            ? "Transfer approval revoked"
            : "Transfer request rejected",
        {
          description:
            variables.action === "approve"
              ? "The signer runtime can now pick up this approved request."
              : "The signer runtime will not execute this request.",
        },
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["sign-requests"] }),
        queryClient.invalidateQueries({ queryKey: ["activity-events"] }),
      ]);
    },
    onError: (cause) => {
      toast.danger("Could not update transfer request", {
        description:
          cause instanceof Error ? cause.message : "Try again in a moment.",
      });
    },
  });

  const pendingAction =
    reviewMutation.isPending && reviewMutation.variables
      ? `${reviewMutation.variables.request.id}:${reviewMutation.variables.action}`
      : null;

  return (
    <DashboardPanel className="grid gap-4">
      <DashboardPanelHeader
        eyebrow="Signer queue"
        title="Transfer review"
        description="Review transfer requests before a signer runtime can act. Approval signs an owner-wallet message; it does not submit an on-chain transaction."
        action={
          <Button
            type="button"
            variant="secondary"
            onClick={onRefresh}
            disabled={isFetching}
          >
            <RefreshCw className="size-4" aria-hidden="true" />
            Refresh
          </Button>
        }
      />

      {isLoading ? (
        <div className="grid gap-3">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
      ) : requests.length === 0 ? (
        <EmptyRequests />
      ) : (
        <div className="overflow-hidden rounded-md border border-border bg-background">
          <div className="divide-y divide-border">
            {requests.map((request) => {
              const summary = getTransferRequestSummary(request);
              const knownWallet = summary.walletId
                ? (wallets.find(
                    (candidate) => candidate.id === summary.walletId,
                  ) ?? null)
                : null;
              const knownAgent = summary.agentSessionId
                ? (agents.find(
                    (candidate) => candidate.id === summary.agentSessionId,
                  ) ?? null)
                : null;
              const amount = `${summary.amountUi ?? "Unknown"} ${
                summary.assetSymbol ?? "asset"
              }`;
              const recipient = summary.recipientAddress
                ? formatAddress(summary.recipientAddress)
                : "Unknown recipient";
              const canApprove = canApproveTransferRequest(request);
              const canReject = canRejectTransferRequest(request);
              const canRevoke = canRevokeTransferRequest(request);
              const approveDisabled = !canApprove || !canSignWithPrimary;
              const approveTitle = !canApprove
                ? "Only pending, unexpired transfer requests can be approved."
                : !primaryWalletAddress
                  ? "Set up a primary owner wallet before approving."
                  : !connectedWalletAddress
                    ? "Connect the primary owner wallet before approving."
                    : connectedWalletAddress !== primaryWalletAddress
                      ? "Switch to the primary owner wallet before approving."
                      : !wallet.signMessage
                        ? "The connected wallet cannot sign messages."
                        : "Approve with the primary owner wallet.";

              return (
                <article key={request.id} className="grid gap-4 p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge
                          tone={getTransferRequestStatusTone(request)}
                        >
                          {statusLabel(request)}
                        </StatusBadge>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {formatAddress(request.id)}
                        </span>
                      </div>
                      <h3 className="mt-3 text-base font-semibold">{amount}</h3>
                      <p className="mt-1 truncate font-mono text-sm text-muted-foreground">
                        to {recipient}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2 lg:justify-end">
                      <Tooltip content={approveTitle}>
                        <span>
                          <Button
                            type="button"
                            size="small"
                            onClick={() =>
                              reviewMutation.mutate({
                                request,
                                action: "approve",
                              })
                            }
                            disabled={approveDisabled}
                            loading={pendingAction === `${request.id}:approve`}
                          >
                            <CheckCircle2 className="size-3.5" aria-hidden />
                            Approve
                          </Button>
                        </span>
                      </Tooltip>
                      {canReject ? (
                        <Button
                          type="button"
                          size="small"
                          variant="secondary"
                          onClick={() =>
                            reviewMutation.mutate({
                              request,
                              action: "reject",
                            })
                          }
                          disabled={reviewMutation.isPending}
                          loading={pendingAction === `${request.id}:reject`}
                        >
                          <XCircle className="size-3.5" aria-hidden />
                          Reject
                        </Button>
                      ) : null}
                      {canRevoke ? (
                        <Button
                          type="button"
                          size="small"
                          variant="danger"
                          onClick={() =>
                            reviewMutation.mutate({
                              request,
                              action: "revoke",
                            })
                          }
                          disabled={reviewMutation.isPending}
                          loading={pendingAction === `${request.id}:revoke`}
                        >
                          <XCircle className="size-3.5" aria-hidden />
                          Revoke
                        </Button>
                      ) : null}
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                    <div className="grid gap-2 rounded-md border border-border bg-surface px-3 py-2">
                      <SourceLine
                        label="Wallet"
                        value={
                          knownWallet?.label ??
                          summary.walletLabel ??
                          summary.walletChain ??
                          "Unknown"
                        }
                      />
                      <SourceLine
                        label="Address"
                        value={
                          summary.walletAddress
                            ? formatAddress(summary.walletAddress)
                            : "Unknown"
                        }
                        mono
                      />
                    </div>
                    <div className="grid gap-2 rounded-md border border-border bg-surface px-3 py-2">
                      <SourceLine
                        label="Agent"
                        value={
                          knownAgent?.label ??
                          summary.agentLabel ??
                          summary.agentId ??
                          "Unknown"
                        }
                      />
                      <SourceLine
                        label="Grant"
                        value={
                          summary.permissionScopes.length > 0
                            ? summary.permissionScopes.join(", ")
                            : "No grant recorded"
                        }
                      />
                    </div>
                    <div className="grid gap-2 rounded-md border border-border bg-surface px-3 py-2">
                      <SourceLine
                        label="Created"
                        value={formatDateTime(request.created_at)}
                      />
                      <SourceLine
                        label="Expires"
                        value={formatDateTime(request.expires_at)}
                      />
                    </div>
                    <div className="grid gap-2 rounded-md border border-border bg-surface px-3 py-2">
                      <div className="flex items-center justify-between gap-3 text-xs">
                        <span className="text-muted-foreground">Policy</span>
                        <StatusBadge
                          tone={policyStatusTone(summary.policyStatus)}
                          className="px-1.5 py-0.5 text-[9px]"
                        >
                          {formatPolicyStatus(summary.policyStatus)}
                        </StatusBadge>
                      </div>
                      <SourceLine
                        label="Matched"
                        value={
                          summary.policyMatchedCount == null
                            ? "Unknown"
                            : String(summary.policyMatchedCount)
                        }
                      />
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                    <ShieldCheck className="size-3.5" aria-hidden />
                    <span>
                      Source: {summary.sourceKind ?? "unknown"}; approval is
                      owner-reviewed and runtime-executed.
                    </span>
                    {request.status === "approved" ? (
                      <>
                        <Clock className="size-3.5" aria-hidden />
                        <span>Waiting for signer runtime pickup.</span>
                      </>
                    ) : null}
                    {summary.policyReasons[0] ? (
                      <>
                        <ShieldCheck className="size-3.5" aria-hidden />
                        <span>{summary.policyReasons[0]}</span>
                      </>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      )}
    </DashboardPanel>
  );
}
