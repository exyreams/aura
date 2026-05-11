"use client";

import { m } from "motion/react";
import { useState } from "react";
import { Alert } from "@/components/global/Alert";
import { Badge, StatusPill } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Modal } from "@/components/global/Modal";
import { Tooltip } from "@/components/global/Tooltip";
import {
  Checkcircle,
  Clock,
  Copy,
  ShieldAlert,
  ShieldCheck,
  SquareArrowOutUpRight,
  Xcircle,
} from "@/components/icons";
import { CHAINS, PROPOSAL_STATUSES, TX_TYPES } from "@/lib/aura-app";
import { formatCurrency, shortenAddress } from "@/lib/utils";

const STATUS_PROPOSED = 0;
const STATUS_DECRYPTION_REQUESTED = 1;
const STATUS_SIGNATURE_PENDING = 2;
const STATUS_EXECUTED = 3;
const STATUS_DENIED = 4;
const STATUS_CANCELLED = 5;
const STATUS_EXPIRED = 6;

type StepState = "done" | "active" | "pending" | "failed";

function Step({
  label,
  description,
  state,
  isLast,
}: {
  label: string;
  description: string;
  state: StepState;
  isLast?: boolean;
}) {
  const labelColor =
    state === "done" || state === "active"
      ? "text-(--text-main)"
      : "text-(--text-muted)";

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center shrink-0">
        {state === "active" ? (
          <svg
            className="size-2.5 mt-0.5 shrink-0 animate-spin text-primary"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden="true"
          >
            <circle
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
              strokeOpacity="0.25"
            />
            <path
              d="M12 2a10 10 0 0 1 10 10"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <div
            className={`size-2.5 rounded-full mt-0.5 shrink-0 ${
              state === "done"
                ? "bg-success"
                : state === "failed"
                  ? "bg-danger"
                  : "bg-border"
            }`}
          />
        )}
        {!isLast && <div className="w-px flex-1 bg-border mt-1 min-h-[24px]" />}
      </div>
      <div className={`flex-1 ${isLast ? "pb-0" : "pb-4"}`}>
        <p
          className={`mono text-[11px] font-bold uppercase tracking-wide ${labelColor}`}
        >
          {label}
        </p>
        <p className="mono text-[10px] text-(--text-muted) mt-0.5 leading-relaxed">
          {description}
        </p>
      </div>
    </div>
  );
}

function HashRow({
  label,
  value,
  kind,
}: {
  label: string;
  value: string;
  kind: "tx" | "address" | "digest";
}) {
  const [copied, setCopied] = useState(false);
  const explorerUrl =
    kind === "tx"
      ? `https://explorer.solana.com/tx/${value}?cluster=devnet`
      : kind === "address"
        ? `https://explorer.solana.com/address/${value}?cluster=devnet`
        : null;

  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="mono text-[10px] text-(--text-muted) uppercase tracking-wider">
        {label}
      </span>
      <span className="mono text-[11px] text-(--text-main) flex items-center gap-1.5">
        <Tooltip content={value}>
          <span>{shortenAddress(value, 6, 4)}</span>
        </Tooltip>
        <Tooltip content={copied ? "Copied!" : "Copy"}>
          <button
            type="button"
            onClick={async () => {
              await navigator.clipboard.writeText(value);
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="text-(--text-muted) hover:text-primary transition-colors"
          >
            {copied ? (
              <Checkcircle size={11} animateOnHover className="text-success" />
            ) : (
              <Copy size={11} animateOnHover />
            )}
          </button>
        </Tooltip>
        {explorerUrl && (
          <Tooltip content="View on Explorer">
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              className="text-(--text-muted) hover:text-primary transition-colors"
            >
              <SquareArrowOutUpRight size={11} animateOnHover />
            </a>
          </Tooltip>
        )}
      </span>
    </div>
  );
}

interface ProposalLifecycleModalProps {
  isOpen: boolean;
  onClose: () => void;
  pending: {
    proposalId: { toString(): string };
    proposalDigest?: string;
    status: number;
    txType: number;
    targetChain: number;
    amountUsd: { toString(): string };
    recipientOrContract: string;
    decision?: { violation?: number } | null;
  };
  messageApprovalAddress?: string;
  ikaState?: "missing" | "pending" | "signed" | undefined;
  isConfidential: boolean;
  canExecute: boolean;
  canFinalize: boolean;
  canCancel: boolean;
  isExecuting: boolean;
  isFinalizing: boolean;
  isCancelling: boolean;
  error: string | null;
  onExecute: () => void;
  onFinalize: () => void;
  onCancel: () => void;
  onLifecycle: () => void;
  onDismissError: () => void;
  backendUrl: string;
}

export function ProposalLifecycleModal({
  isOpen,
  onClose,
  pending,
  messageApprovalAddress,
  ikaState,
  isConfidential,
  canExecute,
  canFinalize,
  canCancel,
  isExecuting,
  isFinalizing,
  isCancelling,
  error,
  onExecute,
  onFinalize,
  onCancel,
  onLifecycle,
  onDismissError,
  backendUrl,
}: ProposalLifecycleModalProps) {
  const [copiedRecipient, setCopiedRecipient] = useState(false);

  const chain =
    CHAINS.find((c) => c.code === pending.targetChain)?.label ?? "Unknown";
  const txType =
    TX_TYPES.find((t) => t.code === pending.txType)?.label ?? "Unknown";
  const status = PROPOSAL_STATUSES[pending.status] ?? "Unknown";
  const amountUsd = Number(pending.amountUsd.toString()) / 100;
  const propId = `PROP-${pending.proposalId.toString().padStart(4, "0")}`;

  const isTerminal =
    pending.status === STATUS_DENIED ||
    pending.status === STATUS_CANCELLED ||
    pending.status === STATUS_EXPIRED;

  const statusVariant =
    pending.status === STATUS_EXECUTED
      ? ("active" as const)
      : isTerminal
        ? ("error" as const)
        : ("paused" as const);

  // Build lifecycle steps
  const steps: { label: string; description: string; state: StepState }[] = [
    {
      label: "Proposed",
      description:
        "Transaction submitted by AI agent — awaiting policy evaluation.",
      state:
        pending.status >= STATUS_PROPOSED
          ? pending.status === STATUS_PROPOSED && !isTerminal
            ? "active"
            : "done"
          : "pending",
    },
    ...(isConfidential
      ? [
          {
            label: "FHE Evaluation",
            description:
              "Encrypted spend checked against confidential limits via Ika Encrypt.",
            state: (pending.status === STATUS_DECRYPTION_REQUESTED
              ? "active"
              : pending.status > STATUS_DECRYPTION_REQUESTED && !isTerminal
                ? "done"
                : isTerminal
                  ? "failed"
                  : "pending") as StepState,
          },
        ]
      : []),
    {
      label: "dWallet Signing",
      description:
        "approve_message CPI sent — Ika 2PC-MPC network co-signs the transaction.",
      state: (pending.status === STATUS_SIGNATURE_PENDING
        ? ikaState === "signed"
          ? "done"
          : "active"
        : pending.status > STATUS_SIGNATURE_PENDING && !isTerminal
          ? "done"
          : isTerminal
            ? "failed"
            : "pending") as StepState,
    },
    {
      label: "Finalized",
      description:
        "MessageApproval verified on-chain — proposal marked Executed.",
      state: (pending.status === STATUS_EXECUTED
        ? "done"
        : isTerminal
          ? "failed"
          : "pending") as StepState,
    },
  ];

  const copyRecipient = async () => {
    await navigator.clipboard.writeText(pending.recipientOrContract);
    setCopiedRecipient(true);
    setTimeout(() => setCopiedRecipient(false), 1500);
  };

  // Determine the primary action
  const primaryAction = isConfidential
    ? {
        label: "Open Lifecycle",
        onClick: onLifecycle,
        loading: false,
        disabled: false,
        variant: "secondary" as const,
      }
    : canExecute
      ? {
          label: "Execute",
          onClick: onExecute,
          loading: isExecuting,
          disabled: isExecuting,
          variant: "primary" as const,
        }
      : canFinalize
        ? {
            label: "Finalize",
            onClick: onFinalize,
            loading: isFinalizing,
            disabled: isFinalizing,
            variant: "primary" as const,
          }
        : null;

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="max-w-lg"
      footer={
        <div className="flex gap-2 w-full">
          {canCancel && (
            <Button
              variant="danger"
              size="medium"
              loading={isCancelling}
              disabled={isCancelling}
              onClick={onCancel}
              className="shrink-0"
            >
              Cancel Proposal
            </Button>
          )}
          <div className="flex-1" />
          <Button variant="secondary" size="medium" onClick={onClose}>
            Close
          </Button>
          {primaryAction && (
            <Button
              variant={primaryAction.variant}
              size="medium"
              loading={primaryAction.loading}
              disabled={primaryAction.disabled}
              onClick={primaryAction.onClick}
            >
              {primaryAction.label}
            </Button>
          )}
        </div>
      }
    >
      <div className="space-y-5">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <span className="mono text-[10px] uppercase tracking-[0.2em] text-(--text-muted) block mb-1">
              Proposal
            </span>
            <h3 className="text-lg font-semibold text-(--text-main) tracking-tight">
              {propId}
            </h3>
          </div>
          <StatusPill variant={statusVariant} className="mt-1">
            {status.toUpperCase()}
          </StatusPill>
        </div>

        {/* Error */}
        {error && (
          <Alert variant="error" message={error} onClose={onDismissError} />
        )}

        {/* Terminal state banner */}
        {isTerminal && (
          <m.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            className={`flex items-start gap-3 p-3 rounded-sm border ${
              pending.status === STATUS_CANCELLED
                ? "bg-(--warning-bg) border-(--warning-border)"
                : "bg-(--danger-bg) border-(--danger-border)"
            }`}
          >
            {pending.status === STATUS_EXPIRED ? (
              <Clock
                size={16}
                animateOnHover
                className="text-danger shrink-0 mt-0.5"
              />
            ) : pending.status === STATUS_DENIED ? (
              <ShieldAlert
                size={16}
                animateOnHover
                className="text-danger shrink-0 mt-0.5"
              />
            ) : (
              <Xcircle
                size={16}
                animateOnHover
                className="text-warning shrink-0 mt-0.5"
              />
            )}
            <div>
              <p className="mono text-[11px] font-bold text-(--text-main) uppercase tracking-wide mb-0.5">
                {pending.status === STATUS_EXPIRED
                  ? "Proposal Expired"
                  : pending.status === STATUS_DENIED
                    ? "Proposal Denied"
                    : "Proposal Cancelled"}
              </p>
              <p className="mono text-[10px] text-(--text-muted)">
                {pending.status === STATUS_EXPIRED
                  ? "TTL elapsed before execution. Create a new proposal."
                  : pending.status === STATUS_DENIED
                    ? `Policy engine rejected this proposal.${pending.decision?.violation ? ` Violation code: ${pending.decision.violation}` : ""}`
                    : "Cancelled by treasury owner."}
              </p>
            </div>
          </m.div>
        )}

        {/* Proposal details */}
        <div className="bg-(--card-content) border border-border rounded-sm overflow-hidden">
          <div className="px-4 py-2.5 border-b border-border">
            <span className="mono text-[9px] uppercase tracking-widest text-(--text-muted)">
              Transaction Details
            </span>
          </div>
          <div className="divide-y divide-border">
            {[
              { label: "Type", value: txType },
              { label: "Chain", value: chain },
              { label: "Amount", value: formatCurrency(amountUsd) },
            ].map(({ label, value }) => (
              <div
                key={label}
                className="flex items-center justify-between px-4 py-2.5"
              >
                <span className="mono text-[10px] text-(--text-muted) uppercase tracking-wider">
                  {label}
                </span>
                <span className="mono text-[11px] text-(--text-main)">
                  {value}
                </span>
              </div>
            ))}
            {/* Recipient with copy + explorer */}
            <div className="flex items-center justify-between px-4 py-2.5">
              <span className="mono text-[10px] text-(--text-muted) uppercase tracking-wider">
                Recipient
              </span>
              <span className="mono text-[11px] text-(--text-main) flex items-center gap-1.5">
                <Tooltip content={pending.recipientOrContract}>
                  <span>
                    {shortenAddress(pending.recipientOrContract, 6, 4)}
                  </span>
                </Tooltip>
                <Tooltip content={copiedRecipient ? "Copied!" : "Copy"}>
                  <button
                    type="button"
                    onClick={copyRecipient}
                    className="text-(--text-muted) hover:text-primary transition-colors"
                  >
                    {copiedRecipient ? (
                      <Checkcircle
                        size={11}
                        animateOnHover
                        className="text-success"
                      />
                    ) : (
                      <Copy size={11} animateOnHover />
                    )}
                  </button>
                </Tooltip>
                <Tooltip content="View on Explorer">
                  <a
                    href={`https://explorer.solana.com/address/${pending.recipientOrContract}?cluster=devnet`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-(--text-muted) hover:text-primary transition-colors"
                  >
                    <SquareArrowOutUpRight size={11} animateOnHover />
                  </a>
                </Tooltip>
              </span>
            </div>
            {/* IKA status if signing */}
            {pending.status === STATUS_SIGNATURE_PENDING && ikaState && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="mono text-[10px] text-(--text-muted) uppercase tracking-wider">
                  IKA Status
                </span>
                <Badge
                  variant={
                    ikaState === "signed"
                      ? "active"
                      : ikaState === "pending"
                        ? "paused"
                        : "default"
                  }
                  className="text-[9px]"
                >
                  {ikaState}
                </Badge>
              </div>
            )}
            {/* Proposal digest */}
            {pending.proposalDigest && (
              <HashRow
                label="Proposal Digest"
                value={pending.proposalDigest}
                kind="digest"
              />
            )}
            {/* Message approval PDA */}
            {messageApprovalAddress && (
              <HashRow
                label="Message Approval"
                value={messageApprovalAddress}
                kind="address"
              />
            )}
            {/* Confidential badge */}
            {isConfidential && (
              <div className="flex items-center justify-between px-4 py-2.5">
                <span className="mono text-[10px] text-(--text-muted) uppercase tracking-wider">
                  Mode
                </span>
                <Badge variant="paused" className="text-[9px]">
                  Scalar FHE
                </Badge>
              </div>
            )}
          </div>
        </div>

        {/* Lifecycle steps */}
        <div>
          <span className="mono text-[9px] uppercase tracking-widest text-(--text-muted) block mb-3">
            Execution Pipeline
          </span>
          <div>
            {steps.map((step, i) => (
              <Step
                key={step.label}
                label={step.label}
                description={step.description}
                state={step.state}
                isLast={i === steps.length - 1}
              />
            ))}
          </div>
        </div>

        {/* Step hint */}
        {!isTerminal && (
          <div className="p-3 bg-(--card-content) border border-border rounded-sm">
            <p className="mono text-[10px] text-(--text-muted) leading-relaxed">
              {isConfidential
                ? "Scalar FHE proposal — click Open Lifecycle to manage decryption and execution steps."
                : pending.status === STATUS_PROPOSED
                  ? `Step 1 — Click Execute to send the approve_message CPI to the dWallet. Backend: ${backendUrl}`
                  : pending.status === STATUS_DECRYPTION_REQUESTED
                    ? "Decryption in progress — waiting for Ika Encrypt network."
                    : pending.status === STATUS_SIGNATURE_PENDING
                      ? ikaState === "signed"
                        ? "Step 2 — dWallet has signed. Click Finalize to verify and close the proposal."
                        : "Waiting for Ika to co-sign — polling every 10s."
                      : pending.status === STATUS_EXECUTED
                        ? "✓ Proposal executed successfully."
                        : null}
            </p>
          </div>
        )}

        {/* Success state */}
        {pending.status === STATUS_EXECUTED && (
          <m.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-3 p-3 bg-success/10 border border-success/30 rounded-sm"
          >
            <ShieldCheck
              size={16}
              animateOnHover
              className="text-success shrink-0"
            />
            <p className="mono text-[11px] text-success font-bold uppercase tracking-wide">
              Executed successfully
            </p>
          </m.div>
        )}
      </div>
    </Modal>
  );
}
