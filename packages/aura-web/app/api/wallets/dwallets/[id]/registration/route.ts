import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { NextResponse } from "next/server";
import { getPrimaryAccountWallet } from "@/lib/auth/primary-wallet";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json, WalletRegistryRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

const DEFAULT_AURA_PROGRAM_ID = "auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce";

interface RegistrationBody {
  ownerAddress?: unknown;
  signature?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not record dWallet registration.";
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

function getSignature(value: unknown) {
  const signature = getString(value, "Transaction signature");

  try {
    if (bs58.decode(signature).length !== 64) {
      throw new Error("Invalid signature length.");
    }
  } catch {
    throw new Error("Transaction signature must be a valid Solana signature.");
  }

  return signature;
}

function metadataObject(metadata: Json): { [key: string]: Json | undefined } {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return {};
  }

  return metadata;
}

function getRpcUrl() {
  return process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() || null;
}

async function verifyRegistrationTransaction(input: {
  signature: string;
  ownerAddress: string;
  treasuryPda: string;
}) {
  const rpcUrl = getRpcUrl();
  const programId =
    process.env.NEXT_PUBLIC_AURA_PROGRAM_ID?.trim() || DEFAULT_AURA_PROGRAM_ID;

  if (!rpcUrl) {
    return null;
  }

  const connection = new Connection(rpcUrl, "confirmed");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const transaction = await connection.getParsedTransaction(input.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (transaction) {
      if (transaction.meta?.err) {
        throw new Error("The registration transaction failed on-chain.");
      }

      const accountKeys = transaction.transaction.message.accountKeys;
      const ownerSigned = accountKeys.some(
        (account) =>
          account.signer && account.pubkey.toBase58() === input.ownerAddress,
      );
      const touchesTreasury = accountKeys.some(
        (account) => account.pubkey.toBase58() === input.treasuryPda,
      );
      const callsAuraProgram =
        transaction.transaction.message.instructions.some(
          (instruction) => instruction.programId.toBase58() === programId,
        );

      if (!ownerSigned) {
        throw new Error(
          "The registration transaction was not signed by the owner wallet.",
        );
      }

      if (!touchesTreasury) {
        throw new Error(
          "The registration transaction does not reference this AURA treasury.",
        );
      }

      if (!callsAuraProgram) {
        throw new Error(
          "The registration transaction does not call the AURA program.",
        );
      }

      return {
        slot: transaction.slot,
        blockTime: transaction.blockTime
          ? new Date(transaction.blockTime * 1000).toISOString()
          : null,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, 700));
  }

  throw new Error(
    "Could not find the confirmed registration transaction on the configured RPC.",
  );
}

export async function POST(
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
    return jsonError("Sign in before linking a dWallet.", 401);
  }

  let body: RegistrationBody;

  try {
    body = (await request.json()) as RegistrationBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let ownerAddress: string;
  let signature: string;

  try {
    ownerAddress = getPublicKey(body.ownerAddress, "Owner wallet");
    signature = getSignature(body.signature);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  let admin: ReturnType<typeof createSupabaseAdminClient>;

  try {
    admin = createSupabaseAdminClient();
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  let primaryWallet: Awaited<ReturnType<typeof getPrimaryAccountWallet>>;
  try {
    primaryWallet = await getPrimaryAccountWallet(admin, user.id);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 500);
  }

  if (!primaryWallet) {
    return jsonError(
      "Link a primary owner wallet before linking this dWallet.",
      409,
    );
  }

  if (primaryWallet.wallet_address !== ownerAddress) {
    return jsonError(
      "Connect the primary owner wallet before linking this dWallet.",
      403,
    );
  }

  const { data: wallet, error: walletError } = await admin
    .from("wallet_registry")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (walletError) {
    return jsonError(walletError.message, 500);
  }

  if (!wallet) {
    return jsonError("Wallet not found for this owner.", 404);
  }

  if (wallet.wallet_kind !== "dwallet") {
    return jsonError("Only dWallet records can be linked on-chain.", 400);
  }

  if (wallet.status === "onchain_registered") {
    return NextResponse.json({ wallet });
  }

  if (!wallet.treasury_pda) {
    return jsonError("This wallet is missing an AURA treasury PDA.", 409);
  }

  let transactionInfo: Awaited<
    ReturnType<typeof verifyRegistrationTransaction>
  >;

  try {
    transactionInfo = await verifyRegistrationTransaction({
      signature,
      ownerAddress,
      treasuryPda: wallet.treasury_pda,
    });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  const linkedAt = new Date().toISOString();
  const metadata = metadataObject(wallet.metadata);
  const nextMetadata: Json = {
    ...metadata,
    onchain_registration: "recorded",
    registration_tx_signature: signature,
    binding: {
      version: "aura.wallet_binding.v1",
      method: "aura_program_register_dwallet",
      owner_wallet: ownerAddress,
      treasury_pda: wallet.treasury_pda,
      tx_signature: signature,
      tx_slot: transactionInfo?.slot ?? null,
      tx_block_time: transactionInfo?.blockTime ?? null,
      linked_at: linkedAt,
    },
  };

  const { data: updatedWallet, error: updateError } = await admin
    .from("wallet_registry")
    .update({
      status: "onchain_registered",
      metadata: nextMetadata,
    })
    .eq("id", wallet.id)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (updateError) {
    return jsonError(updateError.message, 500);
  }

  const { data: dwalletSession } = await admin
    .from("dwallet_sessions")
    .select("metadata")
    .eq("wallet_id", wallet.id)
    .eq("owner_id", user.id)
    .maybeSingle();

  const { error: sessionUpdateError } = await admin
    .from("dwallet_sessions")
    .update({
      metadata: {
        ...metadataObject(dwalletSession?.metadata ?? {}),
        wallet_binding: {
          method: "aura_program_register_dwallet",
          owner_wallet: ownerAddress,
          tx_signature: signature,
          tx_slot: transactionInfo?.slot ?? null,
          tx_block_time: transactionInfo?.blockTime ?? null,
          linked_at: linkedAt,
        },
      },
    })
    .eq("wallet_id", wallet.id)
    .eq("owner_id", user.id);

  if (sessionUpdateError) {
    return jsonError(sessionUpdateError.message, 500);
  }

  await admin.from("activity_events").insert({
    owner_id: user.id,
    agent_session_id: wallet.agent_session_id,
    treasury_pda: wallet.treasury_pda,
    wallet_id: wallet.id,
    event_kind: "wallet.dwallet.onchain_registered",
    severity: "success",
    title: "dWallet linked on-chain",
    summary: `${wallet.label ?? wallet.chain_name} is registered on the AURA treasury.`,
    tx_signature: signature,
    metadata: {
      version: "aura.wallet_event.dwallet_onchain_registered.v1",
      owner_wallet: ownerAddress,
      chain_id: wallet.chain_id,
      chain_name: wallet.chain_name,
      chain_address: wallet.chain_address,
      dwallet_id: wallet.dwallet_id,
      tx_slot: transactionInfo?.slot ?? null,
      tx_block_time: transactionInfo?.blockTime ?? null,
    },
  });

  return NextResponse.json({
    wallet: updatedWallet satisfies WalletRegistryRow,
  });
}
