import { NextResponse } from "next/server";
import { type AgentScope, isAgentScope } from "@/lib/agents/scopes";
import { isAgentSessionEditable } from "@/lib/agents/session-model";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

interface UpdateAgentRequest {
  scopes?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not update agent.";
}

function metadataObject(metadata: Json): { [key: string]: Json | undefined } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
}

function normalizeUpdateScopes(value: unknown) {
  if (!Array.isArray(value)) {
    throw new Error("Scopes must be an array.");
  }

  const invalidScopes = value.filter(
    (scope) => typeof scope !== "string" || !isAgentScope(scope),
  );

  if (invalidScopes.length > 0) {
    throw new Error("Choose only supported agent scopes.");
  }

  const scopes = Array.from(
    new Set(["read", ...(value as AgentScope[])]),
  ) as AgentScope[];

  if (scopes.length === 0) {
    throw new Error("Select at least one agent scope.");
  }

  return scopes;
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
    return jsonError("Sign in before updating an agent.", 401);
  }

  let body: UpdateAgentRequest;

  try {
    body = (await request.json()) as UpdateAgentRequest;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let scopes: AgentScope[];

  try {
    scopes = normalizeUpdateScopes(body.scopes);
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
  const { data: session, error: sessionError } = await admin
    .from("agent_sessions")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (sessionError) {
    return jsonError(sessionError.message, 500);
  }

  if (!session) {
    return jsonError("Agent session was not found.", 404);
  }

  if (!isAgentSessionEditable(session)) {
    return jsonError("Only active agent sessions can be edited.", 409);
  }

  const updatedAt = new Date().toISOString();
  const { data: updatedSession, error: updateError } = await admin
    .from("agent_sessions")
    .update({
      scopes,
      metadata: {
        ...metadataObject(session.metadata),
        scopes_updated_at: updatedAt,
        scopes_updated_via: "web",
      },
    })
    .eq("id", session.id)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (updateError) {
    return jsonError(updateError.message, 500);
  }

  await admin.from("activity_events").insert({
    owner_id: user.id,
    agent_session_id: session.id,
    treasury_pda: session.treasury_pda,
    event_kind: "agent_session.scopes_updated",
    severity: "info",
    title: "Agent scopes updated",
    summary: `${session.agent_label ?? session.agent_id} capabilities were updated.`,
    metadata: {
      previous_scopes: session.scopes,
      scopes,
      updated_via: "web",
    },
  });

  return NextResponse.json({ session: updatedSession });
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before deleting an agent.", 401);
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;

  try {
    admin = createSupabaseAdminClient();
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  const { id } = await params;
  const { data: session, error: sessionError } = await admin
    .from("agent_sessions")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (sessionError) {
    return jsonError(sessionError.message, 500);
  }

  if (!session) {
    return jsonError("Agent session was not found.", 404);
  }

  const revokedAt = new Date().toISOString();
  const { error: secretError } = await admin
    .from("agent_session_secrets")
    .delete()
    .eq("session_id", session.id);

  if (secretError) {
    return jsonError(secretError.message, 500);
  }

  const { data: revokedSession, error: updateError } = await admin
    .from("agent_sessions")
    .update({
      status: "revoked",
      revoked_at: revokedAt,
    })
    .eq("id", session.id)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (updateError) {
    return jsonError(updateError.message, 500);
  }

  await admin.from("activity_events").insert({
    owner_id: user.id,
    agent_session_id: session.id,
    treasury_pda: session.treasury_pda,
    event_kind: "agent_session.revoked",
    severity: "warning",
    title: "Agent session revoked",
    summary: `${session.agent_label ?? session.agent_id} can no longer authenticate with its runtime token.`,
    metadata: {
      agent_id: session.agent_id,
      revoked_via: "web",
    },
  });

  return NextResponse.json({ session: revokedSession });
}
