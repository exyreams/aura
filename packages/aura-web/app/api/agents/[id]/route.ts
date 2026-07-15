import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not update agent.";
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
