"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Alert } from "@/components/global/Alert";
import { StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Tooltip } from "@/components/global/Tooltip";
import { Copy, Lock, SquareArrowOutUpRight } from "@/components/icons";
import { ConfidentialLifecycleModal } from "@/components/treasuries/ConfidentialLifecycleModal";
import { ProposalLifecycleModal } from "@/components/treasuries/ProposalLifecycleModal";
import {
  CHAINS,
  getActivePendingProposal,
  PROPOSAL_STATUSES,
  sendWalletInstructions,
  TX_TYPES,
} from "@/lib/aura-app";
import { backendRequest, postBackend } from "@/lib/backend-client";
import { sanitizeError } from "@/lib/error-sanitizer";
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

const STATUS_PROPOSED = 0;
const STATUS_SIGNATURE_PENDING = 2;
const STATUS_EXECUTED = 3;
const STATUS_DENIED = 4;
const STATUS_CANCELLED = 5;
const STATUS_EXPIRED = 6;

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
  const [lifecycleOpen, setLifecycleOpen] = useState(false);
  const [lifecycleDismissedId, setLifecycleDismissedId] = useState<
    string | null
  >(null);
  const [proposalModalOpen, setProposalModalOpen] = useState(false);
  const wallet = useWallet();
  const { connection } = useConnection();
  const settings = useAppSettings();
  const { selectedAgent } = useAgents();
  const client = useAuraClient();
  const queryClient = useQueryClient();
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
      pending?.status === STATUS_SIGNATURE_PENDING,
    refetchInterval: (query) => {
      const d = query.state.data as { state?: string } | undefined;
      return d?.state === "signed" ? false : 10_000;
    },
    refetchIntervalInBackground: false,
  });

  const ikaState = messageApprovalStatusQuery.data?.state;

  // status codes: 0=Proposed, 1=DecryptionRequested, 2=AwaitingSignature,
  // 3=Executed, 4=Denied, 5=Cancelled, 6=Expired.
  const policyFheType = hasPending
    ? (pending as { policyOutputFheType?: number | null }).policyOutputFheType
    : null;
  // A proposal is confidential if it carries FHE output data on-chain,
  // OR if localStorage has a stored policy output ciphertext from submission
  // (the on-chain field may not be populated yet right after submission).
  const storedCiphertext =
    typeof window !== "undefined"
      ? localStorage.getItem(`aura:policy-output-ciphertext:${pda}`)
      : null;
  const isConfidential = Boolean(
    hasPending &&
      (!!pending.policyOutputCiphertextAccount ||
        policyFheType != null ||
        !!storedCiphertext),
  );
  // For confidential proposals, Execute is handled inside ConfidentialLifecycleModal
  const canExecute =
    hasPending && pending.status === STATUS_PROPOSED && !isConfidential;
  const canFinalize =
    hasPending &&
    pending.status === STATUS_SIGNATURE_PENDING &&
    Boolean(messageApprovalAddress) &&
    ikaState === "signed";
  // Can cancel any non-terminal proposal
  const canCancel =
    hasPending &&
    pending.status !== STATUS_EXECUTED &&
    pending.status !== STATUS_DENIED &&
    pending.status !== STATUS_CANCELLED &&
    pending.status !== STATUS_EXPIRED;

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
    onSuccess: async () => {
      localStorage.removeItem(`aura:policy-output-ciphertext:${pda}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury", pda] }),
        queryClient.invalidateQueries({ queryKey: ["treasuries"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-trail", pda] }),
      ]);
    },
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
    onSuccess: async () => {
      localStorage.removeItem(`aura:policy-output-ciphertext:${pda}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury", pda] }),
        queryClient.invalidateQueries({ queryKey: ["treasuries"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-trail", pda] }),
      ]);
    },
  });

  // Clear the stale FHE ciphertext from localStorage whenever the proposal
  // reaches a terminal state. Without this, a normal proposal submitted after
  // a confidential one would incorrectly read the stale ciphertext and be
  // treated as confidential.
  const pendingStatus = hasPending
    ? (pending as { status?: number } | null)?.status
    : null;
  useEffect(() => {
    if (
      !hasPending ||
      pendingStatus === STATUS_DENIED ||
      pendingStatus === STATUS_CANCELLED ||
      pendingStatus === STATUS_EXPIRED
    ) {
      localStorage.removeItem(`aura:policy-output-ciphertext:${pda}`);
    }
  }, [hasPending, pendingStatus, pda]);

  // When the active proposal changes (new proposalId), clear any leftover
  // mutation errors so the fresh proposal's modal starts with a clean slate.
  const currentProposalId = hasPending ? pending?.proposalId?.toString() : null;
  // biome-ignore lint/correctness/useExhaustiveDependencies: currentProposalId is the intentional trigger; .reset refs are stable
  useEffect(() => {
    executeMutation.reset();
    finalizeMutation.reset();
  }, [currentProposalId, executeMutation.reset, finalizeMutation.reset]);

  // Auto-execute proposals already denied by policy at status=0 (Proposed).
  // The on-chain program evaluates policy at propose time; denied proposals sit
  // at status=0 until executePending is called to move them to status=4 (Denied).
  const isDeniedAtPropose =
    hasPending &&
    pending?.status === STATUS_PROPOSED &&
    (pending as { decision?: { approved?: boolean } } | null)?.decision
      ?.approved === false;

  useEffect(() => {
    if (isDeniedAtPropose && selectedAgent?.agentId && executeMutation.isIdle) {
      executeMutation.mutate();
    }
  }, [
    isDeniedAtPropose,
    selectedAgent?.agentId,
    executeMutation.isIdle,
    executeMutation.mutate,
  ]);

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey) throw new Error("Connect a wallet first.");
      const instruction = await client.cancelPendingInstruction(
        { owner: wallet.publicKey, treasury: treasury.publicKey },
        Math.floor(Date.now() / 1000),
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async (signature) => {
      // Reset all UI state immediately — before the refetch arrives.
      // Without this, the modal stays open and the next proposal inherits
      // the old error, lifecycle-dismissed state, and open flag.
      setProposalModalOpen(false);
      setLifecycleOpen(false);
      setLifecycleDismissedId(null);
      executeMutation.reset();
      finalizeMutation.reset();

      postBackend(settings.backendUrl, "/v1/activity/register-event", {
        treasuryAddress: pda,
        txSignature: signature,
        kind: "proposal_cancelled",
        walletAddress: wallet.publicKey?.toBase58(),
        meta: {
          proposalId: pending?.proposalId?.toString() ?? null,
          approved: false,
          status: 5,
        },
      }).catch(() => {});
      localStorage.removeItem(`aura:policy-output-ciphertext:${pda}`);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury", pda] }),
        queryClient.invalidateQueries({ queryKey: ["treasuries"] }),
        queryClient.invalidateQueries({ queryKey: ["activity"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-trail", pda] }),
      ]);
    },
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
          <h2 className="text-xl font-semibold text-(--text-main) mb-1">
            Pending Proposals
          </h2>
          <p className="text-[12px] text-(--text-muted)">
            Transactions awaiting execution.
          </p>
        </div>
        <div className="p-8 text-center border border-dashed border-border rounded-sm">
          <p className="text-sm text-(--text-muted)">No pending proposals</p>
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
    pending.status === STATUS_EXECUTED
      ? ("active" as const)
      : pending.status === STATUS_DENIED ||
          pending.status === STATUS_CANCELLED ||
          pending.status === STATUS_EXPIRED
        ? ("error" as const)
        : ("medium" as const);

  const sanitizedError =
    (executeMutation.error ?? finalizeMutation.error ?? cancelMutation.error)
      ? sanitizeError(
          executeMutation.error ??
            finalizeMutation.error ??
            cancelMutation.error,
        )
      : null;

  // Terminal statuses: 4=Denied, 5=Cancelled, 6=Expired
  const isTerminal =
    hasPending &&
    (pending.status === STATUS_DENIED ||
      pending.status === STATUS_CANCELLED ||
      pending.status === STATUS_EXPIRED);
  const rejectionMessage =
    pending?.status === STATUS_DENIED
      ? `Proposal PROP-${pending.proposalId.toString().padStart(4, "0")} was denied by the policy engine.${pending.decision?.violation ? ` Violation: ${pending.decision.violation}` : ""}`
      : pending?.status === STATUS_CANCELLED
        ? `Proposal PROP-${pending.proposalId.toString().padStart(4, "0")} was cancelled.`
        : pending?.status === STATUS_EXPIRED
          ? `Proposal PROP-${pending.proposalId.toString().padStart(4, "0")} expired before execution.`
          : null;

  return (
    <div>
      {/* Rejection / terminal state alert — shown above the section */}
      {isTerminal && rejectionMessage && (
        <div className="mb-6">
          <Alert
            variant={pending.status === STATUS_CANCELLED ? "warning" : "error"}
            message={rejectionMessage}
          />
        </div>
      )}

      <div className="mb-6 pb-4 border-b border-border">
        <div className="flex items-center gap-3 mb-2">
          <span className="font-mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted)">
            Queue
          </span>
          <span
            className={`px-2 py-0.5 rounded-sm text-[10px] font-mono ${isTerminal ? "bg-(--card-bg) border border-border text-(--text-muted)" : "bg-(--warning-bg) border border-(--warning-border) text-(--warning-text)"}`}
          >
            {isTerminal ? "0 PENDING" : "1 ACTIVE"}
          </span>
        </div>
        <h2 className="text-xl font-semibold text-(--text-main) mb-1">
          Pending Proposals
        </h2>
        <p className="text-[12px] text-(--text-muted)">
          Transactions awaiting execution.
        </p>
      </div>

      <div className="border border-border rounded-sm overflow-hidden overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-(--card-content) border-b border-border">
              <th className="text-left px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Proposal ID
              </th>
              <th className="text-left px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Type
              </th>
              <th className="text-left px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Chain
              </th>
              <th className="text-left px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Amount
              </th>
              <th className="text-left px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Recipient
              </th>
              <th className="text-left px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Status
              </th>
              <th className="text-right px-3 sm:px-4 py-3 font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-b border-border hover:bg-(--hover-bg) transition-colors">
              <td className="px-3 sm:px-4 py-4 font-mono text-sm text-(--text-main)">
                PROP-{pending.proposalId.toString().padStart(4, "0")}
              </td>
              <td className="px-3 sm:px-4 py-4">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm text-(--text-main)">
                    {txType}
                  </span>
                  {isConfidential && (
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm border border-border text-(--text-muted) bg-(--card-content)">
                      <Lock size={8} />
                      FHE
                    </span>
                  )}
                </div>
              </td>
              <td className="px-3 sm:px-4 py-4 font-mono text-sm text-(--text-main)">
                {chain}
              </td>
              <td className="px-3 sm:px-4 py-4 font-mono text-sm text-(--text-main)">
                {formatCurrency(amountUsd)}
              </td>
              <td className="px-3 sm:px-4 py-4 font-mono text-sm text-(--text-muted)">
                <span className="flex items-center gap-1.5">
                  <Tooltip content={pending.recipientOrContract}>
                    <span>
                      {shortenAddress(pending.recipientOrContract, 6, 4)}
                    </span>
                  </Tooltip>
                  <Tooltip content="Copy">
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(
                          pending.recipientOrContract,
                        )
                      }
                      className="text-(--text-muted) hover:text-primary transition-colors"
                    >
                      <Copy size={10} animateOnHover />
                    </button>
                  </Tooltip>
                  <Tooltip content="View on Explorer">
                    <a
                      href={`https://explorer.solana.com/address/${pending.recipientOrContract}?cluster=devnet`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-(--text-muted) hover:text-primary transition-colors"
                    >
                      <SquareArrowOutUpRight size={10} animateOnHover />
                    </a>
                  </Tooltip>
                </span>
              </td>
              <td className="px-3 sm:px-4 py-4">
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
              <td className="px-3 sm:px-4 py-4 text-right">
                <Button
                  variant="primary"
                  size="small"
                  onClick={() => setProposalModalOpen(true)}
                >
                  Review →
                </Button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ProposalLifecycleModal
        isOpen={proposalModalOpen}
        onClose={() => {
          setProposalModalOpen(false);
          executeMutation.reset();
          finalizeMutation.reset();
        }}
        pending={pending}
        messageApprovalAddress={messageApprovalAddress || undefined}
        ikaState={ikaState}
        isConfidential={isConfidential}
        canExecute={!!canExecute}
        canFinalize={!!canFinalize}
        canCancel={!!canCancel}
        isExecuting={executeMutation.isPending}
        isFinalizing={finalizeMutation.isPending}
        isCancelling={cancelMutation.isPending}
        error={sanitizedError}
        onExecute={() => executeMutation.mutate()}
        onFinalize={() => finalizeMutation.mutate()}
        onCancel={() => cancelMutation.mutate()}
        onLifecycle={() => {
          setLifecycleDismissedId(null);
          setLifecycleOpen(true);
        }}
        onDismissError={() => {
          executeMutation.reset();
          finalizeMutation.reset();
          cancelMutation.reset();
        }}
        backendUrl={settings.backendUrl}
      />

      {isConfidential && pending && (
        <ConfidentialLifecycleModal
          isOpen={
            lifecycleOpen &&
            lifecycleDismissedId !== pending.proposalId.toString()
          }
          onClose={() => {
            setLifecycleOpen(false);
            setLifecycleDismissedId(pending.proposalId.toString());
          }}
          pending={pending}
          pda={pda}
        />
      )}
    </div>
  );
};
