import { NextResponse } from "next/server";
import { getPrimaryAccountWallet } from "@/lib/auth/primary-wallet";
import {
  normalizeSolanaWalletAddress,
  verifySolanaWalletSignature,
} from "@/lib/auth/wallet-linking";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json, SignRequestRow } from "@/lib/supabase/types";
import {
  buildWalletTransferReviewMessage,
  canApproveTransferRequest,
  canRejectTransferRequest,
  canRevokeTransferRequest,
  getTransferRequestSummary,
  isSignRequestExpired,
  WALLET_TRANSFER_REVIEW_VERSION,
} from "@/lib/wallets/transfer-requests";

export const runtime = "nodejs";

type ReviewAction = "approve" | "reject" | "revoke";

interface ReviewTransferRequestBody {
  action?: unknown;
  walletAddress?: unknown;
  signature?: unknown;
  reason?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not update transfer request.";
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

function getAction(value: unknown): ReviewAction {
  if (value === "approve" || value === "reject" || value === "revoke") {
    return value;
  }

  throw new Error("Choose a valid review action.");
}

function metadataObject(metadata: unknown): Record<string, Json | undefined> {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata as Record<string, Json | undefined>;
}

function appendReviewMetadata(
  request: SignRequestRow,
  review: Record<string, Json | undefined>,
) {
  return {
    ...metadataObject(request.payload),
    owner_review: {
      ...metadataObject(metadataObject(request.payload).owner_review),
      ...review,
    },
  } satisfies Json;
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before reviewing transfer requests.", 401);
  }

  let body: ReviewTransferRequestBody;

  try {
    body = (await request.json()) as ReviewTransferRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let action: ReviewAction;
  let reason: string | null;

  try {
    action = getAction(body.action);
    reason = getOptionalString(body.reason);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;

  try {
    admin = createSupabaseAdminClient();
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  const { id } = await params;
  const { data: signRequest, error: requestError } = await admin
    .from("sign_requests")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .eq("request_kind", "wallet_withdrawal_approval")
    .maybeSingle();

  if (requestError) {
    return jsonError(requestError.message, 500);
  }

  if (!signRequest) {
    return jsonError("Transfer request not found for this owner.", 404);
  }

  if (isSignRequestExpired(signRequest) && signRequest.status === "pending") {
    const { data: expiredRequest, error: expireError } = await admin
      .from("sign_requests")
      .update({
        status: "expired",
        payload: appendReviewMetadata(signRequest, {
          version: WALLET_TRANSFER_REVIEW_VERSION,
          reviewed_via: "owner_web",
          action: "expire",
          expired_at: new Date().toISOString(),
        }),
      })
      .eq("id", signRequest.id)
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .select("*")
      .single();

    if (expireError) {
      return jsonError(expireError.message, 500);
    }

    return jsonError(
      expiredRequest
        ? "This transfer request has expired."
        : "This transfer request is no longer pending.",
      410,
    );
  }

  const summary = getTransferRequestSummary(signRequest);
  const reviewedAt = new Date().toISOString();

  if (action === "approve") {
    if (!canApproveTransferRequest(signRequest)) {
      return jsonError("Only pending transfer requests can be approved.", 409);
    }

    let primaryWallet: Awaited<ReturnType<typeof getPrimaryAccountWallet>>;
    let walletAddress: string;
    let signature: string;

    try {
      primaryWallet = await getPrimaryAccountWallet(admin, user.id);
      walletAddress = normalizeSolanaWalletAddress(body.walletAddress);
      signature = getString(body.signature, "Owner approval signature");
    } catch (cause) {
      return jsonError(getErrorMessage(cause), 400);
    }

    if (!primaryWallet) {
      return jsonError(
        "Set up a primary owner wallet before approving transfer requests.",
        409,
      );
    }

    if (primaryWallet.wallet_address !== walletAddress) {
      return jsonError(
        "Wallet signature must come from the primary owner wallet.",
        409,
      );
    }

    const url = new URL(request.url);
    const message = buildWalletTransferReviewMessage({
      origin: url.origin,
      userId: user.id,
      email: user.email ?? null,
      walletAddress,
      action: "approve",
      request: signRequest,
    });
    const signatureValid = verifySolanaWalletSignature({
      walletAddress,
      message,
      signature,
    });

    if (!signatureValid) {
      return jsonError("Owner wallet signature could not be verified.", 400);
    }

    const { data: approvedRequest, error: approveError } = await admin
      .from("sign_requests")
      .update({
        status: "approved",
        approved_at: reviewedAt,
        signature,
        payload: appendReviewMetadata(signRequest, {
          version: WALLET_TRANSFER_REVIEW_VERSION,
          reviewed_via: "owner_web",
          action,
          approved_at: reviewedAt,
          owner_wallet: walletAddress,
          owner_wallet_id: primaryWallet.id,
          approval_signature: signature,
          approval_message: message,
          note: "Approved for agent runtime execution. No on-chain transaction was submitted by this approval.",
        }),
      })
      .eq("id", signRequest.id)
      .eq("owner_id", user.id)
      .eq("status", "pending")
      .select("*")
      .maybeSingle();

    if (approveError) {
      return jsonError(approveError.message, 500);
    }

    if (!approvedRequest) {
      return jsonError("This transfer request was already handled.", 409);
    }

    await admin.from("activity_events").insert({
      owner_id: user.id,
      agent_session_id: signRequest.agent_session_id,
      treasury_pda: signRequest.treasury_pda,
      wallet_id: summary.walletId,
      event_kind: "wallet.transfer_request.approved",
      severity: "success",
      title: "Transfer request approved",
      summary: `${summary.amountUi ?? "Unknown amount"} ${summary.assetSymbol ?? "asset"} was approved for signer-agent execution.`,
      proposal_id: signRequest.id,
      metadata: {
        version: WALLET_TRANSFER_REVIEW_VERSION,
        request_id: signRequest.id,
        owner_wallet: walletAddress,
        permission_id: summary.permissionId,
        recipient_address: summary.recipientAddress,
        note: reason,
      },
    });

    return NextResponse.json({ signRequest: approvedRequest });
  }

  if (action === "reject" && !canRejectTransferRequest(signRequest)) {
    return jsonError("Only pending transfer requests can be rejected.", 409);
  }

  if (action === "revoke" && !canRevokeTransferRequest(signRequest)) {
    return jsonError("Only approved transfer requests can be revoked.", 409);
  }

  const { data: rejectedRequest, error: rejectError } = await admin
    .from("sign_requests")
    .update({
      status: "rejected",
      rejected_at: reviewedAt,
      payload: appendReviewMetadata(signRequest, {
        version: WALLET_TRANSFER_REVIEW_VERSION,
        reviewed_via: "owner_web",
        action,
        rejected_at: reviewedAt,
        reason,
      }),
    })
    .eq("id", signRequest.id)
    .eq("owner_id", user.id)
    .in("status", action === "revoke" ? ["approved"] : ["pending"])
    .select("*")
    .maybeSingle();

  if (rejectError) {
    return jsonError(rejectError.message, 500);
  }

  if (!rejectedRequest) {
    return jsonError("This transfer request was already handled.", 409);
  }

  await admin.from("activity_events").insert({
    owner_id: user.id,
    agent_session_id: signRequest.agent_session_id,
    treasury_pda: signRequest.treasury_pda,
    wallet_id: summary.walletId,
    event_kind:
      action === "revoke"
        ? "wallet.transfer_request.revoked"
        : "wallet.transfer_request.rejected",
    severity: "warning",
    title:
      action === "revoke"
        ? "Transfer approval revoked"
        : "Transfer request rejected",
    summary:
      action === "revoke"
        ? `${summary.amountUi ?? "Unknown amount"} ${summary.assetSymbol ?? "asset"} approval was revoked before execution.`
        : `${summary.amountUi ?? "Unknown amount"} ${summary.assetSymbol ?? "asset"} request was rejected.`,
    proposal_id: signRequest.id,
    metadata: {
      version: WALLET_TRANSFER_REVIEW_VERSION,
      request_id: signRequest.id,
      action,
      reason,
      permission_id: summary.permissionId,
      recipient_address: summary.recipientAddress,
    },
  });

  return NextResponse.json({ signRequest: rejectedRequest });
}
