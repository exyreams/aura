import { NextResponse } from "next/server";
import {
  normalizeAgentWalletPermissionScopes,
  walletPermissionScopesForAgent,
} from "@/lib/agents/wallet-permissions";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

interface UpdatePermissionBody {
  walletId?: unknown;
  agentSessionId?: unknown;
  scopes?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not update wallet permissions.";
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before viewing wallet permissions.", 401);
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;

  try {
    admin = createSupabaseAdminClient();
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  const { data: permissions, error } = await admin
    .from("agent_wallet_permissions")
    .select("*")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false });

  if (error) {
    return jsonError(error.message, 500);
  }

  return NextResponse.json({ permissions: permissions ?? [] });
}

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before updating wallet permissions.", 401);
  }

  let body: UpdatePermissionBody;

  try {
    body = (await request.json()) as UpdatePermissionBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let walletId: string;
  let agentSessionId: string;

  try {
    walletId = getString(body.walletId, "Wallet");
    agentSessionId = getString(body.agentSessionId, "Agent session");
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;

  try {
    admin = createSupabaseAdminClient();
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  const [
    { data: wallet, error: walletError },
    { data: agent, error: agentError },
  ] = await Promise.all([
    admin
      .from("wallet_registry")
      .select("*")
      .eq("id", walletId)
      .eq("owner_id", user.id)
      .maybeSingle(),
    admin
      .from("agent_sessions")
      .select("*")
      .eq("id", agentSessionId)
      .eq("owner_id", user.id)
      .maybeSingle(),
  ]);

  if (walletError) {
    return jsonError(walletError.message, 500);
  }

  if (agentError) {
    return jsonError(agentError.message, 500);
  }

  if (!wallet) {
    return jsonError("Wallet not found for this owner.", 404);
  }

  if (!agent) {
    return jsonError("Agent session not found for this owner.", 404);
  }

  if (agent.status !== "active") {
    return jsonError(
      "Only active agent sessions can receive wallet access.",
      409,
    );
  }

  const scopes = normalizeAgentWalletPermissionScopes(
    body.scopes,
    agent.scopes,
  );
  const requestedScopes = normalizeAgentWalletPermissionScopes(body.scopes);
  const unsupported = requestedScopes.filter(
    (scope) => !agent.scopes.includes(scope),
  );

  if (unsupported.length > 0) {
    return jsonError(
      `Agent session is missing: ${unsupported.join(", ")}.`,
      403,
    );
  }

  const now = new Date().toISOString();
  const active = scopes.length > 0;
  const { data: permission, error: permissionError } = await admin
    .from("agent_wallet_permissions")
    .upsert(
      {
        owner_id: user.id,
        agent_session_id: agent.id,
        wallet_id: wallet.id,
        scopes,
        status: active ? "active" : "revoked",
        grant_source: "owner",
        revoked_at: active ? null : now,
        metadata: {
          version: "aura.agent_wallet_permission.v1",
          updated_via: "owner_web",
          agent_scopes_at_update: agent.scopes,
        } satisfies Json,
      },
      { onConflict: "owner_id,agent_session_id,wallet_id" },
    )
    .select("*")
    .single();

  if (permissionError) {
    return jsonError(permissionError.message, 500);
  }

  if (active && !wallet.agent_session_id) {
    await admin
      .from("wallet_registry")
      .update({
        agent_session_id: agent.id,
        treasury_pda: wallet.treasury_pda ?? agent.treasury_pda,
      })
      .eq("id", wallet.id)
      .eq("owner_id", user.id);
  }

  await admin.from("activity_events").insert({
    owner_id: user.id,
    agent_session_id: agent.id,
    treasury_pda: wallet.treasury_pda ?? agent.treasury_pda,
    wallet_id: wallet.id,
    event_kind: active
      ? "wallet.agent_permission.updated"
      : "wallet.agent_permission.revoked",
    severity: active ? "info" : "warning",
    title: active ? "Wallet access updated" : "Wallet access revoked",
    summary: active
      ? `${agent.agent_label ?? agent.agent_id} can access ${wallet.label ?? wallet.chain_name}.`
      : `${agent.agent_label ?? agent.agent_id} can no longer access ${wallet.label ?? wallet.chain_name}.`,
    metadata: {
      version: "aura.wallet_event.agent_permission.v1",
      wallet_id: wallet.id,
      agent_session_id: agent.id,
      scopes,
      available_agent_wallet_scopes: walletPermissionScopesForAgent(
        agent.scopes,
      ),
      source: "owner_web",
    },
  });

  return NextResponse.json({ permission });
}
