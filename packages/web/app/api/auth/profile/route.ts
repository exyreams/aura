import { NextResponse } from "next/server";
import { ensureProfileForUser } from "@/lib/auth/profile";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_DISPLAY_NAME_LENGTH = 80;

interface UpdateProfileBody {
  displayName?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not load account.";
}

function normalizeDisplayName(value: unknown) {
  if (value === null || value === undefined) {
    return null;
  }

  if (typeof value !== "string") {
    throw new Error("Display name must be text.");
  }

  const displayName = value.trim();

  if (!displayName) {
    return null;
  }

  if (displayName.length > MAX_DISPLAY_NAME_LENGTH) {
    throw new Error(
      `Display name must be ${MAX_DISPLAY_NAME_LENGTH} characters or fewer.`,
    );
  }

  return displayName;
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

export async function PATCH(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before updating account details.", 401);
  }

  let body: UpdateProfileBody;
  try {
    body = (await request.json()) as UpdateProfileBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let displayName: string | null;
  try {
    displayName = normalizeDisplayName(body.displayName);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    await ensureProfileForUser(admin, user);

    const { data: profile, error } = await admin
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", user.id)
      .select("*")
      .single();

    if (error) {
      throw error;
    }

    return NextResponse.json({ profile });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }
}
