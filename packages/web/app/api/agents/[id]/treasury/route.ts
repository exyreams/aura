import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { NextResponse } from "next/server";
import { getPrimaryAccountWallet } from "@/lib/auth/primary-wallet";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json, WalletRegistryRow } from "@/lib/supabase/types";

export const runtime = "nodejs";

const DEFAULT_AURA_PROGRAM_ID = "auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce";

interface TreasuryLinkBody {
  ownerAddress?: unknown;
  treasuryPda?: unknown;
  signature?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not record treasury binding.";
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

async function verifyTreasuryTransaction(input: {
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
        throw new Error("The treasury transaction failed on-chain.");
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
          "The treasury transaction was not signed by the owner wallet.",
        );
      }

      if (!touchesTreasury) {
        throw new Error(
          "The treasury transaction does not reference this AURA treasury.",
        );
      }

      if (!callsAuraProgram) {
        throw new Error(
          "The treasury transaction does not call the AURA program.",
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
    "Could not find the confirmed treasury transaction on the configured RPC.",
  );
}

function walletMetadataWithTreasury(
  wallet: WalletRegistryRow,
  treasuryPda: string,
  ownerAddress: string,
  signature: string,
  txSlot: number | null,
  txBlockTime: string | null,
  linkedAt: string,
): Json {
  const metadata = metadataObject(wallet.metadata);
  const agent = metadataObject(metadata.agent ?? null);

  return {
    ...metadata,
    agent: {
      ...agent,
      treasury_pda: treasuryPda,
    },
    treasury_binding: {
      version: "aura.wallet_agent_treasury_binding.v1",
      method: "aura_program_create_treasury",
      owner_wallet: ownerAddress,
      treasury_pda: treasuryPda,
      tx_signature: signature,
      tx_slot: txSlot,
      tx_block_time: txBlockTime,
      linked_at: linkedAt,
    },
  };
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
    return jsonError("Sign in before linking a treasury.", 401);
  }

  let body: TreasuryLinkBody;

  try {
    body = (await request.json()) as TreasuryLinkBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let ownerAddress: string;
  let treasuryPda: string;
  let signature: string;

  try {
    ownerAddress = getPublicKey(body.ownerAddress, "Owner wallet");
    treasuryPda = getPublicKey(body.treasuryPda, "AURA treasury");
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
      "Link a primary owner wallet before linking a treasury.",
      409,
    );
  }

  if (primaryWallet.wallet_address !== ownerAddress) {
    return jsonError(
      "Connect the primary owner wallet before linking this treasury.",
      403,
    );
  }

  const { data: session, error: sessionError } = await admin
    .from("agent_sessions")
    .select("*")
    .eq("id", id)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (sessionError) {
    return jsonError(sessionError.message, 500);
  }

  if (!session) {
    return jsonError("Signer agent not found for this owner.", 404);
  }

  if (session.treasury_pda && session.treasury_pda !== treasuryPda) {
    return jsonError(
      "This signer agent is already linked to a different treasury.",
      409,
    );
  }

  let transactionInfo: Awaited<ReturnType<typeof verifyTreasuryTransaction>>;

  try {
    transactionInfo = await verifyTreasuryTransaction({
      signature,
      ownerAddress,
      treasuryPda,
    });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  const linkedAt = new Date().toISOString();
  const metadata = metadataObject(session.metadata);
  const nextMetadata: Json = {
    ...metadata,
    onchain_status: "treasury_linked",
    treasury_binding: {
      version: "aura.agent_treasury_binding.v1",
      method: "aura_program_create_treasury",
      owner_wallet: ownerAddress,
      treasury_pda: treasuryPda,
      tx_signature: signature,
      tx_slot: transactionInfo?.slot ?? null,
      tx_block_time: transactionInfo?.blockTime ?? null,
      linked_at: linkedAt,
    },
  };

  const { data: updatedSession, error: updateError } = await admin
    .from("agent_sessions")
    .update({
      treasury_pda: treasuryPda,
      metadata: nextMetadata,
    })
    .eq("id", session.id)
    .eq("owner_id", user.id)
    .select("*")
    .single();

  if (updateError) {
    return jsonError(updateError.message, 500);
  }

  const { data: wallets, error: walletsError } = await admin
    .from("wallet_registry")
    .select("*")
    .eq("owner_id", user.id)
    .eq("agent_session_id", session.id);

  if (walletsError) {
    return jsonError(walletsError.message, 500);
  }

  for (const wallet of wallets ?? []) {
    const { error: walletUpdateError } = await admin
      .from("wallet_registry")
      .update({
        treasury_pda: treasuryPda,
        metadata: walletMetadataWithTreasury(
          wallet,
          treasuryPda,
          ownerAddress,
          signature,
          transactionInfo?.slot ?? null,
          transactionInfo?.blockTime ?? null,
          linkedAt,
        ),
      })
      .eq("id", wallet.id)
      .eq("owner_id", user.id);

    if (walletUpdateError) {
      return jsonError(walletUpdateError.message, 500);
    }
  }

  await admin.from("activity_events").insert({
    owner_id: user.id,
    agent_session_id: session.id,
    treasury_pda: treasuryPda,
    event_kind: "agent_session.treasury_linked",
    severity: "success",
    title: "Signer agent treasury linked",
    summary: `${session.agent_label ?? session.agent_id} is bound to an AURA treasury.`,
    tx_signature: signature,
    metadata: {
      version: "aura.agent_event.treasury_linked.v1",
      owner_wallet: ownerAddress,
      agent_id: session.agent_id,
      treasury_pda: treasuryPda,
      tx_slot: transactionInfo?.slot ?? null,
      tx_block_time: transactionInfo?.blockTime ?? null,
    },
  });

  return NextResponse.json({
    session: updatedSession,
    treasuryPda,
  });
}
