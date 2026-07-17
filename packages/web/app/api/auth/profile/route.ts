import { NextResponse } from "next/server";
import { ensureProfileForUser } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not load account.";
}

export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before loading account details.", 401);
  }

  try {
    const admin = createSupabaseAdminClient();
    const profile = await ensureProfileForUser(admin, user);
    const { data: wallets, error: walletsError } = await admin
      .from("account_wallets")
      .select("*")
      .eq("owner_id", user.id)
      .is("revoked_at", null)
      .order("is_primary", { ascending: false })
      .order("created_at", { ascending: false });

    if (walletsError) {
      throw walletsError;
    }

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        emailConfirmedAt: user.email_confirmed_at,
      },
      profile,
      wallets: wallets ?? [],
    });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }
}
