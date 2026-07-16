import { NextResponse } from "next/server";
import {
  normalizeSolanaWalletAddress,
  SOLANA_ACCOUNT_CHAIN_ID,
  SOLANA_ACCOUNT_CHAIN_NAME,
  verifySolanaWalletSignature,
  WALLET_LINK_VERSION,
} from "@/lib/auth/wallet-linking";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface LinkWalletBody {
  challengeId?: unknown;
  walletAddress?: unknown;
  signature?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not link wallet.";
}

function getString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before linking a wallet.", 401);
  }

  let body: LinkWalletBody;
  try {
    body = (await request.json()) as LinkWalletBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let challengeId: string;
  let walletAddress: string;
  let signature: string;
  try {
    challengeId = getString(body.challengeId, "Challenge ID");
    walletAddress = normalizeSolanaWalletAddress(body.walletAddress);
    signature = getString(body.signature, "Wallet signature");
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: challenge, error: challengeError } = await admin
      .from("wallet_link_challenges")
      .select("*")
      .eq("id", challengeId)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (challengeError) {
      throw challengeError;
    }

    if (!challenge) {
      return jsonError("Wallet link challenge was not found.", 404);
    }

    if (challenge.status !== "pending" || challenge.used_at) {
      return jsonError("Wallet link challenge has already been used.", 409);
    }

    if (new Date(challenge.expires_at).getTime() <= Date.now()) {
      await admin
        .from("wallet_link_challenges")
        .update({ status: "expired" })
        .eq("id", challenge.id);
      return jsonError("Wallet link challenge has expired.", 410);
    }

    if (challenge.wallet_address_canonical !== walletAddress) {
      return jsonError("Signed wallet does not match this challenge.", 400);
    }

    const signatureValid = verifySolanaWalletSignature({
      walletAddress,
      message: challenge.message,
      signature,
    });

    if (!signatureValid) {
      return jsonError("Wallet signature could not be verified.", 400);
    }

    const { data: activeWallets, error: activeWalletsError } = await admin
      .from("account_wallets")
      .select("id,owner_id,is_primary")
      .eq("owner_id", user.id)
      .is("revoked_at", null);

    if (activeWalletsError) {
      throw activeWalletsError;
    }

    const { data: existing, error: existingError } = await admin
      .from("account_wallets")
      .select("*")
      .eq("chain_id", SOLANA_ACCOUNT_CHAIN_ID)
      .eq("wallet_address_canonical", walletAddress)
      .is("revoked_at", null)
      .maybeSingle();

    if (existingError) {
      throw existingError;
    }

    if (existing && existing.owner_id !== user.id) {
      return jsonError(
        "This wallet is already linked to another account.",
        409,
      );
    }

    const shouldBePrimary =
      !activeWallets?.some((wallet) => wallet.is_primary) ||
      activeWallets.length === 0;

    if (existing) {
      const { data: wallet, error: updateError } = await admin
        .from("account_wallets")
        .update({
          is_primary: existing.is_primary || shouldBePrimary,
          last_verified_at: new Date().toISOString(),
          verification_message: challenge.message,
          verification_signature: signature,
          verification_method: "solana_sign_message",
          verification_version: WALLET_LINK_VERSION,
        })
        .eq("id", existing.id)
        .select("*")
        .single();

      if (updateError) {
        throw updateError;
      }

      await admin
        .from("wallet_link_challenges")
        .update({ status: "used", used_at: new Date().toISOString() })
        .eq("id", challenge.id);

      return NextResponse.json({ wallet });
    }

    const { data: wallet, error: walletError } = await admin
      .from("account_wallets")
      .insert({
        owner_id: user.id,
        chain_id: SOLANA_ACCOUNT_CHAIN_ID,
        chain_name: SOLANA_ACCOUNT_CHAIN_NAME,
        wallet_address: walletAddress,
        wallet_address_canonical: walletAddress,
        wallet_label: shouldBePrimary ? "Primary wallet" : null,
        is_primary: shouldBePrimary,
        verification_message: challenge.message,
        verification_signature: signature,
        verification_method: "solana_sign_message",
        verification_version: WALLET_LINK_VERSION,
        metadata: {
          version: WALLET_LINK_VERSION,
          linked_via: "aura-web",
          challenge_id: challenge.id,
        },
      })
      .select("*")
      .single();

    if (walletError) {
      const message =
        walletError.code === "23505"
          ? "This wallet is already linked to an account."
          : walletError.message;
      return jsonError(message, walletError.code === "23505" ? 409 : 500);
    }

    if (shouldBePrimary) {
      await admin
        .from("profiles")
        .update({ wallet_address: wallet.wallet_address })
        .eq("id", user.id);
    }

    await admin
      .from("wallet_link_challenges")
      .update({ status: "used", used_at: new Date().toISOString() })
      .eq("id", challenge.id);

    await admin.from("activity_events").insert({
      owner_id: user.id,
      event_kind: "account.wallet.linked",
      severity: "success",
      title: "Wallet linked",
      summary: "A Solana wallet was linked to this email account.",
      metadata: {
        version: "aura.account_event.wallet_linked.v1",
        wallet_id: wallet.id,
        wallet_address: wallet.wallet_address,
        is_primary: wallet.is_primary,
      },
    });

    return NextResponse.json({ wallet });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }
}
