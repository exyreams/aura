import type { createSupabaseAdminClient } from "@/lib/supabase/admin";

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

export async function getPrimaryAccountWallet(
  admin: AdminClient,
  ownerId: string,
) {
  const { data, error } = await admin
    .from("account_wallets")
    .select("*")
    .eq("owner_id", ownerId)
    .eq("is_primary", true)
    .is("revoked_at", null)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data;
}

export async function refreshProfilePrimaryWallet(
  admin: AdminClient,
  ownerId: string,
) {
  const primaryWallet = await getPrimaryAccountWallet(admin, ownerId);
  const { error } = await admin
    .from("profiles")
    .update({
      primary_wallet_id: primaryWallet?.id ?? null,
      wallet_address: primaryWallet?.wallet_address ?? null,
    })
    .eq("id", ownerId);

  if (error) {
    throw error;
  }

  return primaryWallet;
}
