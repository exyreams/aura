import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

interface TransferEventBody {
  walletId?: unknown;
  signature?: unknown;
  recipientAddress?: unknown;
  amountUi?: unknown;
  rawAmount?: unknown;
  decimals?: unknown;
  assetSymbol?: unknown;
  blockhash?: unknown;
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

function getPublicKey(value: unknown, label: string) {
  const text = getString(value, label);

  try {
    return new PublicKey(text).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana address.`);
  }
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not log transfer.";
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before logging a transfer.", 401);
  }

  let body: TransferEventBody;

  try {
    body = (await request.json()) as TransferEventBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let walletId: string;
  let signature: string;
  let recipientAddress: string;
  let amountUi: string;
  let rawAmount: string;
  let decimals: number;
  let assetSymbol: string;
  let blockhash: string | null;

  try {
    walletId = getString(body.walletId, "Wallet ID");
    signature = getString(body.signature, "Transaction signature");
    recipientAddress = getPublicKey(body.recipientAddress, "Recipient");
    amountUi = getString(body.amountUi, "Amount");
    rawAmount = getString(body.rawAmount, "Raw amount");
    assetSymbol = getString(body.assetSymbol, "Asset symbol").slice(0, 24);
    decimals =
      typeof body.decimals === "number" && Number.isInteger(body.decimals)
        ? body.decimals
        : 9;
    blockhash =
      typeof body.blockhash === "string" && body.blockhash.trim()
        ? body.blockhash.trim()
        : null;
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;

  try {
    admin = createSupabaseAdminClient();
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  const { data: wallet, error: walletError } = await admin
    .from("wallet_registry")
    .select("*")
    .eq("id", walletId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (walletError) {
    return jsonError(walletError.message, 500);
  }

  if (!wallet) {
    return jsonError("Wallet not found for this owner.", 404);
  }

  const summary = `Sent ${amountUi} ${assetSymbol} to ${recipientAddress}.`;

  const { error: insertError } = await admin.from("activity_events").insert({
    owner_id: user.id,
    treasury_pda: wallet.treasury_pda,
    wallet_id: wallet.id,
    event_kind: "wallet.transfer.submitted",
    severity: "success",
    title: "Wallet transfer submitted",
    summary,
    tx_signature: signature,
    metadata: {
      version: "aura.wallet_transfer_event.v1",
      wallet_id: wallet.id,
      wallet_kind: wallet.wallet_kind,
      chain_id: wallet.chain_id,
      chain_name: wallet.chain_name,
      source_address: wallet.chain_address,
      recipient_address: recipientAddress,
      asset_symbol: assetSymbol,
      amount_ui: amountUi,
      raw_amount: rawAmount,
      decimals,
      blockhash,
    },
  });

  if (insertError) {
    return jsonError(insertError.message, 500);
  }

  return NextResponse.json({ ok: true });
}
