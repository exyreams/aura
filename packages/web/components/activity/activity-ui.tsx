import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  ArrowRightLeft,
  FileSignature,
  MonitorCheck,
  PlugZap,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import type { ReactNode } from "react";
import { Badge, type BadgeVariant } from "@/components/global/Badge";
import type {
  ActivityFamilyFilter,
  ActivityFilterState,
  ActivityOriginFilter,
} from "@/lib/activity";

export const FAMILY_ICONS: Record<ActivityFamilyFilter, LucideIcon> = {
  all: Activity,
  proposals: FileSignature,
  transfers: ArrowRightLeft,
  sessions: PlugZap,
  wallets: Wallet,
  approvals: ShieldCheck,
  execution: MonitorCheck,
  errors: AlertTriangle,
};

export function familyBadgeLabel(family: ActivityFamilyFilter) {
  return family === "all"
    ? "All"
    : family === "proposals"
      ? "Proposal"
      : family === "transfers"
        ? "Transfer"
        : family === "sessions"
          ? "Session"
          : family === "wallets"
            ? "Wallet"
            : family === "approvals"
              ? "Approval"
              : family === "execution"
                ? "Execution"
                : "Error";
}

export function sourceBadgeLabel(origin: ActivityOriginFilter) {
  return origin === "all"
    ? "Any origin"
    : origin === "owner"
      ? "Owner"
      : origin === "conduit"
        ? "Conduit"
        : "System";
}

function activityBadgeVariant(
  tone: "neutral" | "success" | "warning" | "danger",
): BadgeVariant {
  switch (tone) {
    case "success":
      return "active";
    case "warning":
      return "paused";
    case "danger":
      return "error";
    default:
      return "default";
  }
}

export function ActivityBadge({
  tone,
  children,
}: {
  tone: "neutral" | "success" | "warning" | "danger";
  children: ReactNode;
}) {
  return (
    <Badge
      variant={activityBadgeVariant(tone)}
      className="px-1.5 py-0.5 text-[9px] sm:px-2"
    >
      {children}
    </Badge>
  );
}

export function sessionBadgeLabel(
  sessionFilter: ActivityFilterState["session"],
) {
  return sessionFilter === "conduit"
    ? "Conduit auth"
    : sessionFilter === "web"
      ? "Web signer"
      : sessionFilter;
}
