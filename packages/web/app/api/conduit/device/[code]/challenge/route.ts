import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { getPrimaryAccountWallet } from "@/lib/auth/primary-wallet";
import { normalizeSolanaWalletAddress } from "@/lib/auth/wallet-linking";
import {
  buildConduitDeviceApprovalMessage,
  CONDUIT_APPROVAL_CHALLENGE_TTL_MS,
  CONDUIT_DEVICE_APPROVAL_VERSION,
  normalizeConduitApprovalAutoApprove,
  normalizeConduitApprovalExpiry,
  normalizeConduitApprovalTreasury,
} from "@/lib/conduit/device-approval";
import {
  formatUserCode,
  normalizeDeviceScopes,
  secondsUntil,
} from "@/lib/conduit/device-flow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DeviceCodeRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

interface ChallengeBody {
  walletAddress?: unknown;
  treasuryPda?: unknown;
  treasury_pubkey?: unknown;
  expiresInDays?: unknown;
  autoApprove?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not create approval challenge.";
}

function serializeDeviceCode(device: DeviceCodeRow) {
  return {
    id: device.id,
    userCode: device.user_code,
    status: device.status,
    expiresAt: device.expires_at,
    expiresIn: secondsUntil(device.expires_at),
  };
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before approving a Conduit device.", 401);
  }

  let body: ChallengeBody;

  try {
    body = (await request.json()) as ChallengeBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let code: string;
  let walletAddress: string;

  try {
    code = formatUserCode((await params).code);
    walletAddress = normalizeSolanaWalletAddress(body.walletAddress);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;

  try {
    admin = createSupabaseAdminClient();
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  const { data: device, error: deviceError } = await admin
    .from("device_codes")
    .select("*")
    .eq("user_code", code)
    .maybeSingle();

  if (deviceError) {
    return jsonError(deviceError.message, 500);
  }

  if (!device) {
    return jsonError("Unknown or expired device code.", 404);
  }

  if (device.owner_id && device.owner_id !== user.id) {
    return jsonError("This device code belongs to another account.", 403);
  }

  if (device.status !== "pending") {
    return jsonError(`This device code is already ${device.status}.`, 409);
  }

  if (new Date(device.expires_at).getTime() <= Date.now()) {
    await admin
      .from("device_codes")
      .update({ status: "expired" })
      .eq("id", device.id)
      .eq("status", "pending");
    return jsonError("This device code has expired.", 410);
  }

  let primaryWallet: Awaited<ReturnType<typeof getPrimaryAccountWallet>>;

  try {
    primaryWallet = await getPrimaryAccountWallet(admin, user.id);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  if (!primaryWallet) {
    return jsonError(
      "Set up a primary owner wallet before approving Conduit devices.",
      409,
    );
  }

  if (primaryWallet.wallet_address !== walletAddress) {
    return jsonError(
      "Connect the primary owner wallet before approving this device.",
      409,
    );
  }

  let scopes: string[];
  let treasuryPda: string | null;
  let expiresInDays: string;
  let sessionExpiresAt: string | null;
  let autoApprove: ReturnType<typeof normalizeConduitApprovalAutoApprove>;

  try {
    scopes = normalizeDeviceScopes(device.requested_scopes);
    treasuryPda = normalizeConduitApprovalTreasury(
      body.treasuryPda ?? body.treasury_pubkey,
      device.requested_treasury_pda,
    );
    const expiry = normalizeConduitApprovalExpiry(body.expiresInDays);
    expiresInDays = expiry.option;
    sessionExpiresAt = expiry.sessionExpiresAt;
    autoApprove = normalizeConduitApprovalAutoApprove(body.autoApprove);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  const url = new URL(request.url);
  const issuedAt = new Date();
  const expiresAt = new Date(
    issuedAt.getTime() + CONDUIT_APPROVAL_CHALLENGE_TTL_MS,
  );
  const nonce = randomBytes(24).toString("base64url");
  const message = buildConduitDeviceApprovalMessage({
    origin: url.origin,
    userId: user.id,
    email: user.email ?? null,
    walletAddress,
    walletId: primaryWallet.id,
    deviceCodeId: device.id,
    userCode: device.user_code,
    clientName: device.client_name,
    agentId: device.requested_agent_id,
    agentLabel: device.requested_agent_label,
    scopes,
    treasuryPda,
    expiresInDays,
    autoApprove,
    nonce,
    issuedAt: issuedAt.toISOString(),
    expiresAt: expiresAt.toISOString(),
  });

  const { data: challenge, error: challengeError } = await admin
    .from("conduit_device_approval_challenges")
    .insert({
      owner_id: user.id,
      device_code_id: device.id,
      wallet_id: primaryWallet.id,
      wallet_address: walletAddress,
      wallet_address_canonical: walletAddress,
      nonce,
      message,
      expires_at: expiresAt.toISOString(),
      metadata: {
        version: CONDUIT_DEVICE_APPROVAL_VERSION,
        origin: url.origin,
        issued_at: issuedAt.toISOString(),
        device_code_id: device.id,
        device_user_code: device.user_code,
        scopes,
        treasury_pda: treasuryPda,
        expires_in_days: expiresInDays,
        session_expires_at: sessionExpiresAt,
        auto_approve: autoApprove,
        wallet_id: primaryWallet.id,
        wallet_address: walletAddress,
      },
    })
    .select("id,message,expires_at")
    .single();

  if (challengeError) {
    return jsonError(challengeError.message, 500);
  }

  return NextResponse.json({
    challengeId: challenge.id,
    message: challenge.message,
    expiresAt: challenge.expires_at,
    walletAddress,
    device: serializeDeviceCode(device),
  });
}
