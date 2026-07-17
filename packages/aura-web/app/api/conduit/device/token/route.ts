import { NextResponse } from "next/server";
import { decryptHandoffToken, hashDeviceCode } from "@/lib/conduit/device-flow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

interface DeviceTokenBody {
  device_code?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not poll device token.";
}

export async function POST(request: Request) {
  let body: DeviceTokenBody;

  try {
    body = (await request.json()) as DeviceTokenBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  if (typeof body.device_code !== "string" || !body.device_code.trim()) {
    return jsonError("device_code is required.", 400);
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;

  try {
    admin = createSupabaseAdminClient();
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  const { data: secret, error: secretError } = await admin
    .from("device_code_secrets")
    .select("*")
    .eq("device_code_hash", hashDeviceCode(body.device_code.trim()))
    .maybeSingle();

  if (secretError) {
    return jsonError(secretError.message, 500);
  }

  if (!secret) {
    return jsonError("Unknown device_code.", 404);
  }

  const { data: device, error: deviceError } = await admin
    .from("device_codes")
    .select("*")
    .eq("id", secret.device_code_id)
    .maybeSingle();

  if (deviceError) {
    return jsonError(deviceError.message, 500);
  }

  if (!device) {
    return jsonError("Unknown device_code.", 404);
  }

  if (
    device.status === "pending" &&
    new Date(device.expires_at) <= new Date()
  ) {
    await admin
      .from("device_codes")
      .update({ status: "expired" })
      .eq("id", device.id)
      .eq("status", "pending");
    return NextResponse.json({ status: "expired" }, { status: 410 });
  }

  if (device.status === "pending") {
    return NextResponse.json({ status: "pending" }, { status: 202 });
  }

  if (device.status === "denied") {
    return NextResponse.json({ status: "denied" }, { status: 403 });
  }

  if (device.status === "expired") {
    return NextResponse.json({ status: "expired" }, { status: 410 });
  }

  if (device.status === "consumed") {
    return NextResponse.json(
      {
        status: "authorized",
        error: "Token already retrieved; restart the device flow.",
      },
      { status: 410 },
    );
  }

  if (!device.approved_session_id) {
    return jsonError("Approved device code is missing a session.", 500);
  }

  const { data: handoff, error: handoffError } = await admin
    .from("device_token_handoffs")
    .select("*")
    .eq("device_code_id", device.id)
    .maybeSingle();

  if (handoffError) {
    return jsonError(handoffError.message, 500);
  }

  if (!handoff || handoff.consumed_at) {
    return NextResponse.json(
      {
        status: "authorized",
        error: "Token handoff expired; restart the device flow.",
      },
      { status: 410 },
    );
  }

  const consumedAt = new Date().toISOString();
  const { data: claimedHandoff, error: claimError } = await admin
    .from("device_token_handoffs")
    .update({ consumed_at: consumedAt })
    .eq("device_code_id", device.id)
    .is("consumed_at", null)
    .gt("expires_at", consumedAt)
    .select("*")
    .maybeSingle();

  if (claimError) {
    return jsonError(claimError.message, 500);
  }

  if (!claimedHandoff) {
    return NextResponse.json(
      {
        status: "authorized",
        error: "Token handoff expired; restart the device flow.",
      },
      { status: 410 },
    );
  }

  let token: string;

  try {
    token = decryptHandoffToken({
      tokenCiphertext: claimedHandoff.token_ciphertext,
      tokenIv: claimedHandoff.token_iv,
      tokenTag: claimedHandoff.token_tag,
    });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  await admin
    .from("device_codes")
    .update({ status: "consumed", consumed_at: consumedAt })
    .eq("id", device.id)
    .eq("status", "approved");

  return NextResponse.json({
    status: "authorized",
    session_id: claimedHandoff.agent_session_id,
    token,
  });
}
