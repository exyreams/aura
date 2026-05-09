"use client";

import { StatusPill } from "@/components/global/Badge";
import { formatProposalStatus, formatViolation } from "@/lib/aura-app";
import { useTreasuryAuditTrail } from "@/lib/hooks";
import { formatTimeAgo } from "@/lib/utils";

interface AuditTrailProps {
  pda: string;
}

export const AuditTrail = ({ pda }: AuditTrailProps) => {
  const { data: events, isLoading } = useTreasuryAuditTrail(pda, 20);

  if (isLoading) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-(--text-main) mb-1">
            Audit Trail
          </h2>
          <p className="text-[12px] text-(--text-muted)">
            Recent treasury events and state changes.
          </p>
        </div>
        <div className="p-8 text-center">
          <p className="text-sm text-(--text-muted)">Loading audit events…</p>
        </div>
      </div>
    );
  }

  if (!events || events.length === 0) {
    return (
      <div>
        <div className="mb-6">
          <h2 className="text-xl font-semibold text-(--text-main) mb-1">
            Audit Trail
          </h2>
          <p className="text-[12px] text-(--text-muted)">
            Recent treasury events and state changes.
          </p>
        </div>
        <div className="p-8 text-center border border-dashed border-border rounded-sm">
          <p className="text-sm text-(--text-muted)">No audit events yet</p>
        </div>
      </div>
    );
  }

  const getEventType = (event: (typeof events)[0]) => {
    if (event.kind === "proposal") {
      if (event.approved) {
        return "PROPOSAL APPROVED";
      } else if (event.violation && event.violation > 0) {
        return "POLICY VIOLATION";
      } else {
        return "PROPOSAL DENIED";
      }
    }
    // Parse audit event kind from detail string
    const detail = event.detail || "";
    if (detail.includes("created") || detail.includes("initialized"))
      return "AGENT INIT";
    if (detail.includes("dwallet") || detail.includes("dWallet"))
      return "DWALLET REGISTER";
    if (detail.includes("limit") || detail.includes("policy"))
      return "POLICY AUDIT";
    if (detail.includes("multisig") || detail.includes("governance"))
      return "GOVERNANCE CHANGE";
    return "AUDIT EVENT";
  };

  const getEventDescription = (event: (typeof events)[0]) => {
    if (event.kind === "proposal") {
      const status =
        event.status !== undefined
          ? formatProposalStatus(event.status)
          : "Unknown";
      const violation =
        event.violation !== undefined && event.violation > 0
          ? formatViolation(event.violation)
          : null;

      if (event.approved) {
        return `Proposal #${event.proposalId} approved and executed`;
      } else if (violation) {
        return `Proposal #${event.proposalId} rejected: ${violation}`;
      } else {
        return `Proposal #${event.proposalId} status: ${status}`;
      }
    }
    return event.detail || "Treasury event";
  };

  const getEventVariant = (
    event: (typeof events)[0],
  ): "active" | "error" | "medium" | "default" => {
    if (event.kind === "proposal") {
      if (event.approved) return "active";
      if (event.violation && event.violation > 0) return "error";
      return "medium";
    }
    // Audit events
    const detail = event.detail || "";
    if (
      detail.includes("violation") ||
      detail.includes("denied") ||
      detail.includes("failed")
    )
      return "error";
    if (
      detail.includes("approved") ||
      detail.includes("executed") ||
      detail.includes("created")
    )
      return "active";
    if (detail.includes("updated") || detail.includes("changed"))
      return "medium";
    return "default";
  };

  const getStatusLabel = (
    variant: "active" | "error" | "medium" | "default",
  ) => {
    switch (variant) {
      case "active":
        return "Success";
      case "error":
        return "Failed";
      case "medium":
        return "Warning";
      default:
        return "Info";
    }
  };

  const formatTimestamp = (timestamp: number | undefined) => {
    return formatTimeAgo(timestamp);
  };

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold text-(--text-main) mb-1">
          Audit Trail
        </h2>
        <p className="text-[12px] text-(--text-muted)">
          Recent treasury events and state changes.
        </p>
      </div>
      <div className="space-y-0 relative">
        {/* Vertical timeline line */}
        <div className="absolute left-0 top-2 bottom-6 w-px bg-border" />

        {events.map((event) => {
          const eventType = getEventType(event);
          const description = getEventDescription(event);
          const variant = getEventVariant(event);
          const statusLabel = getStatusLabel(variant);
          const timeAgo = formatTimestamp(event.timestamp);

          return (
            <div key={event.signature} className="relative pl-6 pb-6 last:pb-0">
              {/* Timeline dot */}
              <div className="absolute left-[-4px] top-1 w-[7px] h-[7px] bg-primary rounded-full z-10" />

              <div className="flex justify-between items-start mb-1">
                <span className="mono text-[11px] font-bold text-(--text-main)">
                  {eventType}
                </span>
                <StatusPill
                  variant={variant}
                  className="text-[10px] px-2 py-0.5"
                >
                  {statusLabel}
                </StatusPill>
              </div>
              <p className="text-[12px] text-(--text-muted) mb-2">
                {description}
              </p>
              <div className="mono text-[10px] text-(--text-muted)">
                {timeAgo}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
