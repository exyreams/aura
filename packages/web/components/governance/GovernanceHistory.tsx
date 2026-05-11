"use client";

import { AnimatePresence, m } from "motion/react";
import { useState } from "react";
import type { BadgeVariant } from "@/components/global/Badge";
import { Badge } from "@/components/global/Badge";
import { Skeleton } from "@/components/global/Skeleton";
import { Tooltip } from "@/components/global/Tooltip";
import {
  Activity,
  Checkcircle,
  ChevronDown,
  Clock,
  Copy,
  FileText,
  KeyRound,
  RefreshCw,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  SquareArrowOutUpRight,
  TriangleAlert,
  Xcircle,
  Zap,
} from "@/components/icons";
import type { ParsedActivity } from "@/lib/aura-app";
import { formatTimeAgo, shortenAddress } from "@/lib/utils";

interface GovernanceHistoryProps {
  activity: ParsedActivity[];
  isLoading?: boolean;
}

const GOVERNANCE_KINDS = new Set([
  "multisig_attached",
  "swarm_attached",
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

const KIND_CONFIG: Record<
  string,
  { label: string; icon: React.ReactNode; variant: BadgeVariant }
> = {
  multisig_attached: {
    label: "Multisig Attached",
    icon: <Shield size={16} animateOnHover />,
    variant: "default",
  },
  swarm_attached: {
    label: "Swarm Attached",
    icon: <Zap size={16} animateOnHover />,
    variant: "default",
  },
  override_executed: {
    label: "Override Executed",
    icon: <Settings size={16} animateOnHover />,
    variant: "paused",
  },
  ai_authority_rotation_proposed: {
    label: "AI Rotation Proposed",
    icon: <RefreshCw size={16} animateOnHover />,
    variant: "paused",
  },
  ai_authority_rotated: {
    label: "AI Authority Rotated",
    icon: <RefreshCw size={16} animateOnHover />,
    variant: "active",
  },
  config_change_proposed: {
    label: "Config Change Proposed",
    icon: <Settings size={16} animateOnHover />,
    variant: "paused",
  },
  config_change_executed: {
    label: "Config Change Executed",
    icon: <Settings size={16} animateOnHover />,
    variant: "active",
  },
  config_change_vetoed: {
    label: "Config Change Vetoed",
    icon: <Xcircle size={16} animateOnHover />,
    variant: "error",
  },
  circuit_breaker_tripped: {
    label: "Circuit Breaker Tripped",
    icon: <TriangleAlert size={16} animateOnHover />,
    variant: "error",
  },
  circuit_breaker_reset: {
    label: "Circuit Breaker Reset",
    icon: <Checkcircle size={16} animateOnHover />,
    variant: "active",
  },
  session_key_issued: {
    label: "Session Key Issued",
    icon: <KeyRound size={16} animateOnHover />,
    variant: "default",
  },
  session_key_revoked: {
    label: "Session Key Revoked",
    icon: <Xcircle size={16} animateOnHover />,
    variant: "paused",
  },
  dead_mans_switch_triggered: {
    label: "Dead Man's Switch",
    icon: <TriangleAlert size={16} animateOnHover />,
    variant: "error",
  },
  guardian_added: {
    label: "Guardian Added",
    icon: <ShieldCheck size={16} animateOnHover />,
    variant: "active",
  },
  guardian_removed: {
    label: "Guardian Removed",
    icon: <Shield size={16} animateOnHover />,
    variant: "paused",
  },
  emergency_shutdown: {
    label: "Emergency Shutdown",
    icon: <ShieldAlert size={16} animateOnHover />,
    variant: "error",
  },
  execution_paused: {
    label: "Execution Paused",
    icon: <TriangleAlert size={16} animateOnHover />,
    variant: "paused",
  },
  execution_resumed: {
    label: "Execution Resumed",
    icon: <Checkcircle size={16} animateOnHover />,
    variant: "active",
  },
};

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Tooltip content={copied ? "Copied!" : "Copy"}>
      <button
        type="button"
        onClick={async (e) => {
          e.stopPropagation();
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="text-(--text-muted) hover:text-primary transition-colors"
      >
        {copied ? (
          <Checkcircle size={10} className="text-success" animateOnHover />
        ) : (
          <Copy size={10} animateOnHover />
        )}
      </button>
    </Tooltip>
  );
}

function GovernanceEventRow({
  event,
  isLast,
}: {
  event: ParsedActivity;
  isLast: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const rawKind = event.detail?.split(":")[0]?.trim() ?? "audit";
  const detail = event.detail?.split(":").slice(1).join(":").trim() ?? "";
  const cfg = KIND_CONFIG[rawKind];
  const txSig = event.txSignature || event.signature;

  return (
    <div className="flex gap-3 sm:gap-4">
      {/* Icon + spine */}
      <div className="flex flex-col items-center shrink-0 w-8">
        <div className="mt-1 size-7 flex items-center justify-center shrink-0 z-10">
          <span className="text-(--text-muted)">
            {cfg?.icon ?? <Activity size={16} animateOnHover />}
          </span>
        </div>
        {!isLast && <div className="w-px flex-1 bg-border mt-1 min-h-6" />}
      </div>

      {/* Content */}
      <div className="flex-1 pb-6 min-w-0">
        <button
          type="button"
          className="w-full flex items-start justify-between gap-2 mb-1.5 cursor-pointer rounded-sm px-2 py-2 -mx-2 transition-colors text-left hover:bg-(--accordion-hover)"
          onClick={() => setExpanded((e) => !e)}
        >
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <span className="mono text-[11px] font-bold text-(--text-main) uppercase tracking-wide">
              {cfg?.label ?? rawKind.replace(/_/g, " ")}
            </span>
            {cfg && (
              <Badge variant={cfg.variant} className="text-[9px] px-1.5 py-0.5">
                {cfg.label}
              </Badge>
            )}
          </div>
          <m.div
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="shrink-0 mt-0.5"
          >
            <ChevronDown size={13} className="text-(--text-muted)" />
          </m.div>
        </button>

        {/* Meta row */}
        <div className="flex items-center gap-2 flex-wrap font-mono text-[10px] text-(--text-muted) mb-2">
          <Tooltip content={txSig}>
            <span className="flex items-center gap-1">
              {shortenAddress(txSig, 4, 4)}
              <CopyButton value={txSig} />
              <a
                href={`https://explorer.solana.com/tx/${txSig}?cluster=devnet`}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-(--text-muted) hover:text-primary transition-colors"
              >
                <SquareArrowOutUpRight size={10} animateOnHover />
              </a>
            </span>
          </Tooltip>
          <span className="text-border select-none">·</span>
          <span className="flex items-center gap-1" suppressHydrationWarning>
            <Clock size={10} />
            {event.timestamp ? formatTimeAgo(event.timestamp) : "Unknown"}
          </span>
        </div>

        {/* Expandable detail */}
        <AnimatePresence initial={false}>
          {expanded && (
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
                <div className="px-3 py-2.5">
                  <p className="font-mono text-[10px] text-(--text-muted) leading-relaxed">
                    {detail || "No additional details available."}
                  </p>
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

export function GovernanceHistory({
  activity,
  isLoading,
}: GovernanceHistoryProps) {
  const governanceEvents = activity.filter((event) => {
    if (event.kind !== "audit") return false;
    const rawKind = event.detail?.split(":")[0]?.trim() ?? "";
    return GOVERNANCE_KINDS.has(rawKind);
  });

  return (
    <div className="space-y-5">
      <div>
        <span className="mono text-[10px] uppercase tracking-[0.3em] text-(--text-muted) mb-2 block">
          Governance Activity
        </span>
        <h2 className="text-xl font-semibold text-(--text-main)">
          Governance Events
        </h2>
        <p className="text-sm text-(--text-muted) mt-1">
          On-chain governance actions recorded for this treasury agent.
        </p>
      </div>

      <div className="p-6 md:p-8 bg-(--card-bg) border border-border rounded-sm">
        {isLoading ? (
          <div className="space-y-6">
            {Array.from({ length: 3 }, (_, i) => `sk-${i}`).map((k) => (
              <div key={k} className="flex gap-4">
                <Skeleton className="size-7 rounded-full shrink-0 mt-1" />
                <div className="flex-1 space-y-2 pt-1">
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-3 w-36" />
                    <Skeleton className="h-4 w-16 rounded-sm" />
                  </div>
                  <Skeleton className="h-2.5 w-28" />
                </div>
              </div>
            ))}
          </div>
        ) : governanceEvents.length === 0 ? (
          <div className="py-12 text-center">
            <FileText
              className="size-10 text-(--text-muted) mx-auto mb-3"
              animateOnHover
            />
            <p className="text-sm text-(--text-muted)">
              No governance events recorded yet.
            </p>
          </div>
        ) : (
          <div>
            {governanceEvents.map((event, i) => (
              <GovernanceEventRow
                key={event.signature}
                event={event}
                isLast={i === governanceEvents.length - 1}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
