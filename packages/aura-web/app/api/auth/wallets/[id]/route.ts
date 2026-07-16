import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface UpdateWalletBody {
  isPrimary?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not update wallet.";
}

async function refreshPrimaryWallet(input: {
  admin: ReturnType<typeof createSupabaseAdminClient>;
  ownerId: string;
}) {
  const { data: primary, error: primaryError } = await input.admin
    .from("account_wallets")
    .select("wallet_address")
    .eq("owner_id", input.ownerId)
    .eq("is_primary", true)
    .is("revoked_at", null)
    .maybeSingle();

  if (primaryError) {
    throw primaryError;
  }

  await input.admin
    .from("profiles")
    .update({ wallet_address: primary?.wallet_address ?? null })
    .eq("id", input.ownerId);
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before updating wallets.", 401);
  }

  let body: UpdateWalletBody;
  try {
    body = (await request.json()) as UpdateWalletBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  if (body.isPrimary !== true) {
    return jsonError("Only primary wallet changes are supported.", 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: wallet, error: walletError } = await admin
      .from("account_wallets")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();

    if (walletError) {
      throw walletError;
    }

    if (!wallet) {
      return jsonError("Wallet was not found for this account.", 404);
    }

    await admin
      .from("account_wallets")
      .update({ is_primary: false })
      .eq("owner_id", user.id)
      .is("revoked_at", null);

    const { data: updatedWallet, error: updateError } = await admin
      .from("account_wallets")
      .update({ is_primary: true })
      .eq("id", wallet.id)
      .eq("owner_id", user.id)
      .select("*")
      .single();

    if (updateError) {
      throw updateError;
    }

    await refreshPrimaryWallet({ admin, ownerId: user.id });

    return NextResponse.json({ wallet: updatedWallet });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }
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
    return jsonError("Sign in before unlinking wallets.", 401);
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: wallet, error: walletError } = await admin
      .from("account_wallets")
      .select("*")
      .eq("id", id)
      .eq("owner_id", user.id)
      .is("revoked_at", null)
      .maybeSingle();

    if (walletError) {
      throw walletError;
    }

    if (!wallet) {
      return jsonError("Wallet was not found for this account.", 404);
    }

    const revokedAt = new Date().toISOString();
    const { error: revokeError } = await admin
      .from("account_wallets")
      .update({
        is_primary: false,
        revoked_at: revokedAt,
      })
      .eq("id", wallet.id)
      .eq("owner_id", user.id);

    if (revokeError) {
      throw revokeError;
    }

    if (wallet.is_primary) {
      const { data: nextWallet, error: nextWalletError } = await admin
        .from("account_wallets")
        .select("*")
        .eq("owner_id", user.id)
        .is("revoked_at", null)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();

      if (nextWalletError) {
        throw nextWalletError;
      }

      if (nextWallet) {
        const { error: nextPrimaryError } = await admin
          .from("account_wallets")
          .update({ is_primary: true })
          .eq("id", nextWallet.id);

        if (nextPrimaryError) {
          throw nextPrimaryError;
        }
      }
    }

    await refreshPrimaryWallet({ admin, ownerId: user.id });

    await admin.from("activity_events").insert({
      owner_id: user.id,
      event_kind: "account.wallet.unlinked",
      severity: "warning",
      title: "Wallet unlinked",
      summary: "A Solana wallet was unlinked from this email account.",
      metadata: {
        version: "aura.account_event.wallet_unlinked.v1",
        wallet_id: wallet.id,
        wallet_address: wallet.wallet_address,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }
}
