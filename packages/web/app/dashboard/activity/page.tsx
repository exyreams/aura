"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { AnimatePresence, m } from "motion/react";
import { useMemo, useState } from "react";
import { Badge, type BadgeVariant } from "@/components/global/Badge";
import { Button } from "@/components/global/Button";
import { Dropdown } from "@/components/global/Dropdown";
import { Skeleton } from "@/components/global/Skeleton";
import { Spinner } from "@/components/global/Spinner";
import { Tabs } from "@/components/global/Tabs";
import { Tooltip } from "@/components/global/Tooltip";
import {
  Activity,
  TriangleAlert as AlertTriangle,
  Checkcircle as CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileLock,
  FileText,
  KeyRound,
  Lock,
  PenLine,
  RefreshCw,
  ScanSearch,
  Search,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SquareArrowOutUpRight,
  LockKeyholeOpen as UnlockKeyhole,
  Xcircle as XCircle,
  Zap,
} from "@/components/icons";
import {
  CHAINS,
  mapBackendEvents,
  type ParsedActivity,
  PROPOSAL_STATUSES,
  VIOLATION_DESCRIPTIONS,
  VIOLATIONS,
} from "@/lib/aura-app";
import {
  type TreasuryEntry,
  useActivity,
  useOwnedTreasuries,
} from "@/lib/hooks";
import { cn } from "@/lib/utils";

// Types

export type StepStatus = "done" | "pending" | "failed" | "skipped";

export interface ProposalStep {
  id: string;
  label: string;
  description: string;
  status: StepStatus;
  timestamp?: string;
  meta?: Record<string, string>;
  icon: React.ReactNode;
  violationRule?: string; // for policy pre-check — which rule failed
}

export interface ProposalEntry {
  id: string;
  proposalId: string;
  treasury: string;
  txSignature: string;
  outcome: "approved" | "denied" | "pending" | "cancelled";
  isConfidential: boolean;
  violationCode?: number;
  violationLabel?: string;
  timestamp: string;
  steps: ProposalStep[];
}

// Constants

const NETWORK = "devnet";
const PAGE_SIZE = 10;

// All public policy rules (indices 1–26, excluding 0=none)
// These are evaluated in order on every proposal before FHE
const ALL_POLICY_RULES = VIOLATIONS.slice(1) as readonly string[];

// Audit kinds that are proposal-related (used to enrich proposal steps)
const PROPOSAL_AUDIT_KINDS = new Set([
  "proposal_created",
  "proposal_cancelled",
  "proposal_expired",
  "decryption_requested",
  "decryption_verified",
  "proposal_denied",
  "signature_requested",
  "signature_committed",
  "proposal_executed",
]);

// Governance-specific audit kinds
const GOVERNANCE_AUDIT_KINDS = new Set([
  "multisig_attached",
  "override_executed",
  "ai_authority_rotation_proposed",
  "ai_authority_rotated",
  "config_change_proposed",
  "config_change_executed",
  "config_change_vetoed",
  "circuit_breaker_tripped",
  "circuit_breaker_reset",
  "session_key_issued",
  "session_key_revoked",
  "dead_mans_switch_triggered",
  "guardian_added",
  "guardian_removed",
  "emergency_shutdown",
  "execution_paused",
  "execution_resumed",
]);

// Parse chain from audit detail: "proposal X submitted on ethereum via graph Y"
function parseChainFromDetail(detail: string): string | undefined {
  const m = detail.match(/submitted on (\w+)/i);
  return m ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : undefined;
}

// Build meta for any audit event kind — always includes tx signature
// Specific kinds get enriched with additional parsed fields
function buildAuditStepMeta(
  rawKind: string,
  detail: string,
  txSignature: string,
  treasury: string,
  _treasuries: TreasuryEntry[],
): Record<string, string> {
  const base: Record<string, string> = {
    "Tx signature": txSignature,
    Treasury: treasury,
  };

  switch (rawKind) {
    case "dwallet_registered": {
      // detail: "dwallet_registered:chain=2,address=0x...,account=..."
      const chainMatch = detail.match(/chain=([^,]+)/);
      const addressMatch = detail.match(/address=([^,]+)/);
      const accountMatch = detail.match(/account=([^,]+)/);
      const chainCode = chainMatch?.[1] ? Number(chainMatch[1]) : undefined;
      const chainName =
        chainCode !== undefined
          ? (CHAINS.find((c) => c.code === chainCode)?.label ??
            `Chain ${chainCode}`)
          : undefined;
      return {
        ...base,
        ...(chainName ? { Chain: chainName } : {}),
        ...(addressMatch?.[1] ? { Address: addressMatch[1] } : {}),
        ...(accountMatch?.[1] ? { "dWallet Account": accountMatch[1] } : {}),
      };
    }
    case "execution_paused":
    case "execution_resumed": {
      return {
        ...base,
        Action: rawKind === "execution_paused" ? "Paused" : "Resumed",
        Detail:
          detail ||
          (rawKind === "execution_paused"
            ? "Execution paused by treasury owner"
            : "Execution resumed by treasury owner"),
      };
    }
    case "proposal_cancelled": {
      return {
        ...base,
        Detail: detail || "Proposal cancelled by treasury owner",
      };
    }
    case "ai_authority_rotation_proposed":
    case "ai_authority_rotated": {
      // detail: "ai authority rotation to <pubkey> proposed" or "ai authority rotated from X to Y"
      const toMatch = detail.match(/to (\S+)/i);
      if (toMatch) return { ...base, "New authority": toMatch[1] };
      return base;
    }
    case "circuit_breaker_tripped": {
      // detail: "circuit breaker tripped after N violations in Xs"
      return { ...base, Detail: detail };
    }
    case "guardian_added":
    case "guardian_removed": {
      // detail may contain the guardian pubkey
      return { ...base, Detail: detail };
    }
    case "session_key_issued":
    case "session_key_revoked": {
      return { ...base, Detail: detail };
    }
    case "config_change_proposed":
    case "config_change_executed":
    case "config_change_vetoed": {
      return { ...base, Detail: detail };
    }
    case "emergency_shutdown": {
      const recoveryMatch = detail.match(/recovery: (\S+)/i);
      if (recoveryMatch)
        return { ...base, "Recovery pubkey": recoveryMatch[1] };
      return { ...base, Detail: detail };
    }
    case "proposal_submitted":
    case "confidential_proposal_submitted": {
      // detail: "proposal_submitted: {...}" — parse meta from the ev.meta directly
      // The detail string contains the raw kind, actual data is in meta rows
      return { ...base, Detail: detail || "Proposal submitted to treasury" };
    }
    case "execution_submitted": {
      return {
        ...base,
        Detail: detail || "Execution submitted — awaiting Ika signature",
      };
    }
    case "execution_finalized": {
      return { ...base, Detail: detail || "Execution finalized on-chain" };
    }
    case "treasury_created": {
      // detail: "treasury_created:agentId=X,publicKey=Y"
      const agentIdMatch = detail.match(/agentId=([^,]+)/);
      const pubkeyMatch = detail.match(/publicKey=([^,]+)/);
      return {
        ...base,
        ...(agentIdMatch?.[1] ? { "Agent ID": agentIdMatch[1] } : {}),
        ...(pubkeyMatch?.[1] ? { "AI Authority": pubkeyMatch[1] } : {}),
      };
    }
    case "confidential_guardrails_configured":
    case "guardrails_configured": {
      const dailyMatch = detail.match(/daily=([^,]+)/);
      const perTxMatch = detail.match(/perTx=([^,]+)/);
      const spentMatch = detail.match(/spent=([^,]+)/);
      return {
        ...base,
        ...(dailyMatch?.[1] ? { "Daily limit ciphertext": dailyMatch[1] } : {}),
        ...(perTxMatch?.[1]
          ? { "Per-tx limit ciphertext": perTxMatch[1] }
          : {}),
        ...(spentMatch?.[1] ? { "Spent-today ciphertext": spentMatch[1] } : {}),
      };
    }
    default:
      return detail ? { ...base, Detail: detail } : base;
  }
}
// or "updated solana runtime metadata for live CPI"
// Falls back to parsing the audit string if no treasury account data available
function _parseDWalletDetail(
  detail: string,
  treasury: string,
  treasuries: TreasuryEntry[],
): Record<string, string> | undefined {
  // Try to find the matching dWallet from the treasury account
  const entry = treasuries.find((t) => t.publicKey.toBase58() === treasury);
  if (entry) {
    // Parse chain from audit detail to find the right dWallet
    const chainMatch = detail.match(
      /registered (\w+) custody|updated (\w+) runtime/i,
    );
    const chainName = (chainMatch?.[1] ?? chainMatch?.[2] ?? "").toLowerCase();
    const chainCode = CHAINS.find(
      (c) => c.label.toLowerCase() === chainName,
    )?.code;

    const dw =
      chainCode !== undefined
        ? entry.account.dwallets.find((d) => d.chain === chainCode)
        : entry.account.dwallets[0];

    if (dw) {
      const chainLabel =
        CHAINS.find((c) => c.code === dw.chain)?.label ?? `Chain ${dw.chain}`;
      const meta: Record<string, string> = {
        Chain: chainLabel,
      };
      if (dw.address) meta.Address = dw.address;
      // dWallet account PDA (the Solana on-chain account)
      if (dw.dwalletAccount)
        meta["dWallet account"] = dw.dwalletAccount.toBase58();
      if (dw.authorizedUserPubkey)
        meta["Authorized user"] = dw.authorizedUserPubkey.toBase58();
      if (dw.publicKeyHex) meta["Public key hex"] = dw.publicKeyHex;
      if (dw.balanceUsd)
        meta.Balance = `$${(Number(dw.balanceUsd.toString()) / 100).toFixed(2)}`;
      return meta;
    }
  }

  // Fallback: parse from audit string
  const regMatch = detail.match(
    /registered (\w+) custody with ([^/]+)\/(\S+)/i,
  );
  if (regMatch) {
    return {
      Chain: regMatch[1].charAt(0).toUpperCase() + regMatch[1].slice(1),
      Curve: regMatch[2],
      "Signature scheme": regMatch[3],
    };
  }
  const updateMatch = detail.match(/updated (\w+) runtime metadata/i);
  if (updateMatch) {
    return {
      Chain: updateMatch[1].charAt(0).toUpperCase() + updateMatch[1].slice(1),
      Type: "Runtime metadata update",
    };
  }
  return undefined;
}

// Audit kinds with their display config
const AUDIT_KIND_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; variant: BadgeVariant }
> = {
  treasury_created: {
    label: "Treasury Created",
    icon: <Shield size={14} animateOnHover />,
    variant: "active",
  },
  dwallet_registered: {
    label: "dWallet Registered",
    icon: <Lock size={14} animateOnHover />,
    variant: "active",
  },
  confidential_guardrails_configured: {
    label: "FHE Guardrails Configured",
    icon: <KeyRound size={14} animateOnHover />,
    variant: "active",
  },
  execution_paused: {
    label: "Execution Paused",
    icon: <AlertTriangle size={14} animateOnHover />,
    variant: "paused",
  },
  execution_resumed: {
    label: "Execution Resumed",
    icon: <CheckCircle2 size={14} animateOnHover />,
    variant: "active",
  },
  multisig_attached: {
    label: "Multisig Attached",
    icon: <Shield size={14} animateOnHover />,
    variant: "default",
  },
  swarm_attached: {
    label: "Swarm Attached",
    icon: <Zap size={14} animateOnHover />,
    variant: "default",
  },
  override_executed: {
    label: "Override Executed",
    icon: <Settings size={14} animateOnHover />,
    variant: "paused",
  },
  ai_authority_rotation_proposed: {
    label: "AI Rotation Proposed",
    icon: <RefreshCw size={14} animateOnHover />,
    variant: "paused",
  },
  ai_authority_rotated: {
    label: "AI Authority Rotated",
    icon: <RefreshCw size={14} animateOnHover />,
    variant: "active",
  },
  config_change_proposed: {
    label: "Config Change Proposed",
    icon: <Settings size={14} animateOnHover />,
    variant: "paused",
  },
  config_change_executed: {
    label: "Config Change Executed",
    icon: <Settings size={14} animateOnHover />,
    variant: "active",
  },
  config_change_vetoed: {
    label: "Config Change Vetoed",
    icon: <XCircle size={14} animateOnHover />,
    variant: "error",
  },
  circuit_breaker_tripped: {
    label: "Circuit Breaker Tripped",
    icon: <AlertTriangle size={14} animateOnHover />,
    variant: "error",
  },
  circuit_breaker_reset: {
    label: "Circuit Breaker Reset",
    icon: <CheckCircle2 size={14} animateOnHover />,
    variant: "active",
  },
  session_key_issued: {
    label: "Session Key Issued",
    icon: <KeyRound size={14} animateOnHover />,
    variant: "default",
  },
  session_key_revoked: {
    label: "Session Key Revoked",
    icon: <XCircle size={14} animateOnHover />,
    variant: "paused",
  },
  dead_mans_switch_triggered: {
    label: "Dead Man's Switch Triggered",
    icon: <AlertTriangle size={14} animateOnHover />,
    variant: "error",
  },
  agent_state_transitioned: {
    label: "Agent State Transitioned",
    icon: <Activity size={14} animateOnHover />,
    variant: "default",
  },
  guardian_added: {
    label: "Guardian Added",
    icon: <Shield size={14} animateOnHover />,
    variant: "active",
  },
  guardian_removed: {
    label: "Guardian Removed",
    icon: <Shield size={14} animateOnHover />,
    variant: "paused",
  },
  emergency_shutdown: {
    label: "Emergency Shutdown",
    icon: <AlertTriangle size={14} animateOnHover />,
    variant: "error",
  },
  fee_collected: {
    label: "Fee Collected",
    icon: <CheckCircle2 size={14} animateOnHover />,
    variant: "default",
  },
  snapshot_taken: {
    label: "Snapshot Taken",
    icon: <FileText size={14} animateOnHover />,
    variant: "default",
  },
  swarm_pool_joined: {
    label: "Swarm Pool Joined",
    icon: <Zap size={14} animateOnHover />,
    variant: "active",
  },
  balance_refreshed: {
    label: "Balance Refreshed",
    icon: <RefreshCw size={14} animateOnHover />,
    variant: "default",
  },
  proposal_submitted: {
    label: "Proposal Submitted",
    icon: <Send size={14} animateOnHover />,
    variant: "active",
  },
  confidential_proposal_submitted: {
    label: "Confidential Proposal",
    icon: <Lock size={14} animateOnHover />,
    variant: "active",
  },
  execution_submitted: {
    label: "Execution Submitted",
    icon: <Send size={14} animateOnHover />,
    variant: "active",
  },
  execution_finalized: {
    label: "Execution Finalized",
    icon: <CheckCircle2 size={14} animateOnHover />,
    variant: "active",
  },
  instruction_sent: {
    label: "Playground",
    icon: <Zap size={14} animateOnHover />,
    variant: "default",
  },
};

// Helpers

function explorerTxUrl(sig: string) {
  return `https://explorer.solana.com/tx/${sig}?cluster=${NETWORK}`;
}
function violationLabel(code: number): string {
  return VIOLATIONS[code] ?? `violation #${code}`;
}
function statusLabel(code: number): string {
  return PROPOSAL_STATUSES[code] ?? `status #${code}`;
}

function shortenHash(h: string, head = 6, tail = 6) {
  if (h.length <= head + tail + 3) return h;
  return `${h.slice(0, head)}...${h.slice(-tail)}`;
}

function outcomeVariant(outcome: ProposalEntry["outcome"]): BadgeVariant {
  switch (outcome) {
    case "approved":
      return "active";
    case "denied":
      return "error";
    case "cancelled":
      return "paused";
    default:
      return "default";
  }
}

function proposalIconClass(
  steps: ProposalStep[],
  outcome: ProposalEntry["outcome"],
): string {
  if (outcome === "denied" || outcome === "cancelled") return "text-danger";
  if (outcome === "approved") return "text-success";
  if (steps.some((s) => s.status === "failed")) return "text-danger";
  return "text-primary";
}

function stepIconClass(status: StepStatus) {
  switch (status) {
    case "done":
      return "text-success";
    case "failed":
      return "text-danger";
    case "skipped":
      return "text-(--text-muted) opacity-40";
    case "pending":
      return "text-primary animate-pulse";
  }
}

function fmtTime(ts: number | undefined): string | undefined {
  if (!ts) return undefined;
  return new Date(ts * 1000).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function fmtDateTime(ts: number | undefined): string {
  if (!ts) return "Unknown";
  return new Date(ts * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapToProposalEntries(
  events: ParsedActivity[],
  treasuries: TreasuryEntry[] = [],
): ProposalEntry[] {
  const entries: ProposalEntry[] = [];

  // 1. Group proposal/execution events by treasury:proposalId
  const byProposal = new Map<string, ParsedActivity[]>();
  for (const ev of events) {
    if ((ev.kind === "proposal" || ev.kind === "execution") && ev.proposalId) {
      const key = `${ev.treasury}:${ev.proposalId}`;
      if (!byProposal.has(key)) byProposal.set(key, []);
      byProposal.get(key)?.push(ev);
    }
  }

  // 2. Group audit events by treasury
  const auditByTreasury = new Map<string, ParsedActivity[]>();
  for (const ev of events) {
    if (ev.kind === "audit") {
      if (!auditByTreasury.has(ev.treasury))
        auditByTreasury.set(ev.treasury, []);
      auditByTreasury.get(ev.treasury)?.push(ev);
    }
  }

  // 3. Build ProposalEntry for each proposal group
  for (const [key, group] of byProposal) {
    const treasury = key.split(":")[0];
    const sorted = [...group].sort(
      (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
    );
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    // Find matching audit events for this proposal
    const proposalAudits = (auditByTreasury.get(treasury) ?? [])
      .filter((a) => {
        const detail = a.detail ?? "";
        const pid = first.proposalId ?? "";
        return (
          PROPOSAL_AUDIT_KINDS.has(detail.split(":")[0]?.trim()) &&
          (detail.includes(`proposal ${pid}`) || detail.includes(`#${pid}`))
        );
      })
      .sort((a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0));

    const outcome: ProposalEntry["outcome"] =
      // Check any event in the group for a definitive outcome
      sorted.some((e) => e.approved === true)
        ? "approved"
        : sorted.some((e) => e.status === 5 || e.status === 6)
          ? "cancelled"
          : sorted.some((e) => e.approved === false)
            ? "denied"
            : last.status === 5
              ? "cancelled"
              : last.status === 6
                ? "cancelled"
                : "pending";

    // Find violation from any event in the group (proposal_submitted has it, last may not)
    const groupViolation =
      sorted.find((e) => e.violation != null && e.violation > 0)?.violation ??
      last.violation;

    // Build steps
    const steps: ProposalStep[] = [];

    // Find audit detail for proposal_created
    const createdAudit = proposalAudits.find((a) =>
      a.detail?.startsWith("proposal_created"),
    );
    const createdDetail =
      createdAudit?.detail?.split(":").slice(1).join(":").trim() ??
      "AI authority submitted the transaction proposal";
    const chain = parseChainFromDetail(createdDetail);

    steps.push({
      id: "propose",
      label: "Proposed",
      description: createdDetail,
      status: "done",
      timestamp: fmtTime(first.timestamp),
      icon: <Send size={13} animateOnHover />,
      meta: {
        ...(chain ? { Chain: chain } : {}),
        ...(first.proposalDigest
          ? { "Proposal digest": first.proposalDigest }
          : {}),
        Treasury: first.treasury,
        "Tx signature": first.txSignature,
      },
    });

    // Policy pre-check — show all 26 real rule names, highlight failed one
    const failedRule =
      groupViolation && groupViolation > 0
        ? (VIOLATIONS[groupViolation] ?? undefined)
        : undefined;

    // Build meta: each rule as a key with pass/fail value
    const precheckMeta: Record<string, string> = {};
    for (const rule of ALL_POLICY_RULES) {
      precheckMeta[rule] =
        rule === failedRule
          ? `FAILED — ${VIOLATION_DESCRIPTIONS[rule] ?? ""}`
          : "passed";
    }

    steps.push({
      id: "precheck",
      label: "Policy pre-check",
      description: failedRule
        ? `Denied at rule: ${failedRule} — ${VIOLATION_DESCRIPTIONS[failedRule] ?? ""}`
        : "All 26 public rules passed — velocity, slippage, oracle quote freshness, protocol bitmap, time windows, anomaly detection",
      status: failedRule ? "failed" : "done",
      icon: <ScanSearch size={13} animateOnHover />,
      meta: precheckMeta,
      // Pass violation info for badge rendering
      violationRule: failedRule,
    } as ProposalStep & { violationRule?: string });

    // FHE path — check if decryption was requested
    // Check both on-chain audit events AND our backend-written decryption events in sorted
    const decryptRequestEvent = sorted.find(
      (e) =>
        e.kind === "proposal" && e.detail?.startsWith("decryption_requested"),
    );
    const decryptConfirmEvent = sorted.find(
      (e) =>
        e.kind === "proposal" && e.detail?.startsWith("decryption_verified"),
    );
    const hasDecryption =
      sorted.some((e) => e.status === 1 || e.status === 7) ||
      proposalAudits.some((a) =>
        a.detail?.startsWith("decryption_requested"),
      ) ||
      !!decryptRequestEvent ||
      // confidential_proposal_submitted always has FHE
      sorted.some(
        (e) =>
          e.detail?.startsWith("proposal_submitted") &&
          e.detail?.includes("confidential"),
      );

    if (hasDecryption) {
      const decryptAudit =
        proposalAudits.find(
          (a) =>
            a.detail?.startsWith("decryption_verified") ||
            a.detail?.startsWith("decryption_requested"),
        ) ?? decryptRequestEvent;

      const decryptDone =
        !!decryptConfirmEvent ||
        proposalAudits.some((a) => a.detail?.startsWith("decryption_verified"));
      const requestDone =
        !!decryptRequestEvent ||
        proposalAudits.some((a) =>
          a.detail?.startsWith("decryption_requested"),
        );

      steps.push({
        id: "fhe",
        label: "FHE Evaluation",
        description:
          outcome === "cancelled"
            ? "Skipped — proposal was cancelled by treasury owner"
            : "Encrypted amount evaluated against confidential limits via Ika Encrypt — violation code ciphertext produced",
        status:
          outcome === "cancelled"
            ? "skipped"
            : requestDone
              ? "done"
              : outcome === "denied"
                ? "done"
                : "pending",
        timestamp: fmtTime(decryptAudit?.timestamp),
        icon: <FileLock size={13} animateOnHover />,
        meta:
          outcome === "cancelled"
            ? undefined
            : (() => {
                const d = decryptRequestEvent?.detail ?? "";
                const parts = d.split("|");
                const paramPart = parts[1] ?? "";
                const ciphertextMatch = paramPart.match(/ciphertext=([^,]+)/);
                const requestMatch = paramPart.match(/requestAccount=([^,]+)/);
                const txSigMatch = paramPart.match(/txSignature=([^,]+)/);
                const result: Record<string, string> = {};
                if (ciphertextMatch?.[1])
                  result["Policy output ciphertext"] = ciphertextMatch[1];
                if (requestMatch?.[1])
                  result["Decryption request account"] = requestMatch[1];
                // Prefer the explicit tx sig from the event; fall back to the event's own sig
                const fheTxSig =
                  txSigMatch?.[1] ?? decryptRequestEvent?.txSignature;
                if (fheTxSig) result["Tx signature"] = fheTxSig;
                result["Encryption network"] = "Ika Encrypt (pre-alpha-dev-1)";
                result.Mode = "Scalar FHE — 3 ciphertexts";
                return result;
              })(),
      });

      // Parse decryption-confirmed event detail for its own tx sig + violation code
      const decryptConfirmDetail = decryptConfirmEvent?.detail ?? "";
      const decryptConfirmParams = decryptConfirmDetail.split("|")[1] ?? "";
      const confirmTxSigMatch =
        decryptConfirmParams.match(/txSignature=([^,]+)/);
      const confirmRequestMatch = decryptConfirmParams.match(
        /requestAccount=([^,]+)/,
      );
      const confirmViolationCodeMatch = decryptConfirmParams.match(
        /violationCode=([^,]+)/,
      );
      const confirmTxSig =
        confirmTxSigMatch?.[1] ?? decryptConfirmEvent?.txSignature;

      steps.push({
        id: "decrypt",
        label: "Decryption",
        description:
          outcome === "cancelled"
            ? "Skipped — proposal was cancelled by treasury owner"
            : outcome === "denied" && groupViolation && groupViolation > 0
              ? `Policy decryption confirmed — violation code ${groupViolation} (${violationLabel(groupViolation)}) resolved`
              : "Policy output ciphertext decrypted — violation code resolved on-chain",
        status:
          outcome === "cancelled"
            ? "skipped"
            : decryptDone
              ? "done"
              : outcome === "denied"
                ? "done"
                : requestDone
                  ? "pending"
                  : ("upcoming" as StepStatus),
        timestamp: fmtTime(
          decryptConfirmEvent?.timestamp ?? decryptAudit?.timestamp,
        ),
        icon: <UnlockKeyhole size={13} animateOnHover />,
        meta:
          outcome === "cancelled"
            ? undefined
            : {
                "Violation code":
                  groupViolation && groupViolation > 0
                    ? `${groupViolation} (${violationLabel(groupViolation)})`
                    : outcome === "denied"
                      ? "Denied by FHE policy evaluation"
                      : "0 (approved)",
                ...(confirmRequestMatch?.[1]
                  ? { "Decryption request account": confirmRequestMatch[1] }
                  : {}),
                ...(confirmViolationCodeMatch?.[1] &&
                confirmViolationCodeMatch[1] !== "null" &&
                confirmViolationCodeMatch[1] !== ""
                  ? { "Raw violation ciphertext": confirmViolationCodeMatch[1] }
                  : {}),
                ...(confirmTxSig ? { "Tx signature": confirmTxSig } : {}),
                ...(last.proposalDigest
                  ? { "Proposal digest": last.proposalDigest }
                  : {}),
              },
      });
    }

    // dWallet signing
    const execEvent =
      sorted.find((e) => e.kind === "execution" && e.messageApprovalAccount) ??
      sorted.find((e) => e.kind === "execution");
    const sigAudit = proposalAudits.find(
      (a) =>
        a.detail?.startsWith("signature_requested") ||
        a.detail?.startsWith("signature_committed"),
    );
    const sigStatus: StepStatus =
      outcome === "approved"
        ? "done"
        : outcome === "denied" || outcome === "cancelled"
          ? "skipped"
          : "pending";

    steps.push({
      id: "sign",
      label: "dWallet signing",
      description:
        sigStatus === "skipped"
          ? outcome === "cancelled"
            ? "Skipped — proposal was cancelled by treasury owner"
            : "Skipped — proposal was denied before reaching dWallet signing"
          : "approve_message CPI submitted — Ika 2PC-MPC network co-signed the chain message",
      status: sigStatus,
      timestamp: fmtTime(sigAudit?.timestamp),
      icon: <PenLine size={13} animateOnHover />,
      meta: execEvent?.messageApprovalAccount
        ? {
            "Message approval PDA": execEvent.messageApprovalAccount,
            Explorer: `https://explorer.solana.com/address/${execEvent.messageApprovalAccount}?cluster=devnet`,
            ...(execEvent.decryptionRequestAccount
              ? {
                  "Decryption request PDA": execEvent.decryptionRequestAccount,
                }
              : {}),
            "Signing network": "Ika 2PC-MPC (pre-alpha-dev-1)",
            "Signature scheme": "ECDSA / Keccak256 or EdDSA",
          }
        : undefined,
    });

    // Finalize
    const finalStatus: StepStatus =
      outcome === "approved"
        ? "done"
        : outcome === "denied"
          ? "skipped"
          : outcome === "cancelled"
            ? "skipped"
            : "pending";

    const finalAudit = proposalAudits.find(
      (a) =>
        a.detail?.startsWith("proposal_executed") ||
        a.detail?.startsWith("proposal_denied") ||
        a.detail?.startsWith("proposal_cancelled"),
    );

    steps.push({
      id: "finalize",
      label:
        outcome === "denied"
          ? "Rejected"
          : outcome === "cancelled"
            ? "Cancelled"
            : "Finalized",
      description:
        outcome === "approved"
          ? "finalize_execution verified MessageApproval account — proposal marked Executed on-chain"
          : outcome === "denied"
            ? `Proposal rejected — policy rule violated: ${groupViolation ? violationLabel(groupViolation) : "unknown"}`
            : outcome === "cancelled"
              ? "Proposal cancelled by treasury owner"
              : "Proposal cancelled or expired",
      status: finalStatus,
      timestamp: fmtTime(finalAudit?.timestamp ?? last.timestamp),
      icon:
        outcome === "approved" ? (
          <CheckCircle2 size={13} animateOnHover />
        ) : outcome === "denied" || outcome === "cancelled" ? (
          <XCircle size={13} animateOnHover />
        ) : (
          <CheckCircle2 size={13} animateOnHover />
        ),
      meta: {
        "Final status":
          outcome === "denied"
            ? "Rejected"
            : outcome === "cancelled"
              ? "Cancelled"
              : outcome === "approved"
                ? "Executed"
                : statusLabel(last.status ?? 0),
        ...(groupViolation && groupViolation > 0
          ? {
              "Violation code": `${groupViolation} — ${violationLabel(groupViolation)}`,
              "Rule description":
                VIOLATION_DESCRIPTIONS[violationLabel(groupViolation)] ?? "",
            }
          : {}),
        ...(first.proposalDigest
          ? { "Proposal digest": first.proposalDigest }
          : {}),
        ...(execEvent?.messageApprovalAccount
          ? { "Message approval": execEvent.messageApprovalAccount }
          : {}),
        "Tx signature": last.txSignature,
      },
    });

    // Detect confidential from event kind — most reliable signal
    const isConfidential =
      sorted.some(
        (e) =>
          e.detail?.startsWith("proposal_submitted") &&
          e.detail?.includes("confidential"),
      ) || hasDecryption;

    entries.push({
      id: `${first.treasury}:${first.proposalId}`,
      proposalId: first.proposalId ?? "",
      treasury: first.treasury,
      txSignature: first.txSignature,
      outcome,
      isConfidential,
      violationCode: groupViolation,
      violationLabel:
        groupViolation && groupViolation > 0
          ? violationLabel(groupViolation)
          : undefined,
      timestamp: fmtDateTime(first.timestamp),
      steps,
    });
  }

  // 4. Non-proposal audit events as standalone entries
  const _usedTreasuries = new Set(
    [...byProposal.keys()].map((k) => k.split(":")[0]),
  );

  for (const [treasury, audits] of auditByTreasury) {
    const nonProposalAudits = audits.filter(
      (a) => !PROPOSAL_AUDIT_KINDS.has(a.detail?.split(":")[0]?.trim() ?? ""),
    );

    for (const ev of nonProposalAudits) {
      const rawKind = ev.detail?.split(":")[0]?.trim() ?? "audit";
      const detail = ev.detail?.split(":").slice(1).join(":").trim() ?? "";
      const cfg = AUDIT_KIND_CONFIG[rawKind];

      const stepMeta = buildAuditStepMeta(
        rawKind,
        detail,
        ev.txSignature,
        treasury,
        treasuries,
      );

      entries.push({
        id: ev.signature,
        proposalId: "",
        treasury,
        txSignature: ev.txSignature,
        outcome: "approved",
        isConfidential: false,
        timestamp: fmtDateTime(ev.timestamp),
        steps: [
          {
            id: rawKind,
            label: cfg?.label ?? rawKind.replace(/_/g, " ").toUpperCase(),
            description: detail || rawKind,
            status: "done",
            timestamp: fmtTime(ev.timestamp),
            icon: cfg?.icon ?? <Activity size={13} animateOnHover />,
            meta: stepMeta,
          },
        ],
      });
    }
  }

  // Sort by timestamp descending
  return entries.sort((a, b) => {
    const ta = events.find((e) => e.treasury === a.treasury)?.timestamp ?? 0;
    const tb = events.find((e) => e.treasury === b.treasury)?.timestamp ?? 0;
    return tb - ta;
  });
}

// HashAction — copy + optional explorer link shown on hover

function isHashLike(key: string, value: string): boolean {
  const k = key.toLowerCase();
  // Never treat URLs or plain text as hashes
  if (value.startsWith("http") || value.startsWith("https")) return false;
  // Skip keys that are clearly not hashes
  if (
    k === "explorer" ||
    k === "signing network" ||
    k === "signature scheme" ||
    k === "action" ||
    k === "detail" ||
    k === "chain" ||
    k === "type"
  )
    return false;
  if (
    k.includes("signature") ||
    k.includes("digest") ||
    k.includes("treasury") ||
    k.includes("approval") ||
    k.includes("request") ||
    k.includes("account") ||
    k.includes("pda") ||
    k.includes("hash")
  )
    return true;
  if (/^[1-9A-HJ-NP-Za-km-z]{32,}$/.test(value)) return true;
  if (/^(0x)?[0-9a-fA-F]{32,}$/.test(value)) return true;
  return false;
}

type HashKind = "tx" | "address" | "digest" | "copy";

function detectKind(key: string, value: string): HashKind {
  const k = key.toLowerCase();
  if (k.includes("signature") || k.includes("tx sig")) return "tx";
  if (
    k.includes("treasury") ||
    k.includes("approval") ||
    k.includes("request") ||
    k.includes("account")
  )
    return "address";
  if (k.includes("digest")) return "digest";
  if (value.length >= 43 && /^[1-9A-HJ-NP-Za-km-z]+$/.test(value))
    return "address";
  return "copy";
}

function HashAction({ value, metaKey }: { value: string; metaKey: string }) {
  const [copied, setCopied] = useState(false);
  const kind = detectKind(metaKey, value);
  const explorerUrl =
    kind === "tx"
      ? `https://explorer.solana.com/tx/${value}?cluster=devnet`
      : kind === "address"
        ? `https://explorer.solana.com/address/${value}?cluster=devnet`
        : null;

  return (
    <span className="inline-flex items-center gap-1 shrink-0">
      <Tooltip content={copied ? "Copied!" : "Copy"}>
        <button
          type="button"
          onClick={async (e) => {
            e.stopPropagation();
            await navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="text-(--text-muted) hover:text-primary transition-colors cursor-pointer"
        >
          {copied ? (
            <CheckCircle2 size={11} className="text-success" animateOnHover />
          ) : (
            <Copy size={11} animateOnHover />
          )}
        </button>
      </Tooltip>
      {explorerUrl && (
        <Tooltip content="Open in Explorer">
          <span className="text-(--text-muted) hover:text-primary transition-colors">
            <a
              href={explorerUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="text-(--text-muted) hover:text-primary transition-colors"
            >
              <SquareArrowOutUpRight size={11} animateOnHover />
            </a>
          </span>
        </Tooltip>
      )}
    </span>
  );
}

// CopyButton

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async (e) => {
        e.stopPropagation();
        await navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-(--text-muted) hover:text-primary transition-colors shrink-0"
    >
      {copied ? (
        <CheckCircle2 size={11} className="text-success" animateOnHover />
      ) : (
        <Copy size={11} animateOnHover />
      )}
    </button>
  );
}

// StepRow

function StepRow({
  step,
  isLast,
  hideSpine = false,
}: {
  step: ProposalStep;
  isLast: boolean;
  hideSpine?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const hasMeta = step.meta && Object.keys(step.meta).length > 0;

  return (
    <div className="flex gap-3">
      {!hideSpine && (
        <div className="flex flex-col items-center shrink-0 w-5">
          <div className={cn("shrink-0 mt-0.5", stepIconClass(step.status))}>
            {step.status === "pending" ? (
              <Spinner size="xs" className="text-primary" />
            ) : (
              step.icon
            )}
          </div>
          {!isLast && (
            <div className="w-px flex-1 bg-border mt-1 min-h-[16px]" />
          )}
        </div>
      )}
      <div className={cn("flex-1 min-w-0", isLast ? "pb-0" : "pb-3")}>
        <button
          type="button"
          disabled={!hasMeta}
          className={cn(
            "w-full flex items-start justify-between gap-2 mb-0.5 rounded-sm px-2 py-1 -mx-2 transition-colors text-left",
            hasMeta
              ? "cursor-pointer hover:bg-(--accordion-hover)"
              : "cursor-default",
          )}
          onClick={() => hasMeta && setOpen((o) => !o)}
        >
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={cn(
                "font-mono text-[10px] font-bold uppercase tracking-wide",
                step.status === "skipped"
                  ? "text-(--text-muted) line-through"
                  : "text-(--text-main)",
              )}
            >
              {step.label}
            </span>
            {step.timestamp && (
              <span className="font-mono text-[9px] text-(--text-muted)">
                {step.timestamp}
              </span>
            )}
          </div>
          {hasMeta && (
            <m.div
              animate={{ rotate: open ? 180 : 0 }}
              transition={{ duration: 0.2, ease: "easeInOut" }}
              className="shrink-0"
            >
              <ChevronDown size={12} className="text-(--text-muted)" />
            </m.div>
          )}
        </button>

        {!hasMeta && (
          <p className="font-mono text-[10px] text-(--text-muted) leading-relaxed mt-0.5">
            {step.description}
          </p>
        )}

        <AnimatePresence initial={false}>
          {open && hasMeta && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              <div
                className="mt-1 border border-border rounded-sm overflow-hidden"
                style={{ background: "var(--accordion-bg)" }}
              >
                <div className="px-3 py-2.5 border-b border-border">
                  <p className="font-mono text-[10px] text-(--text-muted) leading-relaxed">
                    {step.description}
                  </p>
                </div>
                <div
                  className="px-3 py-2.5 space-y-1.5"
                  style={{ background: "var(--accordion-content)" }}
                >
                  {/* Policy pre-check: render as rule badges */}
                  {step.id === "precheck" && step.meta ? (
                    <div className="flex flex-wrap gap-1.5">
                      {Object.entries(step.meta).map(([rule, result]) => {
                        const isFailed = result.startsWith("FAILED");
                        const allPassed = !step.violationRule;
                        const desc = VIOLATION_DESCRIPTIONS[rule] ?? rule;
                        return (
                          <Tooltip key={rule} content={desc}>
                            <span
                              className={cn(
                                "font-mono text-[9px] px-2 py-0.5 rounded-sm border cursor-default transition-colors",
                                isFailed
                                  ? "border-danger bg-danger/10 text-danger"
                                  : allPassed
                                    ? "border-success/40 bg-success/10 text-success hover:border-success hover:bg-success/20"
                                    : "border-border bg-(--card-bg) text-(--text-muted) hover:border-primary hover:text-primary",
                              )}
                            >
                              {rule}
                            </span>
                          </Tooltip>
                        );
                      })}
                    </div>
                  ) : (
                    Object.entries(step.meta ?? {}).map(([k, v]) => (
                      <div
                        key={k}
                        className="flex items-start gap-2 sm:gap-3 font-mono text-[10px]"
                      >
                        <span className="text-(--text-muted) w-24 sm:w-36 shrink-0">
                          {k}
                        </span>
                        <div className="flex-1 min-w-0 flex items-center gap-1.5">
                          {k.toLowerCase() === "explorer" &&
                          v.startsWith("http") ? (
                            <a
                              href={v}
                              target="_blank"
                              rel="noreferrer"
                              className="text-primary hover:underline truncate flex items-center gap-1"
                            >
                              {v.replace(/^https?:\/\//, "").slice(0, 60)}
                              <SquareArrowOutUpRight size={10} animateOnHover />
                            </a>
                          ) : (
                            <>
                              <span
                                className="text-(--text-main) truncate"
                                title={v}
                              >
                                {v}
                              </span>
                              {isHashLike(k, v) && (
                                <HashAction value={v} metaKey={k} />
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// ProposalRow
function ProposalRow({
  entry,
  isLast,
}: {
  entry: ProposalEntry;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const isProposal = entry.proposalId !== "";
  const isConfidential = isProposal && entry.isConfidential;
  const iconColorClass = proposalIconClass(entry.steps, entry.outcome);
  const cfg =
    !isProposal && entry.steps[0]
      ? (AUDIT_KIND_CONFIG[entry.steps[0].id] ?? null)
      : null;

  const outcomeIcon =
    entry.outcome === "approved" ? (
      <ShieldCheck size={18} className={iconColorClass} animateOnHover />
    ) : entry.outcome === "denied" ? (
      <ShieldAlert size={18} className={iconColorClass} animateOnHover />
    ) : entry.outcome === "cancelled" ? (
      <XCircle size={18} className="text-(--text-muted)" animateOnHover />
    ) : isProposal ? (
      isConfidential ? (
        <FileLock size={18} className={iconColorClass} animateOnHover />
      ) : (
        <FileText size={18} className={iconColorClass} animateOnHover />
      )
    ) : cfg?.icon ? (
      <span className={cn("text-(--text-muted)")}>{cfg.icon}</span>
    ) : (
      <Activity size={18} className="text-(--text-muted)" animateOnHover />
    );

  return (
    <div className="flex gap-3 sm:gap-4">
      <div className="flex flex-col items-center shrink-0 w-7 sm:w-8">
        <div className="mt-1 size-6 sm:size-7 flex items-center justify-center z-10 shrink-0">
          {outcomeIcon}
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-1 min-h-[24px]" />}
      </div>
      <div className="flex-1 pb-6 sm:pb-8 min-w-0">
        {/* Header */}
        <button
          type="button"
          className="w-full flex items-start justify-between gap-2 sm:gap-3 mb-1.5 cursor-pointer rounded-sm px-2 sm:px-3 py-2 -mx-2 sm:-mx-3 transition-colors text-left hover:bg-(--accordion-hover)"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap min-w-0">
            <span className="font-mono text-[10px] sm:text-[11px] font-bold text-(--text-main) uppercase tracking-wide">
              {isProposal
                ? `Proposal #${entry.proposalId}`
                : (cfg?.label ?? entry.steps[0]?.label ?? "Audit Event")}
            </span>
            {isProposal && isConfidential && (
              <Badge
                variant="default"
                className="text-[9px] px-1.5 py-0.5 flex items-center gap-1"
              >
                <FileLock size={9} animateOnHover />
                Confidential
              </Badge>
            )}
            {isProposal && (
              <Badge
                variant={outcomeVariant(entry.outcome)}
                className="text-[9px] px-1.5 sm:px-2 py-0.5"
              >
                {entry.outcome}
              </Badge>
            )}
            {!isProposal && cfg && (
              <Badge
                variant={
                  entry.steps[0]?.id === "execution_submitted"
                    ? "paused"
                    : cfg.variant
                }
                className="text-[9px] px-1.5 sm:px-2 py-0.5"
              >
                {entry.steps[0]?.id === "execution_submitted"
                  ? "Pending"
                  : "Success"}
              </Badge>
            )}
            {!isProposal && entry.steps[0]?.id === "instruction_sent" && (
              <Badge
                variant="default"
                className="text-[9px] px-1.5 py-0.5 flex items-center gap-1"
              >
                <Zap size={9} animateOnHover />
                Playground
              </Badge>
            )}
            {entry.violationLabel && (
              <Badge
                variant="error"
                className="text-[9px] px-1.5 sm:px-2 py-0.5 flex items-center gap-1"
              >
                <ShieldAlert size={9} />
                {entry.violationLabel}
              </Badge>
            )}
          </div>
          <m.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="shrink-0 mt-0.5"
          >
            <ChevronDown size={14} className="text-(--text-muted)" />
          </m.div>
        </button>

        {/* Meta row */}
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap font-mono text-[10px] text-(--text-muted) mb-2">
          <Tooltip content={entry.treasury}>
            <span className="flex items-center gap-1">
              {shortenHash(entry.treasury, 4, 4)}
              <CopyButton value={entry.treasury} />
            </span>
          </Tooltip>
          <span className="text-border select-none hidden sm:inline">·</span>
          <Tooltip content={entry.txSignature}>
            <span className="flex items-center gap-1">
              {shortenHash(entry.txSignature, 4, 4)}
              <CopyButton value={entry.txSignature} />
              <a
                href={explorerTxUrl(entry.txSignature)}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-(--text-muted) hover:text-primary transition-colors"
              >
                <SquareArrowOutUpRight size={10} animateOnHover />
              </a>
            </span>
          </Tooltip>
          <span className="text-border select-none hidden sm:inline">·</span>
          <span className="font-mono text-[10px] text-(--text-muted)">
            {entry.timestamp}
          </span>
        </div>

        {/* Expanded content */}
        <AnimatePresence initial={false}>
          {expanded && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.25, ease: [0.4, 0, 0.2, 1] }}
              className="overflow-hidden"
            >
              {isProposal ? (
                /* Multi-step proposals get the outer card wrapper */
                <div
                  className="mt-1 px-4 py-3 border border-border rounded-sm"
                  style={{ background: "var(--accordion-bg)" }}
                >
                  {entry.steps.map((step, i) => (
                    <StepRow
                      key={step.id}
                      step={step}
                      isLast={i === entry.steps.length - 1}
                    />
                  ))}
                </div>
              ) : (
                /* Single-step audit entries — render meta directly, no repeated label */
                (() => {
                  const step = entry.steps[0];
                  if (!step) return null;
                  const hasMeta =
                    step.meta && Object.keys(step.meta).length > 0;
                  return (
                    <div
                      className="mt-1 border border-border rounded-sm overflow-hidden"
                      style={{ background: "var(--accordion-bg)" }}
                    >
                      <div className="px-3 py-2.5 border-b border-border">
                        <p className="font-mono text-[10px] text-(--text-muted) leading-relaxed">
                          {step.description}
                        </p>
                      </div>
                      {hasMeta && (
                        <div
                          className="px-3 py-2.5 space-y-1.5"
                          style={{ background: "var(--accordion-content)" }}
                        >
                          {Object.entries(step.meta ?? {}).map(([k, v]) => (
                            <div
                              key={k}
                              className="flex items-start gap-2 sm:gap-3 font-mono text-[10px]"
                            >
                              <span className="text-(--text-muted) w-24 sm:w-36 shrink-0">
                                {k}
                              </span>
                              <div className="flex-1 min-w-0 flex items-center gap-1.5">
                                <span
                                  className="text-(--text-main) truncate"
                                  title={v}
                                >
                                  {v}
                                </span>
                                {isHashLike(k, v) && (
                                  <HashAction value={v} metaKey={k} />
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()
              )}
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// Timeline

function Timeline({
  items,
  isLoading,
}: {
  items: ProposalEntry[];
  isLoading: boolean;
}) {
  if (isLoading) {
    return (
      <div className="space-y-0 py-2">
        {Array.from({ length: 5 }, (_, i) => `sk-${i}`).map((k, i) => (
          <div key={k} className="flex gap-3 sm:gap-4">
            {/* Icon + spine */}
            <div className="flex flex-col items-center shrink-0 w-7 sm:w-8">
              <Skeleton className="mt-1 size-6 sm:size-7 rounded-full shrink-0" />
              {i < 4 && (
                <div className="w-px flex-1 bg-border mt-1 min-h-[60px]" />
              )}
            </div>
            {/* Content */}
            <div className="flex-1 pb-8 min-w-0 space-y-2 pt-1">
              {/* Title row: label + badge */}
              <div className="flex items-center gap-2 flex-wrap">
                <Skeleton className="h-3 w-28 sm:w-36" />
                <Skeleton className="h-4 w-14 rounded-sm" />
              </div>
              {/* Meta row: treasury · tx · timestamp */}
              <div className="flex items-center gap-2 sm:gap-3 flex-wrap">
                <Skeleton className="h-2.5 w-16 sm:w-20" />
                <Skeleton className="h-2.5 w-24 sm:w-28" />
                <Skeleton className="h-2.5 w-16 sm:w-20" />
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (items.length === 0) {
    return (
      <div className="text-center py-16">
        <FileText
          className="size-10 text-(--text-muted) mx-auto mb-3"
          animateOnHover
        />
        <p className="text-(--text-muted) text-sm">
          No events found for this filter.
        </p>
      </div>
    );
  }
  return (
    <div>
      {items.map((entry, i) => (
        <ProposalRow
          key={entry.id}
          entry={entry}
          isLast={i === items.length - 1}
        />
      ))}
    </div>
  );
}

// Pagination

function Pagination({
  page,
  total,
  pageSize,
  onChange,
}: {
  page: number;
  total: number;
  pageSize: number;
  onChange: (p: number) => void;
}) {
  const totalPages = Math.ceil(total / pageSize);
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-between font-mono text-[10px] text-(--text-muted) mt-6 pt-4 border-t border-border">
      <span>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of{" "}
        {total}
      </span>
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="small"
          className="min-h-0 py-1 px-2 text-[10px]"
          disabled={page === 1}
          onClick={() => onChange(page - 1)}
          icon={<ChevronLeft size={12} />}
          iconPosition="left"
        >
          Prev
        </Button>
        <span className="px-2">
          {page} / {totalPages}
        </span>
        <Button
          variant="ghost"
          size="small"
          className="min-h-0 py-1 px-2 text-[10px]"
          disabled={page === totalPages}
          onClick={() => onChange(page + 1)}
          icon={<ChevronRight size={12} />}
          iconPosition="right"
        >
          Next
        </Button>
      </div>
    </div>
  );
}

// Page

export default function ActivityLogPage() {
  const { publicKey } = useWallet();
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [treasuryFilter, setTreasuryFilter] = useState<string>("all");
  const [outcomeFilter, setOutcomeFilter] = useState<string>("all");
  const [chainFilter, setChainFilter] = useState<string>("all");

  const treasuriesQuery = useOwnedTreasuries();
  const treasuries = treasuriesQuery.data ?? [];
  // Use backend activity endpoint — no RPC polling, no rate limits
  const activityQuery = useActivity({ limit: 100 });
  const rawActivity = mapBackendEvents(activityQuery.data?.events ?? []);
  const isLoading = activityQuery.isLoading || treasuriesQuery.isLoading;

  const allEntries = useMemo(
    () => mapToProposalEntries(rawActivity, treasuries),
    [rawActivity, treasuries],
  );

  // Apply search + treasury + outcome + chain filter
  const filtered = useMemo(() => {
    let items = allEntries;
    if (treasuryFilter !== "all") {
      items = items.filter((e) => e.treasury === treasuryFilter);
    }
    if (outcomeFilter !== "all") {
      items = items.filter((e) => e.outcome === outcomeFilter);
    }
    if (chainFilter !== "all") {
      items = items.filter((e) =>
        e.steps.some(
          (s) => s.meta?.Chain?.toLowerCase() === chainFilter.toLowerCase(),
        ),
      );
    }
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      items = items.filter(
        (e) =>
          e.proposalId.includes(q) ||
          e.treasury.toLowerCase().includes(q) ||
          e.txSignature.toLowerCase().includes(q) ||
          e.steps.some(
            (s) =>
              s.label.toLowerCase().includes(q) ||
              s.description.toLowerCase().includes(q) ||
              Object.values(s.meta ?? {}).some((v) =>
                v.toLowerCase().includes(q),
              ),
          ) ||
          e.outcome.includes(q) ||
          (e.violationLabel ?? "").toLowerCase().includes(q),
      );
    }
    return items;
  }, [allEntries, search, treasuryFilter, outcomeFilter, chainFilter]);

  const proposals = useMemo(
    () => filtered.filter((e) => e.proposalId !== ""),
    [filtered],
  );
  const approved = useMemo(
    () => proposals.filter((e) => e.outcome === "approved"),
    [proposals],
  );
  const denied = useMemo(
    () => proposals.filter((e) => e.outcome === "denied"),
    [proposals],
  );
  const audits = useMemo(
    () => filtered.filter((e) => e.proposalId === ""),
    [filtered],
  );
  const governance = useMemo(
    () =>
      audits.filter((e) => {
        const kind = e.steps[0]?.id ?? "";
        return GOVERNANCE_AUDIT_KINDS.has(kind);
      }),
    [audits],
  );

  const playground = useMemo(
    () => audits.filter((e) => e.steps[0]?.id === "instruction_sent"),
    [audits],
  );

  // Unique treasuries for filter dropdown
  const uniqueTreasuries = useMemo(
    () => [...new Set(allEntries.map((e) => e.treasury))],
    [allEntries],
  );

  const resetPage = () => setPage(1);

  const tabContent = (items: ProposalEntry[]) => {
    const start = (page - 1) * PAGE_SIZE;
    const paged = items.slice(start, start + PAGE_SIZE);

    if (!publicKey)
      return (
        <div className="text-center py-16">
          <XCircle
            className="size-10 text-(--text-muted) mx-auto mb-3"
            animateOnHover
          />
          <p className="text-(--text-muted) text-sm">
            Connect your wallet to view activity.
          </p>
        </div>
      );
    if (treasuries.length === 0 && !isLoading)
      return (
        <div className="text-center py-16">
          <Activity
            className="size-10 text-(--text-muted) mx-auto mb-3"
            animateOnHover
          />
          <p className="text-(--text-muted) text-sm">
            Create a treasury to start seeing activity.
          </p>
        </div>
      );

    return (
      <>
        <Timeline items={paged} isLoading={isLoading} />
        <Pagination
          page={page}
          total={items.length}
          pageSize={PAGE_SIZE}
          onChange={(p) => {
            setPage(p);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
        />
      </>
    );
  };

  const tabs = [
    {
      id: "all",
      label: `All${filtered.length > 0 ? ` (${filtered.length})` : ""}`,
      content: tabContent(filtered),
    },
    {
      id: "proposals",
      label: `Proposals${proposals.length > 0 ? ` (${proposals.length})` : ""}`,
      content: tabContent(proposals),
    },
    {
      id: "approved",
      label: `Approved${approved.length > 0 ? ` (${approved.length})` : ""}`,
      content: tabContent(approved),
    },
    {
      id: "denied",
      label: `Denied${denied.length > 0 ? ` (${denied.length})` : ""}`,
      content: tabContent(denied),
    },
    {
      id: "governance",
      label: `Governance${governance.length > 0 ? ` (${governance.length})` : ""}`,
      content: tabContent(governance),
    },
    {
      id: "playground",
      label: `Playground${playground.length > 0 ? ` (${playground.length})` : ""}`,
      content: tabContent(playground),
    },
    {
      id: "audit",
      label: `Audit Trail${audits.length > 0 ? ` (${audits.length})` : ""}`,
      content: tabContent(audits),
    },
  ];

  return (
    <div className="relative z-10 max-w-[1600px] mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
            Activity Log
          </span>
          <h1 className="text-2xl sm:text-3xl lg:text-4xl font-semibold tracking-tight text-(--text-main) mb-2">
            Recent Activity
          </h1>
          <p className="text-(--text-muted) font-light max-w-xl text-sm hidden sm:block">
            On-chain events parsed from program logs — proposals with full
            execution pipelines, and the complete treasury audit trail.
          </p>
        </div>
        <Button
          variant="secondary"
          size="small"
          onClick={() => {
            activityQuery.refetch();
            resetPage();
          }}
          loading={activityQuery.isFetching}
          className="shrink-0 mt-1"
        >
          Refresh
        </Button>
      </header>

      {/* Search + filters */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3 mb-6 flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-48">
          <Search
            size={13}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-(--text-muted)"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              resetPage();
            }}
            placeholder="Search proposals, tx hash, violation..."
            className="w-full pl-8 pr-3 py-2 font-mono text-[10px] bg-(--card-bg) border border-border rounded-sm text-(--text-main) placeholder:text-(--text-muted) focus:outline-none focus:border-primary transition-colors uppercase tracking-widest"
          />
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {uniqueTreasuries.length > 1 && (
            <Dropdown
              options={[
                { value: "all", label: "All treasuries" },
                ...uniqueTreasuries.map((t) => ({
                  value: t,
                  label: `${t.slice(0, 6)}...${t.slice(-4)}`,
                })),
              ]}
              value={treasuryFilter}
              onChange={(v) => {
                setTreasuryFilter(v);
                resetPage();
              }}
              className="w-40 sm:w-44"
            />
          )}

          <Dropdown
            options={[
              { value: "all", label: "All outcomes" },
              { value: "approved", label: "Approved" },
              { value: "denied", label: "Denied" },
              { value: "pending", label: "Pending" },
              { value: "cancelled", label: "Cancelled" },
            ]}
            value={outcomeFilter}
            onChange={(v) => {
              setOutcomeFilter(v);
              resetPage();
            }}
            className="w-36 sm:w-40"
          />

          <Dropdown
            options={[
              { value: "all", label: "All chains" },
              { value: "Solana", label: "Solana" },
              { value: "Ethereum", label: "Ethereum" },
              { value: "Bitcoin", label: "Bitcoin" },
              { value: "Polygon", label: "Polygon" },
              { value: "Arbitrum", label: "Arbitrum" },
              { value: "Optimism", label: "Optimism" },
            ]}
            value={chainFilter}
            onChange={(v) => {
              setChainFilter(v);
              resetPage();
            }}
            className="w-32 sm:w-36"
          />

          {(search ||
            treasuryFilter !== "all" ||
            outcomeFilter !== "all" ||
            chainFilter !== "all") && (
            <Button
              variant="ghost"
              size="small"
              className="min-h-0 py-1 px-2 text-[10px]"
              onClick={() => {
                setSearch("");
                setTreasuryFilter("all");
                setOutcomeFilter("all");
                setChainFilter("all");
                resetPage();
              }}
            >
              Clear
            </Button>
          )}
        </div>
      </div>

      <div className="min-h-[600px]">
        <Tabs tabs={tabs} layoutId="activity-tabs" onChange={resetPage} />
      </div>
    </div>
  );
}
