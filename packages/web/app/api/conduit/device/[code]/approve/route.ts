import { NextResponse } from "next/server";
import { hashAgentToken, mintAgentToken } from "@/lib/agents/tokens";
import { getPrimaryAccountWallet } from "@/lib/auth/primary-wallet";
import {
  normalizeSolanaWalletAddress,
  verifySolanaWalletSignature,
} from "@/lib/auth/wallet-linking";
import {
  CONDUIT_DEVICE_APPROVAL_VERSION,
  getConduitApprovalMetadataObject,
  getConduitApprovalMetadataString,
  getConduitApprovalMetadataStringArray,
} from "@/lib/conduit/device-approval";
import {
  encryptHandoffToken,
  expiresAtFromNow,
  formatUserCode,
  secondsUntil,
  TOKEN_HANDOFF_TTL_SECONDS,
} from "@/lib/conduit/device-flow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Database, DeviceCodeRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

const AGENT_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const MAX_AGENT_ID_BYTES = 64;

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;
type AgentSessionInsert =
  Database["public"]["Tables"]["agent_sessions"]["Insert"];

interface ApproveDeviceBody {
  challengeId?: unknown;
  walletAddress?: unknown;
  signature?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not approve Conduit authorization.";
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function getString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function slugAgentId(value: string) {
  const compact = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/[-:.]+$/g, "");

  return compact || "conduit-agent";
}

function getBaseAgentId(device: DeviceCodeRow) {
  const requested = device.requested_agent_id?.trim();

  if (
    requested &&
    AGENT_ID_PATTERN.test(requested) &&
    byteLength(requested) <= MAX_AGENT_ID_BYTES
  ) {
    return requested;
  }

  return slugAgentId(
    device.requested_agent_label ??
      device.client_name ??
      `conduit-${device.user_code}`,
  );
}

async function createUniqueAgentId(
  admin: AdminClient,
  ownerId: string,
  baseAgentId: string,
) {
  for (let suffix = 0; suffix < 100; suffix += 1) {
    const suffixText = suffix === 0 ? "" : `-${suffix + 1}`;
    const candidate = `${baseAgentId.slice(
      0,
      MAX_AGENT_ID_BYTES - suffixText.length,
    )}${suffixText}`;

    const { data: duplicate, error } = await admin
      .from("agent_sessions")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("agent_id", candidate)
      .limit(1)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (!duplicate) {
      return candidate;
    }
  }

  throw new Error("Could not allocate a unique agent ID.");
}

async function cleanupSession(admin: AdminClient, sessionId: string) {
  await admin.from("agent_sessions").delete().eq("id", sessionId);
}

function serializeDeviceCode(device: DeviceCodeRow) {
  return {
    id: device.id,
    userCode: device.user_code,
    status: device.status,
    expiresAt: device.expires_at,
    expiresIn: secondsUntil(device.expires_at),
    approvedAt: device.approved_at,
    approvedSessionId: device.approved_session_id,
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

  let body: ApproveDeviceBody;

  try {
    body = (await request.json()) as ApproveDeviceBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let code: string;
  let challengeId: string;
  let walletAddress: string;
  let signature: string;

  try {
    code = formatUserCode((await params).code);
    challengeId = getString(body.challengeId, "Approval challenge ID");
    walletAddress = normalizeSolanaWalletAddress(body.walletAddress);
    signature = getString(body.signature, "Wallet signature");
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  let admin: AdminClient;

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
    return jsonError("Unknown or expired Conduit authorization code.", 404);
  }

  if (device.owner_id && device.owner_id !== user.id) {
    return jsonError(
      "This Conduit authorization code belongs to another account.",
      403,
    );
  }

  if (device.status !== "pending") {
    return jsonError(
      `This Conduit authorization code is already ${device.status}.`,
      409,
    );
  }

  if (new Date(device.expires_at) <= new Date()) {
    await admin
      .from("device_codes")
      .update({ status: "expired" })
      .eq("id", device.id)
      .eq("status", "pending");
    return jsonError("This Conduit authorization code has expired.", 410);
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
      "Wallet signature must come from the primary owner wallet.",
      409,
    );
  }

  const { data: challenge, error: challengeError } = await admin
    .from("conduit_device_approval_challenges")
    .select("*")
    .eq("id", challengeId)
    .eq("owner_id", user.id)
    .eq("device_code_id", device.id)
    .maybeSingle();

  if (challengeError) {
    return jsonError(challengeError.message, 500);
  }

  if (!challenge) {
    return jsonError("Approval challenge was not found.", 404);
  }

  if (challenge.status !== "pending" || challenge.used_at) {
    return jsonError("Approval challenge has already been used.", 409);
  }

  if (new Date(challenge.expires_at).getTime() <= Date.now()) {
    await admin
      .from("conduit_device_approval_challenges")
      .update({ status: "expired" })
      .eq("id", challenge.id)
      .eq("status", "pending");
    return jsonError("Approval challenge has expired.", 410);
  }

  if (
    challenge.wallet_address_canonical !== walletAddress ||
    challenge.wallet_id !== primaryWallet.id
  ) {
    return jsonError("Approval challenge is not for this owner wallet.", 403);
  }

  const signatureValid = verifySolanaWalletSignature({
    walletAddress,
    message: challenge.message,
    signature,
  });

  if (!signatureValid) {
    return jsonError("Owner wallet signature could not be verified.", 400);
  }

  const signedMetadata = getConduitApprovalMetadataObject(challenge.metadata);
  const scopes =
    getConduitApprovalMetadataStringArray(challenge.metadata, "scopes") ??
    device.requested_scopes;
  const treasuryPda = getConduitApprovalMetadataString(
    challenge.metadata,
    "treasury_pda",
  );
  const expiresAt = getConduitApprovalMetadataString(
    challenge.metadata,
    "session_expires_at",
  );
  const autoApprove = signedMetadata.auto_approve ?? "never";
  const sessionPubkey = getConduitApprovalMetadataString(
    challenge.metadata,
    "session_public_key",
  );

  if (
    signedMetadata.version !== CONDUIT_DEVICE_APPROVAL_VERSION ||
    signedMetadata.device_code_id !== device.id ||
    signedMetadata.wallet_address !== walletAddress
  ) {
    return jsonError("Approval challenge metadata is invalid.", 400);
  }

  let agentId: string;

  try {
    agentId = await createUniqueAgentId(admin, user.id, getBaseAgentId(device));
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  const agentToken = mintAgentToken();
  let handoff: ReturnType<typeof encryptHandoffToken>;

  try {
    handoff = encryptHandoffToken(agentToken);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  const handoffExpiresAt = expiresAtFromNow(TOKEN_HANDOFF_TTL_SECONDS);
  const displayName =
    device.requested_agent_label ?? device.client_name ?? agentId;
  const sessionInput: AgentSessionInsert = {
    owner_id: user.id,
    agent_id: agentId,
    agent_label: displayName,
    treasury_pda: treasuryPda,
    scopes,
    expires_at: expiresAt,
    metadata: {
      auto_approve: autoApprove,
      authority_public_key: sessionPubkey,
      client_name: device.client_name,
      created_via: "conduit_device_flow",
      device_code_id: device.id,
      device_user_code: device.user_code,
      identity_status: sessionPubkey ? "authority_recorded" : "session_only",
      onchain_status: "not_bound",
      owner_wallet: primaryWallet.wallet_address,
      owner_wallet_id: primaryWallet.id,
      publicKey: sessionPubkey,
      requested_caps: device.requested_caps,
      token_prefix: "aurak",
      treasury_scope_status: treasuryPda ? "requested" : "unscoped",
      wallet_approval: {
        version: CONDUIT_DEVICE_APPROVAL_VERSION,
        challenge_id: challenge.id,
        wallet_id: primaryWallet.id,
        wallet_address: primaryWallet.wallet_address,
        signed_at: new Date().toISOString(),
      },
      wallet_approval_signature: signature,
    },
  };

  const { data: session, error: sessionError } = await admin
    .from("agent_sessions")
    .insert(sessionInput)
    .select("*")
    .single();

  if (sessionError) {
    return jsonError(sessionError.message, 500);
  }

  const { error: secretError } = await admin
    .from("agent_session_secrets")
    .insert({
      session_id: session.id,
      token_hash: hashAgentToken(agentToken),
    });

  if (secretError) {
    await cleanupSession(admin, session.id);
    return jsonError(secretError.message, 500);
  }

  const { error: handoffError } = await admin
    .from("device_token_handoffs")
    .insert({
      device_code_id: device.id,
      agent_session_id: session.id,
      token_ciphertext: handoff.tokenCiphertext,
      token_iv: handoff.tokenIv,
      token_tag: handoff.tokenTag,
      expires_at: handoffExpiresAt,
    });

  if (handoffError) {
    await cleanupSession(admin, session.id);
    return jsonError(handoffError.message, 500);
  }

  const approvedAt = new Date().toISOString();
  const { data: approvedDevice, error: approveError } = await admin
    .from("device_codes")
    .update({
      owner_id: user.id,
      status: "approved",
      approved_session_id: session.id,
      approved_at: approvedAt,
    })
    .eq("id", device.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (approveError) {
    await cleanupSession(admin, session.id);
    return jsonError(approveError.message, 500);
  }

  if (!approvedDevice) {
    await cleanupSession(admin, session.id);
    return jsonError("This Conduit authorization was already handled.", 409);
  }

  await admin
    .from("conduit_device_approval_challenges")
    .update({ status: "used", used_at: approvedAt })
    .eq("id", challenge.id)
    .eq("status", "pending");

  await admin.from("activity_events").insert({
    owner_id: user.id,
    agent_session_id: session.id,
    treasury_pda: treasuryPda,
    event_kind: "conduit.device.approved",
    severity: "success",
    title: "Conduit device approved",
    summary: `${displayName} can now authenticate with a Conduit device-flow token.`,
    metadata: {
      agent_id: agentId,
      client_name: device.client_name,
      device_code_id: device.id,
      approval_challenge_id: challenge.id,
      approval_wallet: primaryWallet.wallet_address,
      approval_wallet_id: primaryWallet.id,
      approval_version: CONDUIT_DEVICE_APPROVAL_VERSION,
      approval_signature: signature,
      scopes,
      treasury_pda: treasuryPda,
    },
  });

  return NextResponse.json({
    device: serializeDeviceCode(approvedDevice),
    session,
  });
}
