import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import {
  DEFAULT_AGENT_SCOPES,
  normalizeAgentScopes,
} from "@/lib/agents/scopes";
import { hashAgentToken, mintAgentToken } from "@/lib/agents/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const AGENT_ID_PATTERN = /^[A-Za-z0-9._:-]+$/;
const MAX_LABEL_LENGTH = 80;
const MAX_AGENT_ID_BYTES = 64;
const EXPIRY_OPTIONS = new Set(["7", "30", "90", "never"]);

interface CreateAgentRequest {
  agentId?: unknown;
  label?: unknown;
  authorityPublicKey?: unknown;
  agentPublicKey?: unknown;
  treasuryPda?: unknown;
  scopes?: unknown;
  expiresInDays?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function byteLength(value: string) {
  return new TextEncoder().encode(value).length;
}

function normalizeAgentId(value: unknown) {
  if (typeof value !== "string") {
    throw new Error("Agent ID is required.");
  }

  const agentId = value.trim();

  if (!agentId) {
    throw new Error("Agent ID is required.");
  }

  if (byteLength(agentId) > MAX_AGENT_ID_BYTES) {
    throw new Error("Agent ID must be 64 bytes or fewer.");
  }

  if (!AGENT_ID_PATTERN.test(agentId)) {
    throw new Error(
      "Use letters, numbers, dots, underscores, colons, or dashes.",
    );
  }

  return agentId;
}

function normalizeLabel(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const label = value.trim();

  if (!label) {
    return null;
  }

  return label.slice(0, MAX_LABEL_LENGTH);
}

function normalizeTreasuryPda(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new PublicKey(trimmed).toBase58();
  } catch {
    throw new Error("Treasury PDA must be a valid Solana public key.");
  }
}

function normalizeAuthorityPublicKey(value: unknown) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();

  if (!trimmed) {
    return null;
  }

  try {
    return new PublicKey(trimmed).toBase58();
  } catch {
    throw new Error("Authority public key must be a valid Solana public key.");
  }
}

function normalizeExpiresAt(value: unknown) {
  const option = typeof value === "string" ? value : "30";

  if (!EXPIRY_OPTIONS.has(option)) {
    throw new Error("Choose a valid expiry window.");
  }

  if (option === "never") {
    return null;
  }

  const date = new Date();
  date.setDate(date.getDate() + Number(option));
  return date.toISOString();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not create agent.";
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before creating an agent.", 401);
  }

  let body: CreateAgentRequest;

  try {
    body = (await request.json()) as CreateAgentRequest;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let agentId: string;
  let agentLabel: string | null;
  let authorityPublicKey: string | null;
  let treasuryPda: string | null;
  let expiresAt: string | null;
  const scopes = normalizeAgentScopes(body.scopes);

  try {
    agentId = normalizeAgentId(body.agentId);
    agentLabel = normalizeLabel(body.label);
    authorityPublicKey = normalizeAuthorityPublicKey(
      body.authorityPublicKey ?? body.agentPublicKey,
    );
    treasuryPda = normalizeTreasuryPda(body.treasuryPda);
    expiresAt = normalizeExpiresAt(body.expiresInDays);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  if (scopes.length === 0) {
    return jsonError("Select at least one agent scope.", 400);
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;

  try {
    admin = createSupabaseAdminClient();
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,wallet_address")
    .eq("id", user.id)
    .maybeSingle();

  if (profileError) {
    return jsonError(profileError.message, 500);
  }

  if (!profile) {
    return jsonError(
      "Owner profile is missing. Sign out and sign in again.",
      409,
    );
  }

  const { data: duplicate, error: duplicateError } = await admin
    .from("agent_sessions")
    .select("id")
    .eq("owner_id", user.id)
    .eq("agent_id", agentId)
    .limit(1)
    .maybeSingle();

  if (duplicateError) {
    return jsonError(duplicateError.message, 500);
  }

  if (duplicate) {
    return jsonError("An agent with this ID already exists.", 409);
  }

  const agentToken = mintAgentToken();
  const tokenHash = hashAgentToken(agentToken);

  const { data: session, error: sessionError } = await admin
    .from("agent_sessions")
    .insert({
      owner_id: user.id,
      agent_id: agentId,
      agent_label: agentLabel,
      treasury_pda: treasuryPda,
      scopes: scopes.length > 0 ? scopes : DEFAULT_AGENT_SCOPES,
      expires_at: expiresAt,
      metadata: {
        created_via: "web",
        identity_status: authorityPublicKey
          ? "authority_recorded"
          : "session_only",
        onchain_status: treasuryPda ? "treasury_linked" : "not_bound",
        owner_wallet: profile.wallet_address,
        publicKey: authorityPublicKey,
        authority_public_key: authorityPublicKey,
        token_prefix: "aurak",
      },
    })
    .select("*")
    .single();

  if (sessionError) {
    const message =
      sessionError.code === "23505"
        ? "An agent with this ID already exists."
        : sessionError.message;
    return jsonError(message, sessionError.code === "23505" ? 409 : 500);
  }

  const { error: secretError } = await admin
    .from("agent_session_secrets")
    .insert({
      session_id: session.id,
      token_hash: tokenHash,
    });

  if (secretError) {
    await admin.from("agent_sessions").delete().eq("id", session.id);
    return jsonError(secretError.message, 500);
  }

  const displayName = agentLabel ?? agentId;
  await admin.from("activity_events").insert({
    owner_id: user.id,
    agent_session_id: session.id,
    treasury_pda: treasuryPda,
    event_kind: "agent_session.created",
    severity: "success",
    title: "Agent session created",
    summary: `${displayName} can now authenticate with a Conduit-compatible bearer token.`,
    metadata: {
      agent_id: agentId,
      authority_public_key: authorityPublicKey,
      created_via: "web",
      scopes,
    },
  });

  return NextResponse.json({
    session,
    agentToken,
  });
}
