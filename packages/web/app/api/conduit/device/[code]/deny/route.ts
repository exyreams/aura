import { NextResponse } from "next/server";
import { formatUserCode } from "@/lib/conduit/device-flow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not deny Conduit authorization.";
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ code: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before denying a Conduit device.", 401);
  }

  let code: string;

  try {
    code = formatUserCode((await params).code);
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

  const deniedAt = new Date().toISOString();
  const { data: deniedDevice, error: denyError } = await admin
    .from("device_codes")
    .update({
      owner_id: user.id,
      status: "denied",
      denied_at: deniedAt,
    })
    .eq("id", device.id)
    .eq("status", "pending")
    .select("*")
    .maybeSingle();

  if (denyError) {
    return jsonError(denyError.message, 500);
  }

  if (!deniedDevice) {
    return jsonError("This Conduit authorization was already handled.", 409);
  }

  await admin.from("activity_events").insert({
    owner_id: user.id,
    event_kind: "conduit.device.denied",
    severity: "warning",
    title: "Conduit device denied",
    summary: `${
      device.requested_agent_label ?? device.client_name ?? device.user_code
    } was denied before a session token was issued.`,
    metadata: {
      client_name: device.client_name,
      device_code_id: device.id,
      requested_agent_id: device.requested_agent_id,
      requested_scopes: device.requested_scopes,
    },
  });

  return NextResponse.json({
    device: {
      id: deniedDevice.id,
      userCode: deniedDevice.user_code,
      status: deniedDevice.status,
      deniedAt: deniedDevice.denied_at,
    },
  });
}
