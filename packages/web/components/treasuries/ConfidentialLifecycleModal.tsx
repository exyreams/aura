"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Circle,
  Loader2,
  Lock,
} from "lucide-react";
import { StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Modal } from "@/components/global/Modal";
import { Tooltip } from "@/components/global/Tooltip";
import type { PendingProposalRecord } from "@/lib/aura-app";
import { PROPOSAL_STATUSES, sendWalletInstructions } from "@/lib/aura-app";
import {
  backendRequest,
  LONG_TIMEOUT_MS,
  postBackend,
} from "@/lib/backend-client";
import { useAgents, useAppSettings, useAuraClient } from "@/lib/hooks";
import { formatCurrency, shortenAddress } from "@/lib/utils";

interface ConfidentialLifecycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  pending: PendingProposalRecord;
  pda: string;
}

function StepIndicator({
  number,
  label,
  state,
}: {
  number: number;
  label: string;
  state: "done" | "active" | "upcoming";
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="shrink-0">
        {state === "done" ? (
          <CheckCircle2 className="w-5 h-5 text-active" />
        ) : state === "active" ? (
          <div className="w-5 h-5 rounded-full border-2 border-active flex items-center justify-center">
            <span className="text-[9px] font-bold text-active">{number}</span>
          </div>
        ) : (
          <Circle className="w-5 h-5 text-(--text-muted)" />
        )}
      </div>
      <span
        className={`text-xs font-mono ${
          state === "active"
            ? "text-(--text-main) font-bold"
            : state === "done"
              ? "text-active"
              : "text-(--text-muted)"
        }`}
      >
        {label}
      </span>
    </div>
  );
}

export function ConfidentialLifecycleModal({
  isOpen,
  onClose,
  pending,
  pda,
}: ConfidentialLifecycleModalProps) {
  const settings = useAppSettings();
  const { selectedAgent } = useAgents();
  const queryClient = useQueryClient();
  const wallet = useWallet();
  const { connection } = useConnection();
  const client = useAuraClient();

  const messageApprovalAddress =
    pending.signatureRequest?.messageApprovalAccount?.toString() ?? "";

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
    enabled: Boolean(messageApprovalAddress) && pending.status === 2,
    refetchInterval: (query) => {
      const d = query.state.data as { state?: string } | undefined;
      return d?.state === "signed" ? false : 4_000;
    },
    refetchIntervalInBackground: false,
  });

  const ikaState = messageApprovalStatusQuery.data?.state;

  const invalidate = async () => {
    await queryClient.invalidateQueries({ queryKey: ["treasury", pda] });
    await queryClient.invalidateQueries({ queryKey: ["treasuries"] });
    await queryClient.invalidateQueries({ queryKey: ["audit-trail", pda] });
    await queryClient.invalidateQueries({ queryKey: ["recent-activity"] });
  };

  const requestDecryptionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId) throw new Error("Select an agent first.");
      return postBackend<{ signature: string; requestAccount: string }>(
        settings.backendUrl,
        "/v1/confidential/request-decryption",
        {
          rpcUrl: settings.endpoint,
          programId: settings.programId || undefined,
          agentId: selectedAgent.agentId,
          treasury: pda,
          ciphertext: pending.policyOutputCiphertextAccount ?? undefined,
          wait: true,
        },
        { timeoutMs: LONG_TIMEOUT_MS },
      );
    },
    onSuccess: invalidate,
  });

  const confirmDecryptionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId) throw new Error("Select an agent first.");
      return postBackend<{
        signature: string;
        approved: boolean | null;
        violation: number | null;
        violationCode: string | null;
      }>(settings.backendUrl, "/v1/confidential/confirm-decryption", {
        rpcUrl: settings.endpoint,
        programId: settings.programId || undefined,
        agentId: selectedAgent.agentId,
        treasury: pda,
        requestAccount: pending.decryptionRequest?.requestAccount ?? undefined,
      });
    },
    onSuccess: invalidate,
  });

  const executeMutation = useMutation({
    mutationFn: async () => {
      if (!selectedAgent?.agentId) throw new Error("Select an agent first.");
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
      if (!selectedAgent?.agentId) throw new Error("Select an agent first.");
      return postBackend<{ signature: string; totalTransactions: string }>(
        settings.backendUrl,
        "/v1/execution/finalize",
        {
          rpcUrl: settings.endpoint,
          programId: settings.programId || undefined,
          agentId: selectedAgent.agentId,
          treasury: pda,
          messageApproval: messageApprovalAddress || undefined,
        },
      );
    },
    onSuccess: invalidate,
  });

  const cancelMutation = useMutation({
    mutationFn: async () => {
      if (!wallet.publicKey) throw new Error("Connect your wallet to cancel.");
      const instruction = await client.cancelPendingInstruction(
        { owner: wallet.publicKey, treasury: new PublicKey(pda) },
        Math.floor(Date.now() / 1000),
      );
      return await sendWalletInstructions(connection, wallet, [instruction]);
    },
    onSuccess: async () => {
      await invalidate();
      onClose();
    },
  });

  const isExpiredError = (msg: string | null | undefined) =>
    !!msg &&
    (msg.includes("PendingTransactionExpired") ||
      msg.includes("0x1782") ||
      msg.includes("6018"));

  const executeErrorMsg = executeMutation.error?.message ?? null;
  const isExpired = isExpiredError(executeErrorMsg);

  const hasDecryptionRequest = !!pending.decryptionRequest?.requestAccount;
  const decryptionVerified = !!pending.decryptionRequest?.verifiedAt;
  const isPolicyOutputSet = !!pending.policyOutputCiphertextAccount;

  const step1State: "done" | "active" | "upcoming" =
    hasDecryptionRequest || pending.status >= 1
      ? "done"
      : isPolicyOutputSet && pending.status === 0
        ? "active"
        : "upcoming";

  const step2State: "done" | "active" | "upcoming" =
    decryptionVerified || (pending.status === 0 && step1State === "done")
      ? "done"
      : pending.status === 1
        ? "active"
        : "upcoming";

  const step3State: "done" | "active" | "upcoming" =
    pending.status >= 2
      ? "done"
      : step2State === "done"
        ? "active"
        : "upcoming";

  const step4State: "done" | "active" | "upcoming" =
    pending.status === 3
      ? "done"
      : pending.status === 2
        ? "active"
        : "upcoming";

  const canRequestDecryption =
    isPolicyOutputSet && pending.status === 0 && !hasDecryptionRequest;
  const canConfirmDecryption = pending.status === 1 && hasDecryptionRequest;
  const canExecute = step2State === "done" && pending.status < 2;
  const canFinalize = pending.status === 2 && ikaState === "signed";

  const anyPending =
    requestDecryptionMutation.isPending ||
    confirmDecryptionMutation.isPending ||
    executeMutation.isPending ||
    finalizeMutation.isPending ||
    cancelMutation.isPending;

  const activeError =
    requestDecryptionMutation.error?.message ||
    confirmDecryptionMutation.error?.message ||
    (!isExpired ? executeErrorMsg : null) ||
    finalizeMutation.error?.message ||
    cancelMutation.error?.message ||
    null;

  const amountUsd = Number(pending.amountUsd.toString()) / 100;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Confidential Lifecycle"
      className="max-w-lg"
    >
      {/* Proposal summary */}
      <div className="mb-6 p-4 bg-(--card-content) border border-border rounded-sm">
        <div className="flex items-center gap-2 mb-3">
          <Lock className="w-3.5 h-3.5 text-(--text-muted)" />
          <span className="font-mono text-[10px] uppercase tracking-widest text-(--text-muted)">
            Confidential Proposal
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] font-mono text-(--text-muted) mb-0.5">
              ID
            </div>
            <div className="text-sm font-mono text-(--text-main)">
              PROP-{pending.proposalId.toString().padStart(4, "0")}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-(--text-muted) mb-0.5">
              Amount
            </div>
            <div className="text-sm font-mono text-(--text-main)">
              {formatCurrency(amountUsd)}
            </div>
          </div>
          <div>
            <div className="text-[10px] font-mono text-(--text-muted) mb-0.5">
              Status
            </div>
            <StatusPill
              variant={
                pending.status === 3
                  ? "active"
                  : pending.status >= 4
                    ? "error"
                    : "medium"
              }
              className="text-[9px] px-2 py-0.5"
            >
              {(PROPOSAL_STATUSES[pending.status] ?? "Unknown").toUpperCase()}
            </StatusPill>
          </div>
          <div>
            <div className="text-[10px] font-mono text-(--text-muted) mb-0.5">
              Recipient
            </div>
            <div className="text-xs font-mono text-(--text-muted)">
              {shortenAddress(pending.recipientOrContract, 6, 4)}
            </div>
          </div>
        </div>
      </div>

      {/* Policy output ciphertext */}
      {pending.policyOutputCiphertextAccount && (
        <div className="mb-4">
          <div className="text-[10px] font-mono uppercase text-(--text-muted) mb-1">
            Policy Output Ciphertext
          </div>
          <div className="font-mono text-[11px] text-(--text-muted) break-all bg-(--card-content) border border-border rounded-sm px-3 py-2">
            {pending.policyOutputCiphertextAccount}
          </div>
        </div>
      )}

      {/* Decryption request account */}
      {pending.decryptionRequest?.requestAccount && (
        <div className="mb-4">
          <div className="text-[10px] font-mono uppercase text-(--text-muted) mb-1">
            Decryption Request Account
          </div>
          <div className="font-mono text-[11px] text-(--text-muted) break-all bg-(--card-content) border border-border rounded-sm px-3 py-2">
            {pending.decryptionRequest.requestAccount}
          </div>
        </div>
      )}

      {/* IKA status */}
      {messageApprovalAddress && pending.status === 2 && (
        <div className="mb-4 flex items-center gap-2">
          <div className="text-[10px] font-mono uppercase text-(--text-muted)">
            IKA
          </div>
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
            {messageApprovalStatusQuery.isFetching && (
              <Loader2 className="w-2.5 h-2.5 animate-spin inline mr-1" />
            )}
            {ikaState ?? "..."}
          </StatusPill>
          <span className="font-mono text-[10px] text-(--text-muted)">
            {shortenAddress(messageApprovalAddress, 6, 4)}
          </span>
        </div>
      )}

      {/* Step indicators */}
      <div className="mb-6 space-y-3 p-4 border border-border rounded-sm">
        <StepIndicator
          number={1}
          label="Request Decryption"
          state={step1State}
        />
        <StepIndicator
          number={2}
          label="Confirm Decryption"
          state={step2State}
        />
        <StepIndicator number={3} label="Execute" state={step3State} />
        <StepIndicator number={4} label="Finalize" state={step4State} />
      </div>

      {/* Expiry banner */}
      {isExpired && (
        <div className="mb-4 rounded-sm border border-(--warning-border) bg-(--warning-bg) p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-(--warning-text) shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold text-(--warning-text) mb-1">
                Proposal has expired
              </p>
              <p className="text-[11px] text-(--text-muted) leading-relaxed mb-3">
                The time window for this proposal has passed. Cancel it to clear
                the treasury slot, then submit a new proposal.
              </p>
              <div className="flex gap-2">
                <Button
                  variant="danger"
                  className="text-xs font-mono"
                  loading={cancelMutation.isPending}
                  disabled={!wallet.publicKey || cancelMutation.isPending}
                  onClick={() => cancelMutation.mutate()}
                >
                  Cancel Proposal
                </Button>
              </div>
              {!wallet.publicKey && (
                <p className="mt-2 text-[10px] text-(--text-muted) font-mono">
                  Connect your wallet to cancel.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Generic error */}
      {activeError && (
        <div className="mb-4 rounded-sm border border-danger/20 bg-danger/10 p-3">
          <p className="text-xs text-danger break-all">{activeError}</p>
        </div>
      )}

      {/* Action buttons */}
      <div className="flex flex-col gap-2">
        <Tooltip content="Submit a decryption request to the Ika Encrypt network for the policy output ciphertext.">
          <Button
            variant="secondary"
            className="w-full font-mono text-xs"
            disabled={!canRequestDecryption || anyPending || !selectedAgent}
            loading={requestDecryptionMutation.isPending}
            onClick={() => requestDecryptionMutation.mutate()}
          >
            Request Decryption
          </Button>
        </Tooltip>
        <Tooltip content="Read the decrypted policy result and apply the decision. Approved proposals move to the execute step.">
          <Button
            variant="secondary"
            className="w-full font-mono text-xs"
            disabled={!canConfirmDecryption || anyPending || !selectedAgent}
            loading={confirmDecryptionMutation.isPending}
            onClick={() => confirmDecryptionMutation.mutate()}
          >
            Confirm Decryption
          </Button>
        </Tooltip>
        <Tooltip content="Send the approve_message CPI to the Ika dWallet. The dWallet signs asynchronously — watch the IKA status badge.">
          <Button
            variant="primary"
            className="w-full font-mono text-xs"
            disabled={!canExecute || anyPending || !selectedAgent}
            loading={executeMutation.isPending}
            onClick={() => executeMutation.mutate()}
          >
            Execute Pending
          </Button>
        </Tooltip>
        <Tooltip content="Verify the dWallet signature and close the proposal. Only available once IKA status shows 'signed'.">
          <Button
            variant="primary"
            className="w-full font-mono text-xs"
            disabled={!canFinalize || anyPending || !selectedAgent}
            loading={finalizeMutation.isPending}
            onClick={() => finalizeMutation.mutate()}
          >
            {messageApprovalAddress && ikaState !== "signed"
              ? "Waiting for Ika…"
              : "Finalize Execution"}
          </Button>
        </Tooltip>
      </div>

      {!selectedAgent && (
        <p className="mt-3 text-center text-xs text-(--text-muted) font-mono">
          Select an agent to perform lifecycle actions.
        </p>
      )}
    </Modal>
  );
}
