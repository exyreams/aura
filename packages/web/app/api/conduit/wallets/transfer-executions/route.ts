import { PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { NextResponse } from "next/server";
import {
  assertConduitScope,
  authenticateConduitAgent,
} from "@/lib/conduit/agent-token";
import type { Json, WalletRegistryRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

const MAX_METADATA_BYTES = 12_288;

interface TransferExecutionBody {
  walletId?: unknown;
  proposalId?: unknown;
  recipientAddress?: unknown;
  rawAmount?: unknown;
  amountUi?: unknown;
  assetSymbol?: unknown;
  messageHashHex?: unknown;
  messageApprovalPda?: unknown;
  proposalSignature?: unknown;
  executeSignature?: unknown;
  finalizeSignature?: unknown;
  transferSignature?: unknown;
  markSettlementSignature?: unknown;
  confirmSettlementSignature?: unknown;
  metadata?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not record transfer execution.";
}

function getAuthErrorStatus(error: unknown) {
  const message = getErrorMessage(error);

  if (message.includes("Missing Conduit bearer token")) {
    return 401;
  }

  if (
    message.includes("Unknown or revoked") ||
    message.includes("expired") ||
    message.includes("revoked") ||
    message.includes("missing wallet:transfer")
  ) {
    return 403;
  }

  return 400;
}

function getString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function getOptionalString(value: unknown, maxLength = 240) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim().slice(0, maxLength);
}

function getUnsignedInteger(value: unknown, label: string) {
  const text =
    typeof value === "number" && Number.isInteger(value)
      ? String(value)
      : getString(value, label);

  if (!/^\d+$/u.test(text)) {
    throw new Error(`${label} must be an unsigned integer.`);
  }

  return text;
}

function getPublicKey(value: unknown, label: string) {
  const text = getString(value, label);

  try {
    return new PublicKey(text).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana address.`);
  }
}

function getSignature(value: unknown, label: string) {
  const signature = getString(value, label);

  try {
    if (bs58.decode(signature).length !== 64) {
      throw new Error("Invalid signature length.");
    }
  } catch {
    throw new Error(`${label} must be a valid Solana signature.`);
  }

  return signature;
}

function normalizeMetadata(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_METADATA_BYTES) {
    throw new Error("Metadata is too large.");
  }

  return JSON.parse(serialized) as Json;
}

async function loadWallet(
  auth: Awaited<ReturnType<typeof authenticateConduitAgent>>,
  walletId: string,
) {
  const { data: wallet, error } = await auth.admin
    .from("wallet_registry")
    .select("*")
    .eq("id", walletId)
    .eq("owner_id", auth.session.owner_id)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!wallet) {
    throw new Error("Wallet not found for this owner.");
  }

  return wallet;
}

async function assertWalletPermission(
  auth: Awaited<ReturnType<typeof authenticateConduitAgent>>,
  wallet: WalletRegistryRow,
) {
  const { data: permission, error } = await auth.admin
    .from("agent_wallet_permissions")
    .select("id")
    .eq("owner_id", auth.session.owner_id)
    .eq("wallet_id", wallet.id)
    .eq("agent_session_id", auth.session.id)
    .eq("status", "active")
    .contains("scopes", ["wallet:transfer"])
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!permission) {
    throw new Error("Grant wallet transfer access to this signer agent first.");
  }
}

export async function POST(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateConduitAgent>>;
  let body: TransferExecutionBody;

  try {
    auth = await authenticateConduitAgent(request);
    assertConduitScope(auth.session, "wallet:transfer");
    body = (await request.json()) as TransferExecutionBody;
  } catch (cause) {
    return jsonError(getErrorMessage(cause), getAuthErrorStatus(cause));
  }

  let walletId: string;
  let proposalId: string;
  let recipientAddress: string;
  let rawAmount: string;
  let amountUi: string | null;
  let assetSymbol: string | null;
  let messageHashHex: string | null;
  let messageApprovalPda: string | null;
  let proposalSignature: string;
  let executeSignature: string;
  let finalizeSignature: string;
  let transferSignature: string;
  let markSettlementSignature: string;
  let confirmSettlementSignature: string;
  let metadata: Json;

  try {
    walletId = getString(body.walletId, "Wallet ID");
    proposalId = getUnsignedInteger(body.proposalId, "Proposal ID");
    recipientAddress = getPublicKey(body.recipientAddress, "Recipient");
    rawAmount = getUnsignedInteger(body.rawAmount, "Raw amount");
    amountUi = getOptionalString(body.amountUi, 80);
    assetSymbol = getOptionalString(body.assetSymbol, 24);
    messageHashHex = getOptionalString(body.messageHashHex, 64);
    messageApprovalPda =
      body.messageApprovalPda === null || body.messageApprovalPda === undefined
        ? null
        : getPublicKey(body.messageApprovalPda, "Message approval PDA");
    proposalSignature = getSignature(
      body.proposalSignature,
      "Proposal signature",
    );
    executeSignature = getSignature(body.executeSignature, "Execute signature");
    finalizeSignature = getSignature(
      body.finalizeSignature,
      "Finalize signature",
    );
    transferSignature = getSignature(
      body.transferSignature,
      "Transfer signature",
    );
    markSettlementSignature = getSignature(
      body.markSettlementSignature,
      "Mark settlement signature",
    );
    confirmSettlementSignature = getSignature(
      body.confirmSettlementSignature,
      "Confirm settlement signature",
    );
    metadata = normalizeMetadata(body.metadata);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  let wallet: WalletRegistryRow;

  try {
    wallet = await loadWallet(auth, walletId);
    await assertWalletPermission(auth, wallet);
  } catch (cause) {
    const message = getErrorMessage(cause);
    return jsonError(message, message.includes("Wallet not found") ? 404 : 409);
  }

  const recordedAt = new Date().toISOString();
  const eventMetadata: Json = {
    version: "aura.wallet_transfer_execution.v1",
    wallet_id: wallet.id,
    proposal_id: proposalId,
    recipient_address: recipientAddress,
    raw_amount: rawAmount,
    amount_ui: amountUi,
    asset_symbol: assetSymbol,
    message_hash: messageHashHex,
    message_approval_pda: messageApprovalPda,
    signatures: {
      proposal: proposalSignature,
      execute_pending: executeSignature,
      finalize_execution: finalizeSignature,
      target_transfer: transferSignature,
      mark_settlement_broadcast: markSettlementSignature,
      confirm_settlement: confirmSettlementSignature,
    },
    source: {
      kind: "conduit_agent",
      conduit_session_id: auth.session.id,
      conduit_agent_id: auth.session.agent_id,
    },
    recorded_at: recordedAt,
    metadata,
  };

  const { error } = await auth.admin.from("activity_events").insert({
    owner_id: auth.session.owner_id,
    agent_session_id: auth.session.id,
    treasury_pda: wallet.treasury_pda ?? auth.session.treasury_pda,
    wallet_id: wallet.id,
    event_kind: "wallet.transfer.executed_by_agent",
    severity: "success",
    title: "Transfer executed by agent",
    summary: `${amountUi ?? rawAmount} ${assetSymbol ?? "SOL"} sent to ${recipientAddress}.`,
    tx_signature: transferSignature,
    proposal_id: proposalId,
    metadata: eventMetadata,
  });

  if (error) {
    return jsonError(error.message, 500);
  }

  return NextResponse.json({
    status: "recorded",
    recordedAt,
    transferSignature,
  });
}
