import { PublicKey } from "@solana/web3.js";
import type { Json } from "@/lib/supabase/types";

export const CONDUIT_DEVICE_APPROVAL_VERSION =
  "aura.conduit_device_approval.v1";
export const CONDUIT_APPROVAL_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export const CONDUIT_SESSION_EXPIRY_OPTIONS = new Set([
  "7",
  "30",
  "90",
  "never",
]);

export interface ConduitApprovalMessageInput {
  origin: string;
  userId: string;
  email: string | null;
  walletAddress: string;
  walletId: string;
  deviceCodeId: string;
  userCode: string;
  clientName: string | null;
  agentId: string | null;
  agentLabel: string | null;
  sessionPublicKey: string | null;
  scopes: string[];
  treasuryPda: string | null;
  expiresInDays: string;
  autoApprove: Json;
  nonce: string;
  issuedAt: string;
  expiresAt: string;
}

export function normalizeConduitApprovalExpiry(value: unknown) {
  const option = typeof value === "string" ? value : "90";

  if (!CONDUIT_SESSION_EXPIRY_OPTIONS.has(option)) {
    throw new Error("Choose a valid expiry window.");
  }

  if (option === "never") {
    return {
      option,
      sessionExpiresAt: null,
    };
  }

  const date = new Date();
  date.setDate(date.getDate() + Number(option));

  return {
    option,
    sessionExpiresAt: date.toISOString(),
  };
}

export function normalizeConduitApprovalTreasury(
  value: unknown,
  fallback: string | null,
) {
  if (typeof value !== "string" || !value.trim()) {
    return fallback;
  }

  try {
    return new PublicKey(value.trim()).toBase58();
  } catch {
    throw new Error("Treasury must be a valid Solana address.");
  }
}

export function normalizeConduitApprovalAutoApprove(value: unknown): Json {
  if (value === undefined || value === null || value === "never") {
    return "never";
  }

  if (typeof value === "string") {
    return value.slice(0, 80);
  }

  if (typeof value === "object" && !Array.isArray(value)) {
    return JSON.parse(JSON.stringify(value)) as Json;
  }

  throw new Error("Auto approval policy must be a string or object.");
}

export function buildConduitDeviceApprovalMessage(
  input: ConduitApprovalMessageInput,
) {
  return [
    "AURA Conduit device approval",
    "",
    `Origin: ${input.origin}`,
    `Account ID: ${input.userId}`,
    `Email: ${input.email ?? "unavailable"}`,
    `Wallet: ${input.walletAddress}`,
    `Wallet ID: ${input.walletId}`,
    `Conduit Authorization ID: ${input.deviceCodeId}`,
    `Authorization Code: ${input.userCode}`,
    `Client: ${input.clientName ?? "Conduit runtime"}`,
    `Agent ID: ${input.agentId ?? "generated on approval"}`,
    `Agent Label: ${input.agentLabel ?? "generated on approval"}`,
    `Signer Public Key: ${input.sessionPublicKey ?? "session only"}`,
    `Scopes: ${input.scopes.join(", ")}`,
    `Treasury: ${input.treasuryPda ?? "unscoped"}`,
    `Session Expiry: ${input.expiresInDays}`,
    `Auto Approve: ${JSON.stringify(input.autoApprove)}`,
    `Nonce: ${input.nonce}`,
    `Issued At: ${input.issuedAt}`,
    `Expires At: ${input.expiresAt}`,
    `Version: ${CONDUIT_DEVICE_APPROVAL_VERSION}`,
    "",
    "Only sign this if you started this Conduit login and trust this AURA origin.",
  ].join("\n");
}

export function getConduitApprovalMetadataObject(metadata: Json) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, Json | undefined>;
}

export function getConduitApprovalMetadataString(metadata: Json, key: string) {
  const value = getConduitApprovalMetadataObject(metadata)[key];
  return typeof value === "string" ? value : null;
}

export function getConduitApprovalMetadataStringArray(
  metadata: Json,
  key: string,
) {
  const value = getConduitApprovalMetadataObject(metadata)[key];

  if (!Array.isArray(value)) {
    return null;
  }

  const strings = value.filter(
    (item): item is string => typeof item === "string",
  );

  return strings.length === value.length ? strings : null;
}
