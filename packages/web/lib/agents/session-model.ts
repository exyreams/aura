import type { AgentSessionRow, Json } from "@/lib/supabase/types";

export interface AgentSessionWithUsage extends AgentSessionRow {
  last_used_at: string | null;
}

export type SessionStatusTone = "neutral" | "success" | "warning" | "danger";

export function metadataObject(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, Json | undefined>;
}

export function metadataString(metadata: Json, key: string) {
  const value = metadataObject(metadata)[key];
  return typeof value === "string" ? value : null;
}

export function isSessionExpired(session: AgentSessionRow) {
  return Boolean(
    session.expires_at && new Date(session.expires_at) <= new Date(),
  );
}

export function isAgentSessionActive(session: AgentSessionRow) {
  return session.status === "active" && !isSessionExpired(session);
}

export function isAgentSessionEditable(session: AgentSessionRow) {
  return isAgentSessionActive(session);
}

export function isDeviceFlowSession(session: AgentSessionRow) {
  return (
    metadataString(session.metadata, "created_via") === "conduit_device_flow"
  );
}

export function sessionSource(session: AgentSessionRow) {
  const createdVia = metadataString(session.metadata, "created_via");

  if (createdVia === "web_signer_agent") {
    return "Web signer";
  }

  if (createdVia === "conduit_device_flow") {
    return "Conduit auth";
  }

  if (createdVia === "web") {
    return "Web signer";
  }

  return createdVia ?? "Runtime";
}

export function sessionStatusTone(session: AgentSessionRow): SessionStatusTone {
  if (session.status === "revoked") {
    return "danger";
  }

  if (isSessionExpired(session) || session.status === "expired") {
    return "warning";
  }

  if (session.status === "suspended") {
    return "warning";
  }

  return "success";
}

export function sessionStatusLabel(session: AgentSessionRow) {
  if (session.status === "revoked") {
    return "Revoked";
  }

  if (isSessionExpired(session) || session.status === "expired") {
    return "Expired";
  }

  if (session.status === "suspended") {
    return "Suspended";
  }

  return "Active";
}

export function formatSessionDateTime(value: string | null) {
  if (!value) {
    return "Never";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
