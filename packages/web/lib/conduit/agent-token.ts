import { hashAgentToken } from "@/lib/agents/tokens";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { AgentSessionRow } from "@/lib/supabase/types";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export interface ConduitAgentAuth {
  admin: AdminClient;
  token: string;
  session: AgentSessionRow;
}

export function getBearerToken(request: Request) {
  const header = request.headers.get("authorization");
  const match = /^Bearer\s+(\S+)$/iu.exec(header?.trim() ?? "");

  if (!match?.[1]) {
    throw new Error("Missing Conduit bearer token.");
  }

  return match[1];
}

export function isAgentSessionExpired(session: AgentSessionRow) {
  return Boolean(
    session.expires_at && new Date(session.expires_at).getTime() <= Date.now(),
  );
}

export async function authenticateConduitAgent(
  request: Request,
): Promise<ConduitAgentAuth> {
  const token = getBearerToken(request);
  const admin = createSupabaseAdminClient();
  const { data: secret, error: secretError } = await admin
    .from("agent_session_secrets")
    .select("session_id")
    .eq("token_hash", hashAgentToken(token))
    .maybeSingle();

  if (secretError) {
    throw secretError;
  }

  if (!secret) {
    throw new Error("Unknown or revoked Conduit token.");
  }

  const { data: session, error: sessionError } = await admin
    .from("agent_sessions")
    .select("*")
    .eq("id", secret.session_id)
    .maybeSingle();

  if (sessionError) {
    throw sessionError;
  }

  if (!session || session.status === "revoked") {
    throw new Error("Conduit session is revoked.");
  }

  if (session.status !== "active") {
    throw new Error(`Conduit session is ${session.status}.`);
  }

  if (isAgentSessionExpired(session)) {
    throw new Error("Conduit session has expired.");
  }

  await admin
    .from("agent_session_secrets")
    .update({ last_used_at: new Date().toISOString() })
    .eq("session_id", session.id);

  return { admin, token, session };
}

export function assertConduitScope(
  session: AgentSessionRow,
  requiredScope: string,
) {
  if (!session.scopes.includes(requiredScope)) {
    throw new Error(`Conduit session is missing ${requiredScope}.`);
  }
}
