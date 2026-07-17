import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import {
  createDeviceCodeSecret,
  createUserCode,
  DEVICE_CODE_TTL_SECONDS,
  DEVICE_POLL_INTERVAL_SECONDS,
  expiresAtFromNow,
  hashDeviceCode,
  normalizeDeviceScopes,
  secondsUntil,
} from "@/lib/conduit/device-flow";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

const MAX_TEXT_LENGTH = 80;
const MAX_JSON_BYTES = 8_192;
const MAX_INSERT_ATTEMPTS = 5;

interface CreateDeviceCodeBody {
  client?: unknown;
  requested_agent_id?: unknown;
  requested_agent_label?: unknown;
  requested_scopes?: unknown;
  requested_session_public_key?: unknown;
  requested_treasury?: unknown;
  requested_treasury_pda?: unknown;
  session_public_key?: unknown;
  authority_public_key?: unknown;
  requested_caps?: unknown;
  metadata?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not create Conduit authorization code.";
}

function getOptionalText(value: unknown, maxLength = MAX_TEXT_LENGTH) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  return trimmed ? trimmed.slice(0, maxLength) : null;
}

function getOptionalPublicKey(value: unknown, label: string) {
  const text = getOptionalText(value, 180);

  if (!text) {
    return null;
  }

  try {
    return new PublicKey(text).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana address.`);
  }
}

function getJsonObject(value: unknown, label: string): Json {
  if (value === undefined || value === null) {
    return {};
  }

  if (typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} must be an object.`);
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_JSON_BYTES) {
    throw new Error(`${label} is too large.`);
  }

  return JSON.parse(serialized) as Json;
}

export async function POST(request: Request) {
  let body: CreateDeviceCodeBody;

  try {
    body = (await request.json()) as CreateDeviceCodeBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let clientName: string | null;
  let requestedAgentId: string | null;
  let requestedAgentLabel: string | null;
  let requestedTreasuryPda: string | null;
  let sessionPublicKey: string | null;
  let requestedCaps: Json;
  let metadata: Json;
  let scopes: string[];

  try {
    clientName = getOptionalText(body.client) ?? "Conduit runtime";
    requestedAgentId = getOptionalText(body.requested_agent_id);
    requestedAgentLabel =
      getOptionalText(body.requested_agent_label) ?? requestedAgentId;
    requestedTreasuryPda = getOptionalPublicKey(
      body.requested_treasury_pda ?? body.requested_treasury,
      "Requested treasury",
    );
    sessionPublicKey = getOptionalPublicKey(
      body.session_public_key ??
        body.requested_session_public_key ??
        body.authority_public_key,
      "Signer public key",
    );
    requestedCaps = getJsonObject(body.requested_caps, "Requested caps");
    metadata = getJsonObject(body.metadata, "Metadata");
    scopes = normalizeDeviceScopes(body.requested_scopes);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;

  try {
    admin = createSupabaseAdminClient();
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  const deviceCode = createDeviceCodeSecret();
  const expiresAt = expiresAtFromNow(DEVICE_CODE_TTL_SECONDS);
  const storedMetadata = sessionPublicKey
    ? {
        ...(metadata as Record<string, Json>),
        authority_public_key: sessionPublicKey,
        session_public_key: sessionPublicKey,
      }
    : metadata;

  for (let attempt = 0; attempt < MAX_INSERT_ATTEMPTS; attempt += 1) {
    const userCode = createUserCode();
    const { data: device, error: deviceError } = await admin
      .from("device_codes")
      .insert({
        user_code: userCode,
        client_name: clientName,
        requested_agent_id: requestedAgentId,
        requested_agent_label: requestedAgentLabel,
        requested_scopes: scopes,
        requested_treasury_pda: requestedTreasuryPda,
        requested_caps: requestedCaps,
        metadata: storedMetadata,
        status: "pending",
        interval_seconds: DEVICE_POLL_INTERVAL_SECONDS,
        expires_at: expiresAt,
      })
      .select("*")
      .single();

    if (deviceError) {
      if (deviceError.code === "23505") {
        continue;
      }

      return jsonError(deviceError.message, 500);
    }

    const { error: secretError } = await admin
      .from("device_code_secrets")
      .insert({
        device_code_id: device.id,
        device_code_hash: hashDeviceCode(deviceCode),
      });

    if (secretError) {
      await admin.from("device_codes").delete().eq("id", device.id);
      return jsonError(secretError.message, 500);
    }

    const origin = new URL(request.url).origin;
    const verifyUrl = `${origin}/conduit/authorize?code=${encodeURIComponent(
      device.user_code,
    )}`;

    return NextResponse.json({
      device_code: deviceCode,
      user_code: device.user_code,
      verify_url: verifyUrl,
      verify_url_complete: verifyUrl,
      interval: device.interval_seconds,
      expires_in: secondsUntil(device.expires_at),
    });
  }

  return jsonError(
    "Could not allocate a unique Conduit authorization code.",
    500,
  );
}
