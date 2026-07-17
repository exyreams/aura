import type { AgentKeypair } from "@/lib/hooks";
import type { StatusTone } from "./types";

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Request failed.";
}

export function formatDateTime(value: string | number | null | undefined) {
  if (!value) {
    return "Not available";
  }

  const date =
    typeof value === "number" ? new Date(value * 1000) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Not available";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export function statusTone(status: AgentKeypair["status"]): StatusTone {
  if (status === "active") {
    return "success";
  }

  if (status === "revoked" || status === "suspended") {
    return "danger";
  }

  return "warning";
}

export function isRevokable(status: AgentKeypair["status"]) {
  return status === "active" || status === "suspended";
}
