import type { User } from "@supabase/supabase-js";
import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function getPrimaryProvider(user: User) {
  const provider = user.app_metadata.provider;
  return typeof provider === "string" && provider ? provider : "email";
}

export async function ensureProfileForUser(admin: AdminClient, user: User) {
  const now = new Date().toISOString();
  const { data, error } = await admin
    .from("profiles")
    .upsert(
      {
        id: user.id,
        email: user.email ?? null,
        email_confirmed_at: user.email_confirmed_at ?? null,
        last_seen_at: now,
        auth_provider: getPrimaryProvider(user),
      },
      { onConflict: "id" },
    )
    .select("*")
    .single();

  if (error) {
    throw error;
  }

  return data;
}
