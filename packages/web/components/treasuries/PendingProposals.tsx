"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import {
  CHAINS,
  getActivePendingProposal,
  PROPOSAL_STATUSES,
  sendWalletInstructions,
  TX_TYPES,
} from "@/lib/aura-app";
import { backendRequest, postBackend } from "@/lib/backend-client";
import type { TreasuryEntry } from "@/lib/hooks";
import { useAgents, useAppSettings, useAuraClient } from "@/lib/hooks";
import { formatCurrency, shortenAddress } from "@/lib/utils";

interface PendingProposalsProps {
  treasury: TreasuryEntry;
  pda: string;
}

type PendingSignatureRequest = {
  signatureRequest?: {
    messageApprovalAccount?: { toString(): string } | null;
  } | null;
};

function messageApprovalFromPending(pending: unknown) {
  return (
    (
      pending as PendingSignatureRequest | null
    )?.signatureRequest?.messageApprovalAccount?.toString() ?? ""
  );
}

export const PendingProposals = ({ treasury, pda }: PendingProposalsProps) => {
  const pending = getActivePendingProposal(treasury.account);
  const hasPending = pending && Number(pending.proposalId.toString()) > 0;
  const wallet = useWallet();
  const { connection } = useConnection();
  const settings = useAppSettings();
  const { selectedAgent } = useAgents();
  const client = useAuraClient();
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
    await queryClient.invalidateQueries({ queryKey: ["treasuries"] });
    await queryClient.invalidateQueries({ queryKey: ["recent-activity"] });
  };

  const messageApprovalAddress = messageApprovalFromPending(pending);

  const messageApprovalStatusQuery = useQuery({
    queryKey: [
      "message-approval-status",
      messageApprovalAddress,
      settings.backendUrl,
      settings.endpoint,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        messageApproval: messageApprovalAddress,
      });
      if (settings.endpoint) params.set("rpcUrl", settings.endpoint);
      return backendRequest<{
        messageApproval: string;
        state: "missing" | "pending" | "signed";
      }>(settings.backendUrl, `/v1/execution/status?${params.toString()}`, {
        method: "GET",
      });
    },
    enabled:
      Boolean(messageApprovalAddress) &&
      Boolean(hasPending) &&
      pending?.status === 2,
    refetchInterval: (query) => {
      const d = query.state.data as { state?: string } | undefined;
      return d?.state === "signed" ? false : 10_000;
    },
    refetchIntervalInBackground: false,
  });

  const ikaState = messageApprovalStatusQuery.data?.state;

  // status codes: 0=Proposed, 1=DecryptionRequested, 2=AwaitingSignature, 3=Executed, 4=Denied, 5=Cancelled, 6=Expired
  const canExecute = hasPending && pending.status === 0;
  const canFinalize =
    hasPending && Boolean(messageApprovalAddress) && ikaState === "signed";
  // Can cancel any non-terminal proposal
  const canCancel = hasPending && pending.status <= 2;

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId) {
        throw new Error(
          "Create and select an agent before executing proposals.",
        );
      }
      return postBackend<{
        signature: string;
        approved: boolean;
        messageApproval?: string;
      }>(settings.backendUrl, "/v1/execution/execute", {
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
        agentId: selectedAgent.agentId,
        treasury: pda,
        wait: false,
        waitSigned: false,
      });
    },
    onSuccess: invalidate,
  });

  const finalizeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId) {
        throw new Error(
          "Create and select an agent before finalizing proposals.",
        );
      }
      return postBackend<{ signature: string; totalTransactions: string }>(
        settings.backendUrl,
        "/v1/execution/finalize",
        {
          rpcUrl: settings.endpoint,
          programId: settings.programId || undefined,
          agentId: selectedAgent.agentId,
          treasury: pda,
          messageApproval: messageApprovalFromPending(pending) || undefined,
        },
      );
    },
    onSuccess: invalidate,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey) throw new Error("Connect a wallet first.");
      const instruction = await client.cancelPendingInstruction(
        { owner: wallet.publicKey, treasury: treasury.publicKey },
        Math.floor(Date.now() / 1000),
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: invalidate,
  });

  if (!hasPending) {
    return (
      <div>
        <div className="mb-6 pb-4 border-b border-border">
          <div className="flex items-center gap-3 mb-2">
            <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted)">
              Queue
            </span>
            <span className="px-2 py-0.5 bg-(--card-bg) border border-border rounded-sm text-[10px] font-mono text-(--text-muted)">
              0 PENDING
            </span>
          </div>
          <h2 className="text-xl font-bold text-(--text-main) mb-1">
            Pending Proposals
          </h2>
          <p className="text-[12px] text-(--text-muted)">
            Transactions awaiting execution.
          </p>
        </div>
        <div className="p-8 text-center border border-dashed border-border rounded-sm">
          <p className="text-sm text-(--text-muted)">No pending proposals</p>
          <Link
            href={`/dashboard/treasuries/${pda}/propose`}
            className="inline-flex mt-4 text-[10px] font-mono uppercase tracking-wider text-(--text-main) hover:text-primary transition-colors"
          >
            Create Proposal
          </Link>
        </div>
      </div>
    );
  }

  const chain =
    CHAINS.find((c) => c.code === pending.targetChain)?.label || "Unknown";
  const txType =
    TX_TYPES.find((t) => t.code === pending.txType)?.label || "Unknown";
  const status = PROPOSAL_STATUSES[pending.status] || "Unknown";
  // Amount is stored in cents — divide by 100 for display
  const amountUsd = Number(pending.amountUsd.toString()) / 100;

  const statusVariant =
    pending.status === 3
      ? ("active" as const)
      : pending.status === 4 || pending.status === 5 || pending.status === 6
        ? ("error" as const)
        : ("medium" as const);

  const mutationError =
    executeMutation.error instanceof Error
      ? executeMutation.error.message
      : finalizeMutation.error instanceof Error
        ? finalizeMutation.error.message
        : cancelMutation.error instanceof Error
          ? cancelMutation.error.message
          : null;

  return (
    <div>
      <div className="mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted)">
            Queue
          </span>
          <span className="px-2 py-0.5 bg-(--warning-bg) border border-(--warning-border) rounded-sm text-[10px] font-mono text-(--warning-text)">
            1 ACTIVE
          </span>
        </div>
        <h2 className="text-xl font-bold text-(--text-main) mb-1">
          Pending Proposals
        </h2>
        <p className="text-[12px] text-(--text-muted)">
          Transactions awaiting execution.
        </p>
      </div>

      <div className="border border-border rounded-sm overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="bg-(--card-content) border-b border-border">
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Proposal ID
              </th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Type
              </th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Chain
              </th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Amount
              </th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Recipient
              </th>
              <th className="text-left px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Status
              </th>
              <th className="text-right px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border hover:bg-(--hover-bg) transition-colors">
              <td className="px-4 py-4 font-mono text-sm text-(--text-main)">
                PROP-{pending.proposalId.toString().padStart(4, "0")}
              </td>
              <td className="px-4 py-4 font-mono text-sm text-(--text-main)">
                {txType}
              </td>
              <td className="px-4 py-4 font-mono text-sm text-(--text-main)">
                {chain}
              </td>
              <td className="px-4 py-4 font-mono text-sm text-(--text-main)">
                {formatCurrency(amountUsd)}
              </td>
              <td className="px-4 py-4 font-mono text-sm text-(--text-muted)">
                {shortenAddress(pending.recipientOrContract, 6, 4)}
              </td>
              <td className="px-4 py-4">
                <div className="flex flex-col gap-1.5">
                  <StatusPill
                    variant={statusVariant}
                    className="text-[10px] px-3 py-1"
                  >
                    {status.toUpperCase()}
                  </StatusPill>
                  {messageApprovalAddress && pending?.status === 2 && (
                    <StatusPill
                      variant={
                        ikaState === "signed"
                          ? "active"
                          : ikaState === "pending"
                            ? "paused"
                            : "default"
                      }
                      className="text-[9px] px-2 py-0.5"
                    >
                      IKA: {ikaState ?? "..."}
                    </StatusPill>
                  )}
                </div>
              </td>
              <td className="px-4 py-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  <Button
                    variant="primary"
                    size="small"
                    loading={executeMutation.isPending}
                    disabled={
                      !canExecute || executeMutation.isPending || !selectedAgent
                    }
                    onClick={() => executeMutation.mutate()}
                  >
                    Execute
                  </Button>
                  <Button
                    variant="secondary"
                    size="small"
                    loading={finalizeMutation.isPending}
                    disabled={
                      !canFinalize ||
                      finalizeMutation.isPending ||
                      !selectedAgent
                    }
                    onClick={() => finalizeMutation.mutate()}
                  >
                    Finalize
                  </Button>
                  <Button
                    variant="danger"
                    size="small"
                    loading={cancelMutation.isPending}
                    disabled={!canCancel || cancelMutation.isPending}
                    onClick={() => cancelMutation.mutate()}
                  >
                    Cancel
                  </Button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Lifecycle step hint */}
      <div className="mt-4 px-4 py-3 bg-(--card-content) border border-border rounded-sm">
        <p className="text-[11px] font-mono text-(--text-muted)">
          {pending.status === 0 &&
            "Step 1 of 2 — Click Execute to send the approve_message CPI to the dWallet. Requires the backend service running at " +
              settings.backendUrl}
          {pending.status === 1 &&
            "Decryption in progress — waiting for Ika Encrypt network."}
          {pending.status === 2 &&
            "Step 2 of 2 — dWallet has signed. Click Finalize to verify the signature and close the proposal."}
          {pending.status === 3 &&
            "✓ Executed — proposal completed successfully."}
          {pending.status === 4 &&
            "✗ Denied — policy engine rejected this proposal."}
          {pending.status === 5 && "Cancelled by owner."}
          {pending.status === 6 && "Expired — TTL elapsed before execution."}
        </p>
      </div>

      {mutationError && (
        <div className="mt-3 px-4 py-3 bg-(--danger-bg) border border-(--danger-border) rounded-sm text-sm text-(--danger-text)">
          {mutationError}
        </div>
      )}
    </div>
  );
};
