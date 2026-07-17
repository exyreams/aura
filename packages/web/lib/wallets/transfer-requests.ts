import type { Json, SignRequestRow } from "@/lib/supabase/types";

export const WALLET_TRANSFER_REVIEW_VERSION = "aura.wallet_transfer_review.v1";

export interface TransferRequestSummary {
  walletId: string | null;
  walletLabel: string | null;
  walletAddress: string | null;
  walletChain: string | null;
  agentSessionId: string | null;
  agentId: string | null;
  agentLabel: string | null;
  amountUi: string | null;
  rawAmount: string | null;
  decimals: number | null;
  assetKind: string | null;
  assetSymbol: string | null;
  assetName: string | null;
  recipientAddress: string | null;
  note: string | null;
  permissionId: string | null;
  permissionScopes: string[];
  sourceKind: string | null;
}

export interface WalletTransferReviewMessageInput {
  origin: string;
  userId: string;
  email: string | null;
  walletAddress: string;
  action: "approve";
  request: SignRequestRow;
}

function record(value: Json | unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, Json | undefined>;
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function numberValue(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayValue(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string");
}

export function getTransferRequestSummary(
  request: SignRequestRow,
): TransferRequestSummary {
  const payload = record(request.payload);
  const wallet = record(payload?.wallet);
  const agent = record(payload?.agent);
  const transfer = record(payload?.transfer);
  const permission = record(payload?.permission);
  const source = record(payload?.source);

  return {
    walletId: stringValue(wallet?.id),
    walletLabel: stringValue(wallet?.label),
    walletAddress: stringValue(wallet?.chain_address),
    walletChain: stringValue(wallet?.chain_name),
    agentSessionId: stringValue(agent?.id) ?? request.agent_session_id,
    agentId: stringValue(agent?.agent_id),
    agentLabel: stringValue(agent?.label),
    amountUi: stringValue(transfer?.amount_ui),
    rawAmount: stringValue(transfer?.raw_amount),
    decimals: numberValue(transfer?.decimals),
    assetKind: stringValue(transfer?.asset_kind),
    assetSymbol: stringValue(transfer?.symbol),
    assetName: stringValue(transfer?.name),
    recipientAddress: stringValue(transfer?.recipient_address),
    note: stringValue(transfer?.note),
    permissionId: stringValue(permission?.id),
    permissionScopes: stringArrayValue(permission?.scopes),
    sourceKind: stringValue(source?.kind) ?? stringValue(payload?.created_via),
  };
}

export function isSignRequestExpired(
  request: SignRequestRow,
  now = Date.now(),
) {
  return Boolean(
    request.expires_at && new Date(request.expires_at).getTime() <= now,
  );
}

export function getTransferRequestDisplayStatus(request: SignRequestRow) {
  if (request.status === "pending" && isSignRequestExpired(request)) {
    return "expired";
  }

  return request.status;
}

export function getTransferRequestStatusTone(request: SignRequestRow) {
  const status = getTransferRequestDisplayStatus(request);

  if (status === "pending") {
    return "warning" as const;
  }

  if (status === "approved" || status === "consumed") {
    return "success" as const;
  }

  if (status === "rejected" || status === "expired") {
    return "danger" as const;
  }

  return "neutral" as const;
}

export function canApproveTransferRequest(request: SignRequestRow) {
  return (
    request.status === "pending" &&
    request.request_kind === "wallet_withdrawal_approval" &&
    !isSignRequestExpired(request)
  );
}

export function canRejectTransferRequest(request: SignRequestRow) {
  return request.status === "pending" && !isSignRequestExpired(request);
}

export function canRevokeTransferRequest(request: SignRequestRow) {
  return request.status === "approved";
}

export function buildWalletTransferReviewMessage(
  input: WalletTransferReviewMessageInput,
) {
  const summary = getTransferRequestSummary(input.request);

  return [
    "AURA wallet transfer approval",
    "",
    `Origin: ${input.origin}`,
    `Account ID: ${input.userId}`,
    `Email: ${input.email ?? "unavailable"}`,
    `Owner Wallet: ${input.walletAddress}`,
    `Action: ${input.action}`,
    `Request ID: ${input.request.id}`,
    `Request Kind: ${input.request.request_kind}`,
    `Request Status: ${input.request.status}`,
    `Created At: ${input.request.created_at}`,
    `Expires At: ${input.request.expires_at ?? "none"}`,
    `Wallet ID: ${summary.walletId ?? "unknown"}`,
    `Wallet Label: ${summary.walletLabel ?? "unknown"}`,
    `Wallet Chain: ${summary.walletChain ?? "unknown"}`,
    `Wallet Address: ${summary.walletAddress ?? "unknown"}`,
    `Agent Session ID: ${summary.agentSessionId ?? "unknown"}`,
    `Agent ID: ${summary.agentId ?? "unknown"}`,
    `Agent Label: ${summary.agentLabel ?? "unknown"}`,
    `Asset: ${summary.assetSymbol ?? "unknown"}`,
    `Asset Kind: ${summary.assetKind ?? "unknown"}`,
    `Amount: ${summary.amountUi ?? "unknown"}`,
    `Raw Amount: ${summary.rawAmount ?? "unknown"}`,
    `Decimals: ${summary.decimals ?? "unknown"}`,
    `Recipient: ${summary.recipientAddress ?? "unknown"}`,
    `Note: ${summary.note ?? "none"}`,
    `Permission ID: ${summary.permissionId ?? "unknown"}`,
    `Permission Scopes: ${summary.permissionScopes.join(", ") || "none"}`,
    `Source: ${summary.sourceKind ?? "unknown"}`,
    `Version: ${WALLET_TRANSFER_REVIEW_VERSION}`,
    "",
    "Only sign this if you reviewed this transfer request in the AURA dashboard. Signing approves the request for the agent runtime; it does not submit an on-chain transaction by itself.",
  ].join("\n");
}
