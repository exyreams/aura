import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not remove dWallet.";
}

function metadataString(metadata: Json, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[key];
  return typeof value === "string" ? value : null;
}

function metadataNestedString(metadata: Json, parent: string, key: string) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return null;
  }

  const value = metadata[parent];

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const nested = value[key];
  return typeof nested === "string" ? nested : null;
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before removing a dWallet.", 401);
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: wallet, error: walletError } = await admin
      .from("wallet_registry")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (walletError) {
      throw walletError;
    }

    if (!wallet) {
      return jsonError("dWallet not found for this owner.", 404);
    }

    if (wallet.wallet_kind !== "dwallet") {
      return jsonError("Only dWallet records can be removed here.", 400);
    }

    if (
      wallet.status === "onchain_registered" ||
      metadataString(wallet.metadata, "onchain_registration") === "recorded" ||
      metadataString(wallet.metadata, "registration_tx_signature") ||
      metadataNestedString(wallet.metadata, "binding", "tx_signature")
    ) {
      return jsonError(
        "On-chain registered dWallets cannot be removed from the dashboard.",
        409,
      );
    }

    await admin.from("activity_events").insert({
      owner_id: user.id,
      agent_session_id: wallet.agent_session_id,
      treasury_pda: wallet.treasury_pda,
      wallet_id: wallet.id,
      event_kind: "wallet.dwallet.removed",
      severity: "warning",
      title: "dWallet removed",
      summary: `${wallet.label ?? wallet.chain_name} was removed before on-chain registration.`,
      metadata: {
        version: "aura.wallet_event.dwallet_removed.v1",
        wallet_id: wallet.id,
        chain_id: wallet.chain_id,
        chain_name: wallet.chain_name,
        chain_address: wallet.chain_address,
        dwallet_id: wallet.dwallet_id,
        status: wallet.status,
      },
    });

    const { error: deleteError } = await admin
      .from("wallet_registry")
      .delete()
      .eq("id", wallet.id)
      .eq("owner_id", user.id);

    if (deleteError) {
      throw deleteError;
    }

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }
}
