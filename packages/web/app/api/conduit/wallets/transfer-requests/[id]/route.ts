import { NextResponse } from "next/server";
import {
  assertConduitScope,
  authenticateConduitAgent,
} from "@/lib/conduit/agent-token";
import {
  getTransferRequestDisplayStatus,
  getTransferRequestSummary,
} from "@/lib/wallets/transfer-requests";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not load transfer request.";
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

function nextActionForDisplayStatus(status: string) {
  switch (status) {
    case "pending":
      return "owner_review_required";
    case "approved":
      return "approved_owner_review_recorded";
    case "consumed":
      return "complete";
    case "expired":
      return "create_new_request";
    case "rejected":
      return "owner_rejected";
    default:
      return "none";
  }
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  let auth: Awaited<ReturnType<typeof authenticateConduitAgent>>;

  try {
    auth = await authenticateConduitAgent(request);
    assertConduitScope(auth.session, "wallet:transfer");
  } catch (cause) {
    return jsonError(getErrorMessage(cause), getAuthErrorStatus(cause));
  }

  const { id } = await params;
  const { data: signRequest, error: requestError } = await auth.admin
    .from("sign_requests")
    .select("*")
    .eq("id", id)
    .eq("owner_id", auth.session.owner_id)
    .eq("agent_session_id", auth.session.id)
    .eq("request_kind", "wallet_withdrawal_approval")
    .maybeSingle();

  if (requestError) {
    return jsonError(requestError.message, 500);
  }

  if (!signRequest) {
    return jsonError(
      "Transfer request not found for this Conduit session.",
      404,
    );
  }

  const displayStatus = getTransferRequestDisplayStatus(signRequest);
  const url = new URL(request.url);

  return NextResponse.json({
    signRequest,
    transfer: getTransferRequestSummary(signRequest),
    displayStatus,
    dashboardUrl: `${url.origin}/dashboard/wallets`,
    nextAction: nextActionForDisplayStatus(displayStatus),
    runtimeCanExecute: false,
    note:
      displayStatus === "approved"
        ? "Owner approval is recorded for this reviewed request. This status endpoint only polls review state."
        : "Conduit can poll this request status; execution happens only through policy-allowed bound transfer requests.",
  });
}
