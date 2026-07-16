import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { ensureProfileForUser } from "@/lib/auth/profile";
import {
  buildWalletLinkMessage,
  normalizeSolanaWalletAddress,
  SOLANA_ACCOUNT_CHAIN_ID,
  SOLANA_ACCOUNT_CHAIN_NAME,
  WALLET_LINK_VERSION,
} from "@/lib/auth/wallet-linking";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface ChallengeBody {
  walletAddress?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not create wallet challenge.";
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

  let body: ChallengeBody;
  try {
    body = (await request.json()) as ChallengeBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let walletAddress: string;
  try {
    walletAddress = normalizeSolanaWalletAddress(body.walletAddress);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  try {
    const admin = createSupabaseAdminClient();
    await ensureProfileForUser(admin, user);

    const { data: existing, error: existingError } = await admin
      .from("account_wallets")
      .select("id,owner_id")
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

    if (existing) {
      return jsonError("This wallet is already linked to your account.", 409);
    }

    const url = new URL(request.url);
    const issuedAt = new Date();
    const expiresAt = new Date(issuedAt.getTime() + 10 * 60 * 1000);
    const nonce = randomBytes(24).toString("base64url");
    const message = buildWalletLinkMessage({
      origin: url.origin,
      email: user.email ?? null,
      userId: user.id,
      walletAddress,
      nonce,
      issuedAt: issuedAt.toISOString(),
      expiresAt: expiresAt.toISOString(),
    });

    const { data: challenge, error: challengeError } = await admin
      .from("wallet_link_challenges")
      .insert({
        owner_id: user.id,
        chain_id: SOLANA_ACCOUNT_CHAIN_ID,
        chain_name: SOLANA_ACCOUNT_CHAIN_NAME,
        wallet_address: walletAddress,
        wallet_address_canonical: walletAddress,
        nonce,
        message,
        expires_at: expiresAt.toISOString(),
        metadata: {
          version: WALLET_LINK_VERSION,
          origin: url.origin,
          issued_at: issuedAt.toISOString(),
        },
      })
      .select("id,message,expires_at")
      .single();

    if (challengeError) {
      throw challengeError;
    }

    return NextResponse.json({
      challengeId: challenge.id,
      message: challenge.message,
      expiresAt: challenge.expires_at,
    });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }
}
