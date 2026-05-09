"use client";

import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Alert } from "@/components/global/Alert";
import { StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { ConfidentialLifecycleModal } from "@/components/treasuries/ConfidentialLifecycleModal";
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

const STATUS_PROPOSED = 0;
const STATUS_DECRYPTION_REQUESTED = 1;
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
  const wallet = useWallet();
  const { connection } = useConnection();
  const settings = useAppSettings();
  const { selectedAgent } = useAgents();
  const client = useAuraClient();
  const queryClient = useQueryClient();

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["treasury", pda] }),
      queryClient.invalidateQueries({ queryKey: ["treasuries"] }),
      queryClient.invalidateQueries({ queryKey: ["recent-activity"] }),
      queryClient.invalidateQueries({ queryKey: ["audit-trail", pda] }),
    ]);
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
  const hasScalarGuardrails =
    !!treasury.account.confidentialGuardrails?.dailyLimitCiphertext;
  const policyFheType = hasPending
    ? (pending as { policyOutputFheType?: number | null }).policyOutputFheType
    : null;
  const isConfidential = Boolean(
    hasPending &&
      (!!pending.policyOutputCiphertextAccount ||
        policyFheType != null ||
        hasScalarGuardrails),
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury", pda] }),
        queryClient.invalidateQueries({ queryKey: ["treasuries"] }),
        queryClient.invalidateQueries({ queryKey: ["recent-activity"] }),
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
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury", pda] }),
        queryClient.invalidateQueries({ queryKey: ["treasuries"] }),
        queryClient.invalidateQueries({ queryKey: ["recent-activity"] }),
        queryClient.invalidateQueries({ queryKey: ["audit-trail", pda] }),
      ]);
    },
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
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["treasury", pda] }),
        queryClient.invalidateQueries({ queryKey: ["treasuries"] }),
        queryClient.invalidateQueries({ queryKey: ["recent-activity"] }),
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

  const mutationError =
    executeMutation.error instanceof Error
      ? executeMutation.error.message
      : finalizeMutation.error instanceof Error
        ? finalizeMutation.error.message
        : cancelMutation.error instanceof Error
          ? cancelMutation.error.message
          : null;

  function sanitizeError(msg: string): string {
    // --- Wallet / signing ---
    if (/user rejected|rejected the request|user denied/i.test(msg))
      return "Transaction cancelled by wallet.";
    if (/wallet not connected|no wallet|connect.*wallet/i.test(msg))
      return "No wallet connected. Connect a wallet and try again.";
    if (/wallet.*locked|please unlock/i.test(msg))
      return "Your wallet is locked. Unlock it and try again.";
    // --- Funds / fees ---
    if (/insufficient funds for rent/i.test(msg))
      return "Not enough SOL to cover rent. Top up your wallet and try again.";
    if (/insufficient lamports|insufficient funds/i.test(msg))
      return "Insufficient funds to complete this transaction.";
    if (/0x1\b/.test(msg))
      return "Not enough SOL in your wallet. Fund it with devnet SOL and try again.";
    // --- Transaction lifecycle ---
    if (/blockhash not found|blockhash.*expired/i.test(msg))
      return "Transaction expired — the network was too slow. Please try again.";
    if (/was not confirmed|transaction not confirmed/i.test(msg))
      return "Transaction timed out waiting for confirmation. Try again.";
    if (/transaction too large/i.test(msg))
      return "Transaction is too large to submit. Contact support.";
    if (/transaction.*failed|failed.*transaction/i.test(msg))
      return "Transaction failed on-chain. Check your wallet balance and try again.";
    if (/simulation failed/i.test(msg))
      return "Transaction simulation failed. Check your wallet balance and try again.";
    if (/already.*processed|duplicate.*transaction/i.test(msg))
      return "This transaction was already processed. Refresh and check the proposal status.";
    // --- RPC / network ---
    if (
      /fetch.*fail|network.*error|econnrefused|enotfound|failed to fetch/i.test(
        msg,
      )
    )
      return "Could not reach the backend. Check your network connection and backend URL in Settings.";
    if (/timeout|timed out/i.test(msg))
      return "Request timed out. The network may be congested — please try again.";
    if (/429|rate.?limit/i.test(msg))
      return "Too many requests. Wait a moment and try again.";
    if (/rpc.*error|node.*error/i.test(msg))
      return "RPC node error. Try switching to a different endpoint in Settings.";
    // --- Accounts / program ---
    if (/account.*not found|could not find account|invalid.*account/i.test(msg))
      return "Account not found on-chain. The treasury or dWallet may not be initialized.";
    if (/account.*already.*exist|already in use/i.test(msg))
      return "Account already exists. Refresh the page and check for an active proposal.";
    if (/invalid.*program|program.*not.*found/i.test(msg))
      return "Program not found. Verify the Program ID in Settings.";
    if (/owner.*mismatch|invalid.*owner/i.test(msg))
      return "Account owner mismatch. Ensure you are using the correct program ID.";
    // --- Proposal / treasury state ---
    if (/no pending transaction|no pending proposal/i.test(msg))
      return "No pending proposal found on this treasury.";
    if (/proposal.*already.*exists/i.test(msg))
      return "A proposal is already active on this treasury. Cancel it before creating a new one.";
    if (/execution paused/i.test(msg))
      return "Execution is paused on this treasury. Unpause it in treasury settings.";
    if (/treasury.*not.*found/i.test(msg))
      return "Treasury not found. It may have been closed or the address is incorrect.";
    if (/ttl.*elapsed|proposal.*expired/i.test(msg))
      return "This proposal has expired. Create a new one.";
    if (/proposal.*denied/i.test(msg))
      return "Proposal was denied by the policy engine.";
    // --- Agent ---
    if (/agent.*not found|invalid.*agent/i.test(msg))
      return "Agent not found. Select a valid agent in the agent panel.";
    if (/create and select an agent/i.test(msg))
      return "No agent selected. Create and select an agent first.";
    if (/agent.*not.*authorized|agent.*permission/i.test(msg))
      return "This agent is not authorized to act on this treasury.";
    // --- Ika / dWallet ---
    if (/timed out waiting for/i.test(msg))
      return "Ika didn't respond in time — the signing window (~15 min) may have passed. Re-execute the proposal to request a fresh signature.";
    if (/message approval not ready|approval.*not.*ready/i.test(msg))
      return "Waiting for Ika to sign — the signature isn't ready yet. Check the IKA status indicator.";
    if (/dwallet not configured|no dwallet/i.test(msg))
      return "No dWallet registered for this chain. Register one in treasury settings first.";
    if (/dwallet.*mismatch/i.test(msg))
      return "dWallet mismatch. The registered dWallet doesn't match the proposal.";
    if (/ika.*unavailable|ika.*error/i.test(msg))
      return "Ika network is unavailable. Try again in a few moments.";
    // --- Auth ---
    if (/unauthorized|not authorized|forbidden/i.test(msg))
      return "You are not authorized to perform this action.";
    // Fallback: strip backend UUIDs and Program log prefixes
    return msg
      .replace(/\s*\([0-9a-f-]{36}\)\s*$/i, "")
      .replace(/^Program log:\s*/i, "")
      .trim();
  }

  const sanitizedError = mutationError ? sanitizeError(mutationError) : null;

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

      {sanitizedError && (
        <div className="mb-4">
          <Alert
            variant="error"
            message={sanitizedError}
            onClose={() => {
              executeMutation.reset();
              finalizeMutation.reset();
              cancelMutation.reset();
            }}
          />
        </div>
      )}

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
              <td className="p-4 font-mono text-sm text-(--text-main)">
                PROP-{pending.proposalId.toString().padStart(4, "0")}
              </td>
              <td className="p-4 font-mono text-sm text-(--text-main)">
                <div className="flex flex-col gap-1">
                  <span>{txType}</span>
                  {isConfidential && (
                    <span
                      className="text-[9px] font-mono uppercase tracking-wider px-1.5 py-0.5 rounded-sm border w-fit
                      border-(--warning-border) text-(--warning-text) bg-(--warning-bg)"
                    >
                      Scalar FHE
                    </span>
                  )}
                </div>
              </td>
              <td className="p-4 font-mono text-sm text-(--text-main)">
                {chain}
              </td>
              <td className="p-4 font-mono text-sm text-(--text-main)">
                {formatCurrency(amountUsd)}
              </td>
              <td className="p-4 font-mono text-sm text-(--text-muted)">
                {shortenAddress(pending.recipientOrContract, 6, 4)}
              </td>
              <td className="p-4">
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
              <td className="p-4 text-right">
                <div className="flex items-center justify-end gap-2">
                  {isConfidential && (
                    <Button
                      variant="secondary"
                      size="small"
                      onClick={() => {
                        setLifecycleDismissedId(null);
                        setLifecycleOpen(true);
                      }}
                    >
                      Lifecycle
                    </Button>
                  )}
                  {!isConfidential && (
                    <Button
                      variant="primary"
                      size="small"
                      loading={executeMutation.isPending}
                      disabled={
                        !canExecute ||
                        executeMutation.isPending ||
                        !selectedAgent
                      }
                      onClick={() => executeMutation.mutate()}
                    >
                      Execute
                    </Button>
                  )}
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
      <div className="mt-4 p-4 bg-(--card-content) border border-border rounded-sm">
        <p className="text-[11px] font-mono text-(--text-muted)">
          {isConfidential
            ? "Scalar FHE proposal — click Lifecycle to manage the decryption and execution steps."
            : pending.status === STATUS_PROPOSED
              ? "Step 1 of 2 — Click Execute to send the approve_message CPI to the dWallet. Requires the backend service running at " +
                settings.backendUrl
              : pending.status === STATUS_DECRYPTION_REQUESTED
                ? "Decryption in progress — waiting for Ika Encrypt network."
                : pending.status === STATUS_SIGNATURE_PENDING
                  ? "Step 2 of 2 — dWallet has signed. Click Finalize to verify the signature and close the proposal."
                  : pending.status === STATUS_EXECUTED
                    ? "✓ Executed — proposal completed successfully."
                    : pending.status === STATUS_DENIED
                      ? "✗ Denied — policy engine rejected this proposal."
                      : pending.status === STATUS_CANCELLED
                        ? "Cancelled by owner."
                        : pending.status === STATUS_EXPIRED
                          ? "Expired — TTL elapsed before execution."
                          : null}
        </p>
      </div>

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
