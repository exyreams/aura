import { NextResponse } from "next/server";
import { formatUserCode, secondsUntil } from "@/lib/conduit/device-flow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { DeviceCodeRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not load device code.";
}

function serializeDeviceCode(device: DeviceCodeRow) {
  return {
    id: device.id,
    userCode: device.user_code,
    status: device.status,
    clientName: device.client_name,
    requestedAgentId: device.requested_agent_id,
    requestedAgentLabel: device.requested_agent_label,
    requestedScopes: device.requested_scopes,
    requestedTreasuryPda: device.requested_treasury_pda,
    requestedCaps: device.requested_caps,
    createdAt: device.created_at,
    expiresAt: device.expires_at,
    expiresIn: secondsUntil(device.expires_at),
    approvedAt: device.approved_at,
    deniedAt: device.denied_at,
    consumedAt: device.consumed_at,
    approvedSessionId: device.approved_session_id,
  };
}

export async function GET(
  _request: Request,
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
    return jsonError("Unknown or expired device code.", 404);
  }

  if (device.owner_id && device.owner_id !== user.id) {
    return jsonError("This device code belongs to another account.", 403);
  }

  if (
    device.status === "pending" &&
    new Date(device.expires_at) <= new Date()
  ) {
    const { data: expiredDevice } = await admin
      .from("device_codes")
      .update({ status: "expired" })
      .eq("id", device.id)
      .eq("status", "pending")
      .select("*")
      .single();

    return NextResponse.json({
      device: serializeDeviceCode(
        expiredDevice ?? { ...device, status: "expired" },
      ),
    });
  }

  return NextResponse.json({ device: serializeDeviceCode(device) });
}
