import { isSessionExpired, sessionSource } from "@/lib/agents/session-model";
import type {
  ActivityEventRow,
  AgentSessionRow,
  Json,
  SignRequestRow,
  WalletRegistryRow,
} from "@/lib/supabase/types";
import { shortenAddress } from "@/lib/utils";

export type ActivityFamilyFilter =
  | "all"
  | "proposals"
  | "transfers"
  | "sessions"
  | "wallets"
  | "approvals"
  | "execution"
  | "errors";

export type ActivitySessionFilter =
  | "all"
  | "active"
  | "conduit"
  | "web"
  | "revoked"
  | "expired"
  | "none";

export type ActivityOriginFilter = "all" | "owner" | "conduit" | "system";

export interface ActivityFilterState {
  q: string;
  family: ActivityFamilyFilter;
  session: ActivitySessionFilter;
  origin: ActivityOriginFilter;
}

export interface ActivityReferenceMap {
  sessionsById: Map<string, AgentSessionRow>;
  walletsById: Map<string, WalletRegistryRow>;
  requestsById: Map<string, SignRequestRow>;
}

export interface ActivityRelatedRecord {
  title: string;
  value: string;
  mono?: boolean;
  href?: string | null;
}

export const ACTIVITY_FAMILY_OPTIONS: Array<{
  value: ActivityFamilyFilter;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "proposals", label: "Proposals" },
  { value: "transfers", label: "Transfers" },
  { value: "sessions", label: "Sessions" },
  { value: "wallets", label: "Wallets" },
  { value: "approvals", label: "Approvals" },
  { value: "execution", label: "Execution" },
  { value: "errors", label: "Errors" },
];

export const ACTIVITY_SESSION_OPTIONS: Array<{
  value: ActivitySessionFilter;
  label: string;
}> = [
  { value: "all", label: "Any session" },
  { value: "active", label: "Active" },
  { value: "conduit", label: "Conduit auth" },
  { value: "web", label: "Web signer" },
  { value: "revoked", label: "Revoked" },
  { value: "expired", label: "Expired" },
  { value: "none", label: "No session" },
];

export const ACTIVITY_ORIGIN_OPTIONS: Array<{
  value: ActivityOriginFilter;
  label: string;
}> = [
  { value: "all", label: "Any origin" },
  { value: "owner", label: "Owner" },
  { value: "conduit", label: "Conduit" },
  { value: "system", label: "System" },
];

function metadataObject(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, Json | undefined>;
}

function metadataString(metadata: Json, key: string) {
  const value = metadataObject(metadata)[key];
  return typeof value === "string" ? value : null;
}

function metadataNestedString(metadata: Json, parent: string, key: string) {
  const value = metadataObject(metadata)[parent];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const nested = value[key];
  return typeof nested === "string" ? nested : null;
}

function hasPrefix(value: string, prefix: string) {
  return value === prefix || value.startsWith(`${prefix}.`);
}

function titleCase(value: string) {
  return value
    .split(/[._-]+/u)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");
}

function summarizeEventKind(eventKind: string) {
  const kind = eventKind.trim();

  if (kind === "wallet.transfer_request.created") {
    return "Transfer proposal created";
  }
  if (kind === "wallet.transfer_request.created_by_agent") {
    return "Agent transfer proposal";
  }
  if (kind === "wallet.transfer_request.approved") {
    return "Transfer proposal approved";
  }
  if (kind === "wallet.transfer.submitted") {
    return "Transfer submitted";
  }
  if (kind === "wallet.dwallet.onchain_registered") {
    return "dWallet on-chain registration";
  }
  if (kind === "wallet.dwallet.registered") {
    return "dWallet registered";
  }
  if (kind === "wallet.dwallet.agent_created") {
    return "Agent-created dWallet";
  }
  if (kind === "wallet.dwallet.removed") {
    return "dWallet removed";
  }
  if (kind === "account.wallet.linked") {
    return "Owner wallet linked";
  }
  if (kind === "account.wallet.unlinked") {
    return "Owner wallet unlinked";
  }
  if (kind === "agent_session.created") {
    return "Agent session created";
  }
  if (kind === "agent_session.revoked") {
    return "Agent session revoked";
  }
  if (kind === "agent_session.scopes_updated") {
    return "Agent scopes updated";
  }
  if (kind === "agent_session.treasury_linked") {
    return "Agent treasury linked";
  }
  if (kind === "conduit.device.approved") {
    return "Conduit authorization approved";
  }
  if (kind === "conduit.device.denied") {
    return "Conduit authorization denied";
  }
  if (kind === "policy.transfer.created") {
    return "Transfer policy created";
  }
  if (kind === "policy.transfer.updated") {
    return "Transfer policy updated";
  }
  if (kind === "policy.transfer.deleted") {
    return "Transfer policy deleted";
  }
  if (kind === "policy.transfer.denied") {
    return "Transfer denied by policy";
  }
  if (kind === "policy.template.created") {
    return "Policy template created";
  }
  if (kind === "policy.template.updated") {
    return "Policy template updated";
  }
  if (kind === "policy.template.applied") {
    return "Policy template applied";
  }
  if (kind === "policy.template.closed") {
    return "Policy template closed";
  }

  return titleCase(kind);
}

export function getActivityFamily(
  event: ActivityEventRow,
): ActivityFamilyFilter {
  if (event.severity === "error") {
    return "errors";
  }
  if (hasPrefix(event.event_kind, "wallet.transfer_request")) {
    return "proposals";
  }
  if (hasPrefix(event.event_kind, "wallet.transfer")) {
    return "transfers";
  }
  if (
    hasPrefix(event.event_kind, "agent_session") ||
    hasPrefix(event.event_kind, "conduit.device")
  ) {
    return "sessions";
  }
  if (
    hasPrefix(event.event_kind, "wallet.dwallet") ||
    hasPrefix(event.event_kind, "account.wallet")
  ) {
    return "wallets";
  }
  if (
    event.event_kind.includes("approved") ||
    event.event_kind.includes("revoked") ||
    event.event_kind.includes("denied") ||
    hasPrefix(event.event_kind, "policy.transfer") ||
    hasPrefix(event.event_kind, "policy.template")
  ) {
    return "approvals";
  }
  if (
    event.tx_signature !== null ||
    event.event_kind.includes("submitted") ||
    event.event_kind.includes("registered")
  ) {
    return "execution";
  }

  return "wallets";
}

export function getActivityFamilyLabel(event: ActivityEventRow) {
  return summarizeEventKind(event.event_kind);
}

export function getActivityOrigin(
  event: ActivityEventRow,
): ActivityOriginFilter {
  const sourceKind =
    metadataNestedString(event.metadata, "source", "kind") ??
    metadataString(event.metadata, "source_kind");

  if (sourceKind?.includes("conduit")) {
    return "conduit";
  }

  if (
    sourceKind?.includes("owner") ||
    sourceKind?.includes("web") ||
    hasPrefix(event.event_kind, "wallet.") ||
    hasPrefix(event.event_kind, "account.wallet") ||
    hasPrefix(event.event_kind, "agent_session") ||
    hasPrefix(event.event_kind, "policy.transfer") ||
    hasPrefix(event.event_kind, "policy.template")
  ) {
    return "owner";
  }

  return "system";
}

export function getActivityOriginLabel(event: ActivityEventRow) {
  const sourceKind =
    metadataNestedString(event.metadata, "source", "kind") ??
    metadataString(event.metadata, "source_kind");

  if (sourceKind) {
    return titleCase(sourceKind.replaceAll("_", " "));
  }

  const origin = getActivityOrigin(event);
  return origin === "owner"
    ? "Owner"
    : origin === "conduit"
      ? "Conduit"
      : "System";
}

export function getActivitySessionFilter(
  event: ActivityEventRow,
  refs: ActivityReferenceMap,
): ActivitySessionFilter {
  if (!event.agent_session_id) {
    return "none";
  }

  const session = refs.sessionsById.get(event.agent_session_id);
  if (!session) {
    return "none";
  }

  if (session.status === "revoked") {
    return "revoked";
  }
  if (session.status === "expired" || isSessionExpired(session)) {
    return "expired";
  }

  const source = sessionSource(session);
  if (source === "Conduit auth") {
    return "conduit";
  }
  if (source === "Web signer") {
    return "web";
  }

  return "active";
}

export function getActivitySessionLabel(
  event: ActivityEventRow,
  refs: ActivityReferenceMap,
) {
  if (!event.agent_session_id) {
    return "No session";
  }

  const session = refs.sessionsById.get(event.agent_session_id);
  if (!session) {
    return "Unknown session";
  }

  return session.agent_label ?? session.agent_id;
}

export function getActivityWalletLabel(
  event: ActivityEventRow,
  refs: ActivityReferenceMap,
) {
  if (!event.wallet_id) {
    return null;
  }

  return refs.walletsById.get(event.wallet_id)?.label ?? null;
}

export function getActivityRequestLabel(
  event: ActivityEventRow,
  refs: ActivityReferenceMap,
) {
  if (!event.proposal_id) {
    return null;
  }

  const request = refs.requestsById.get(event.proposal_id);
  if (!request) {
    return shortRef(event.proposal_id);
  }

  return request.message ?? shortRef(request.id);
}

export function getActivitySeverityTone(
  severity: ActivityEventRow["severity"],
) {
  switch (severity) {
    case "success":
      return "success" as const;
    case "warning":
      return "warning" as const;
    case "error":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

export function getActivityFamilyTone(
  family: ActivityFamilyFilter,
): "neutral" | "success" | "warning" | "danger" {
  switch (family) {
    case "proposals":
    case "transfers":
    case "wallets":
      return "warning";
    case "sessions":
      return "neutral";
    case "approvals":
    case "execution":
      return "success";
    case "errors":
      return "danger";
    default:
      return "neutral";
  }
}

export function getActivityFamilyPillLabel(family: ActivityFamilyFilter) {
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

export function getActivitySourceTone(origin: ActivityOriginFilter) {
  switch (origin) {
    case "owner":
      return "neutral" as const;
    case "conduit":
      return "warning" as const;
    case "system":
      return "danger" as const;
    default:
      return "neutral" as const;
  }
}

export function formatActivityTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function formatActivityRelativeTime(value: string) {
  const diffMs = new Date(value).getTime() - Date.now();
  const diffMinutes = Math.round(diffMs / 60000);

  if (Math.abs(diffMinutes) < 1) {
    return "just now";
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (Math.abs(diffHours) < 24) {
    const unit = Math.abs(diffHours) === 1 ? "hour" : "hours";
    return diffHours < 0
      ? `${Math.abs(diffHours)} ${unit} ago`
      : `in ${Math.abs(diffHours)} ${unit}`;
  }

  const diffDays = Math.round(diffHours / 24);
  const unit = Math.abs(diffDays) === 1 ? "day" : "days";
  return diffDays < 0
    ? `${Math.abs(diffDays)} ${unit} ago`
    : `in ${Math.abs(diffDays)} ${unit}`;
}

export function buildActivitySearchText(
  event: ActivityEventRow,
  refs: ActivityReferenceMap,
) {
  const session = event.agent_session_id
    ? refs.sessionsById.get(event.agent_session_id)
    : null;
  const wallet = event.wallet_id ? refs.walletsById.get(event.wallet_id) : null;
  const request = event.proposal_id
    ? refs.requestsById.get(event.proposal_id)
    : null;
  const sourceKind =
    metadataNestedString(event.metadata, "source", "kind") ??
    metadataString(event.metadata, "source_kind") ??
    "";

  return [
    event.event_kind,
    event.title,
    event.summary ?? "",
    event.owner_id ?? "",
    event.agent_session_id ?? "",
    event.treasury_pda ?? "",
    event.wallet_id ?? "",
    event.proposal_id ?? "",
    event.tx_signature ?? "",
    wallet?.label ?? "",
    wallet?.chain_address ?? "",
    session?.agent_id ?? "",
    session?.agent_label ?? "",
    session?.status ?? "",
    request?.id ?? "",
    request?.status ?? "",
    request?.message ?? "",
    sourceKind,
    getActivityOriginLabel(event),
    getActivityFamilyLabel(event),
  ]
    .filter((part) => part.length > 0)
    .join(" ")
    .toLowerCase();
}

export function matchesActivityFilters(
  event: ActivityEventRow,
  refs: ActivityReferenceMap,
  filters: ActivityFilterState,
) {
  const query = filters.q.trim().toLowerCase();
  if (
    query &&
    !buildActivitySearchText(event, refs).includes(query) &&
    !shortRef(event.id).includes(query)
  ) {
    return false;
  }

  const family = getActivityFamily(event);
  if (filters.family !== "all" && family !== filters.family) {
    return false;
  }

  const origin = getActivityOrigin(event);
  if (filters.origin !== "all" && origin !== filters.origin) {
    return false;
  }

  const sessionFilter = getActivitySessionFilter(event, refs);
  if (filters.session !== "all" && sessionFilter !== filters.session) {
    return false;
  }

  return true;
}

export function getActivityRelatedRecords(
  event: ActivityEventRow,
  refs: ActivityReferenceMap,
) {
  const records: ActivityRelatedRecord[] = [];
  const wallet = event.wallet_id ? refs.walletsById.get(event.wallet_id) : null;
  const session = event.agent_session_id
    ? refs.sessionsById.get(event.agent_session_id)
    : null;
  const request = event.proposal_id
    ? refs.requestsById.get(event.proposal_id)
    : null;
  const sourceKind =
    metadataNestedString(event.metadata, "source", "kind") ??
    metadataString(event.metadata, "source_kind");

  records.push({
    title: "Event kind",
    value: event.event_kind,
    mono: true,
  });
  records.push({
    title: "Created",
    value: formatActivityTimestamp(event.created_at),
  });

  if (wallet) {
    records.push({
      title: "Wallet",
      value: wallet.label ?? wallet.chain_name,
    });
    records.push({
      title: "Wallet id",
      value: wallet.id,
      mono: true,
    });
    records.push({
      title: "Wallet address",
      value: wallet.chain_address,
      mono: true,
    });
  }

  if (session) {
    records.push({
      title: "Session",
      value: session.agent_label ?? session.agent_id,
    });
    records.push({
      title: "Session id",
      value: session.id,
      mono: true,
    });
    records.push({
      title: "Session status",
      value: session.status,
    });
  }

  if (request) {
    records.push({
      title: "Request",
      value: request.message ?? request.id,
      mono: request.message === null,
    });
    records.push({
      title: "Request id",
      value: request.id,
      mono: true,
    });
    records.push({
      title: "Request status",
      value: request.status,
    });
  }

  if (event.treasury_pda) {
    records.push({
      title: "Treasury",
      value: event.treasury_pda,
      mono: true,
    });
  }

  if (event.tx_signature) {
    records.push({
      title: "Transaction",
      value: event.tx_signature,
      mono: true,
    });
  }

  if (event.owner_id) {
    records.push({
      title: "Owner",
      value: shortenAddress(event.owner_id, 5, 5),
      mono: true,
    });
  }

  if (sourceKind) {
    records.push({
      title: "Source",
      value: titleCase(sourceKind.replaceAll("_", " ")),
    });
  }

  return records;
}

function shortRef(value: string) {
  return shortenAddress(value, 5, 5).toLowerCase();
}
