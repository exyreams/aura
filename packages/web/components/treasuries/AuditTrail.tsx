"use client";

import Link from "next/link";
import type { BadgeVariant } from "@/components/global/Badge";
import { Skeleton } from "@/components/global/Skeleton";
import { TimelineRow } from "@/components/global/TimelineRow";
import {
  Activity,
  ChevronRight,
  RefreshCw,
  Send,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SquareArrowOutUpRight,
  TriangleAlert,
  Xcircle,
  Zap,
} from "@/components/icons";
import { formatViolation } from "@/lib/aura-app";
import { useTreasuryAuditTrail } from "@/lib/hooks";
import { formatTimeAgo, shortenAddress } from "@/lib/utils";

interface AuditTrailProps {
  pda: string;
}

type AuditEvent = NonNullable<
  ReturnType<typeof useTreasuryAuditTrail>["data"]
>[0];

interface EventConfig {
  label: string;
  icon: React.ReactNode;
  variant: BadgeVariant;
  badgeLabel: string;
}

function getEventConfig(event: AuditEvent): EventConfig {
  if (event.kind === "proposal") {
    if (event.outcome === "approved")
      return {
        label: "Proposal Approved",
        icon: <ShieldCheck size={18} className="text-success" animateOnHover />,
        variant: "active",
        badgeLabel: "approved",
      };
    if (event.outcome === "cancelled")
      return {
        label: "Cancelled",
        icon: <Xcircle size={18} className="text-(--text-muted)" animateOnHover />,
        variant: "paused",
        badgeLabel: "cancelled",
      };
    if (event.outcome === "denied") {
      if (event.violation && event.violation > 0)
        return {
          label: "Policy Violation",
          icon: <ShieldAlert size={18} className="text-danger" animateOnHover />,
          variant: "error",
          badgeLabel: "denied",
        };
      return {
        label: "Proposal Denied",
        icon: <Xcircle size={18} className="text-danger" animateOnHover />,
        variant: "error",
        badgeLabel: "denied",
      };
    }
    // pending
    return {
      label: "Proposal Submitted",
      icon: <Send size={18} className="text-primary" animateOnHover />,
      variant: "active",
      badgeLabel: "proposed",
    };
  }

  // Audit events: parse the structured "kind:description" prefix for exact matching.
  const detail = event.detail ?? "";
  const rawKind = detail.split(":")[0]?.trim() ?? "";

  switch (rawKind) {
    case "treasury_created":
      return {
        label: "Treasury Created",
        icon: <Shield size={18} className="text-primary" animateOnHover />,
        variant: "active",
        badgeLabel: "created",
      };
    case "dwallet_registered":
      return {
        label: "dWallet Register",
        icon: <Zap size={18} className="text-primary" animateOnHover />,
        variant: "active",
        badgeLabel: "register",
      };
    case "guardrails_configured":
    case "confidential_guardrails_configured":
      return {
        label: "Policy Configured",
        icon: <Settings size={18} className="text-(--text-muted)" animateOnHover />,
        variant: "default",
        badgeLabel: "policy",
      };
    case "execution_paused":
      return {
        label: "Execution Paused",
        icon: <TriangleAlert size={18} className="text-warning" animateOnHover />,
        variant: "paused",
        badgeLabel: "paused",
      };
    case "execution_resumed":
      return {
        label: "Execution Resumed",
        icon: <RefreshCw size={18} className="text-(--text-muted)" animateOnHover />,
        variant: "active",
        badgeLabel: "resumed",
      };
    case "decryption_requested":
    case "decryption_verified":
      return {
        label: "FHE Decryption",
        icon: <Shield size={18} className="text-(--text-muted)" animateOnHover />,
        variant: "default",
        badgeLabel: "fhe",
      };
  }

  // Fallback keyword heuristics for on-chain audit log strings (no structured prefix)
  if (detail.includes("created") || detail.includes("initialized"))
    return {
      label: "Agent Init",
      icon: <Shield size={18} className="text-primary" animateOnHover />,
      variant: "active",
      badgeLabel: "init",
    };
  if (detail.includes("limit") || detail.includes("policy"))
    return {
      label: "Policy Audit",
      icon: <Settings size={18} className="text-(--text-muted)" animateOnHover />,
      variant: "default",
      badgeLabel: "policy",
    };
  if (detail.includes("multisig") || detail.includes("governance"))
    return {
      label: "Governance Change",
      icon: <Shield size={18} className="text-(--text-muted)" animateOnHover />,
      variant: "default",
      badgeLabel: "governance",
    };
  if (detail.includes("paused") || detail.includes("resumed"))
    return {
      label: detail.includes("paused") ? "Execution Paused" : "Execution Resumed",
      icon: <TriangleAlert size={18} className="text-warning" animateOnHover />,
      variant: "paused",
      badgeLabel: detail.includes("paused") ? "paused" : "resumed",
    };
  if (detail.includes("rotation") || detail.includes("authority"))
    return {
      label: "AI Rotation",
      icon: <RefreshCw size={18} className="text-(--text-muted)" animateOnHover />,
      variant: "default",
      badgeLabel: "rotation",
    };
  return {
    label: "Audit Event",
    icon: <Activity size={18} className="text-(--text-muted)" animateOnHover />,
    variant: "default",
    badgeLabel: "event",
  };
}

function getDescription(event: AuditEvent): string {
  if (event.kind === "proposal") {
    const id = event.proposalId ? `#${event.proposalId}` : "";
    const violationStr =
      event.violation && event.violation > 0
        ? formatViolation(event.violation)
        : null;
    if (event.outcome === "approved")
      return `Proposal ${id} approved and executed`;
    if (event.outcome === "denied" && violationStr)
      return `Proposal ${id} rejected: ${violationStr}`;
    if (event.outcome === "denied")
      return `Proposal ${id} denied`;
    if (event.outcome === "cancelled")
      return `Proposal ${id} cancelled`;
    return `Proposal ${id} submitted`;
  }

  // For audit events, return a clean fixed description for known kinds.
  // Never dump the raw detail (it can contain base58 ciphertexts and key=value data).
  const detail = event.detail ?? "";
  const rawKind = detail.split(":")[0]?.trim() ?? "";

  switch (rawKind) {
    case "treasury_created":
      return "Treasury initialized on-chain";
    case "dwallet_registered":
      return "dWallet registered for signing";
    case "guardrails_configured":
      return "Policy guardrails updated";
    case "confidential_guardrails_configured":
      return "Confidential policy guardrails updated";
    case "execution_paused":
      return "Execution paused by operator";
    case "execution_resumed":
      return "Execution resumed";
    case "decryption_requested":
      return "FHE decryption requested";
    case "decryption_verified":
      return "FHE decryption verified";
    default: {
      // Parse out just the human-readable text before any key=value pairs.
      // Detail format: "rawKind:human text,key=value,..." — strip prefix then
      // trim at the first ",word=" boundary where encoded data begins.
      const afterColon = detail.includes(":")
        ? detail.slice(detail.indexOf(":") + 1)
        : detail;
      const kvBoundary = afterColon.search(/,\w+=/);
      const humanText =
        kvBoundary > 0 ? afterColon.slice(0, kvBoundary) : afterColon;
      return humanText.trim() || "Treasury event";
    }
  }
}

export const AuditTrail = ({ pda }: AuditTrailProps) => {
  const { data: events, isLoading } = useTreasuryAuditTrail(pda, 20);
  const displayEvents = (events ?? []).slice(0, 5);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="mb-5">
        <span className="mono text-[10px] uppercase tracking-[0.2em] text-(--text-muted) block mb-1">
          Audit Trail
        </span>
        <h2 className="text-base font-semibold text-(--text-main)">
          Recent Events
        </h2>
      </div>

      {/* Body */}
      {isLoading ? (
        <div className="space-y-0">
          {Array.from({ length: 5 }, (_, i) => `sk-${i}`).map((k, i) => (
            <div key={k} className="flex gap-3 sm:gap-4">
              <div className="flex flex-col items-center shrink-0 w-7 sm:w-8">
                <Skeleton className="mt-1 size-6 sm:size-7 rounded-full shrink-0" />
                {i < 4 && (
                  <div className="w-px flex-1 bg-border mt-1 min-h-10" />
                )}
              </div>
              <div className="flex-1 pb-5 space-y-1.5 pt-1">
                <div className="flex items-center justify-between gap-2">
                  <Skeleton className="h-3 w-28" />
                  <Skeleton className="h-4 w-14 rounded-sm" />
                </div>
                <Skeleton className="h-2.5 w-full" />
                <Skeleton className="h-2.5 w-36" />
              </div>
            </div>
          ))}
        </div>
      ) : displayEvents.length === 0 ? (
        <div className="flex-1 flex items-center justify-center py-8 border border-dashed border-border rounded-sm">
          <p className="text-sm text-(--text-muted)">No audit events yet</p>
        </div>
      ) : (
        <div className="flex-1">
          {displayEvents.map((event, i) => {
            const cfg = getEventConfig(event);
            const description = getDescription(event);
            const isLast = i === displayEvents.length - 1;

            return (
              <TimelineRow
                key={event.signature}
                icon={cfg.icon}
                label={cfg.label}
                badge={{ label: cfg.badgeLabel, variant: cfg.variant }}
                meta={
                  <span className="flex items-center gap-1.5 min-w-0">
                    <span className="truncate">{description}</span>
                  </span>
                }
                detail={
                  <div
                    className="px-3 py-2.5 space-y-1.5"
                    style={{ background: "var(--accordion-content)" }}
                  >
                    <div className="flex items-start gap-3 font-mono text-[10px]">
                      <span className="text-(--text-muted) w-24 shrink-0">
                        Treasury
                      </span>
                      <span className="text-(--text-main) flex items-center gap-1">
                        {shortenAddress(event.treasury ?? pda, 6, 6)}
                        <a
                          href={`https://explorer.solana.com/address/${event.treasury ?? pda}?cluster=devnet`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-(--text-muted) hover:text-primary transition-colors"
                        >
                          <SquareArrowOutUpRight size={10} animateOnHover />
                        </a>
                      </span>
                    </div>
                    {event.txSignature && (
                      <div className="flex items-start gap-3 font-mono text-[10px]">
                        <span className="text-(--text-muted) w-24 shrink-0">
                          Tx signature
                        </span>
                        <span className="text-(--text-main) flex items-center gap-1">
                          {shortenAddress(event.txSignature, 6, 6)}
                          <a
                            href={`https://explorer.solana.com/tx/${event.txSignature}?cluster=devnet`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-(--text-muted) hover:text-primary transition-colors"
                          >
                            <SquareArrowOutUpRight size={10} animateOnHover />
                          </a>
                        </span>
                      </div>
                    )}
                    <div className="flex items-start gap-3 font-mono text-[10px]">
                      <span className="text-(--text-muted) w-24 shrink-0">
                        Time
                      </span>
                      <span className="text-(--text-main)">
                        {formatTimeAgo(event.timestamp)}
                      </span>
                    </div>
                  </div>
                }
                isLast={isLast}
              />
            );
          })}

          {/* Footer */}
          <div className="mt-4 pt-3 border-t border-border flex justify-end">
            <Link
              href="/dashboard/activity"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-md mono text-[10px] uppercase tracking-widest text-(--text-muted) hover:text-(--text-main) hover:bg-(--hover-bg) transition-colors"
            >
              View full audit trail
              <ChevronRight className="size-2.5" animateOnHover />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
