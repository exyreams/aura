import { derivePolicyTemplateAddress } from "@aura-protocol/sdk-ts";
import { Connection, PublicKey } from "@solana/web3.js";
import bs58 from "bs58";
import { NextResponse } from "next/server";
import { getPrimaryAccountWallet } from "@/lib/auth/primary-wallet";
import {
  closePolicyTemplateSnapshot,
  syncPolicyTemplateSnapshotFromChain,
  syncTreasuryPolicySnapshotFromChain,
} from "@/lib/policies/policy-snapshot-cache";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

const DEFAULT_AURA_PROGRAM_ID = "auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce";

type PolicyTemplateAction = "create" | "update" | "apply" | "close";

interface ConfirmPolicyTemplateBody {
  action?: unknown;
  signature?: unknown;
  ownerAddress?: unknown;
  templateId?: unknown;
  templateAddress?: unknown;
  templateName?: unknown;
  treasuryPda?: unknown;
  sourcePreset?: unknown;
  shared?: unknown;
  cluster?: unknown;
  programId?: unknown;
  blockhash?: unknown;
  feeLamports?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not confirm policy transaction.";
}

function getString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function getOptionalString(value: unknown, maxLength = 120) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim().slice(0, maxLength);
}

function getPublicKey(value: unknown, label: string) {
  const text = getString(value, label);

  try {
    return new PublicKey(text).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana address.`);
  }
}

function getOptionalPublicKey(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return getPublicKey(value, label);
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

function getAction(value: unknown): PolicyTemplateAction {
  if (
    value === "create" ||
    value === "update" ||
    value === "apply" ||
    value === "close"
  ) {
    return value;
  }

  throw new Error("Policy action is invalid.");
}

function getTemplateId(value: unknown) {
  const templateId = getString(value, "Template ID");

  if (!/^\d+$/u.test(templateId)) {
    throw new Error("Template ID must be an unsigned integer.");
  }

  return templateId;
}

function getCluster(value: unknown) {
  return value === "mainnet-beta" ? "mainnet-beta" : "devnet";
}

function getOptionalNumber(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function getRpcUrl(cluster: "devnet" | "mainnet-beta") {
  const configured = process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim();

  if (configured) {
    return configured;
  }

  return cluster === "mainnet-beta"
    ? "https://api.mainnet-beta.solana.com"
    : "https://api.devnet.solana.com";
}

function getProgramId(value: unknown) {
  const text =
    typeof value === "string" && value.trim()
      ? value.trim()
      : process.env.NEXT_PUBLIC_AURA_PROGRAM_ID?.trim() ||
        DEFAULT_AURA_PROGRAM_ID;

  try {
    return new PublicKey(text).toBase58();
  } catch {
    throw new Error("AURA program ID must be a valid Solana address.");
  }
}

async function verifyPolicyTransaction(input: {
  signature: string;
  ownerAddress: string;
  templateAddress: string;
  treasuryPda: string | null;
  programId: string;
  cluster: "devnet" | "mainnet-beta";
}) {
  const connection = new Connection(getRpcUrl(input.cluster), "confirmed");

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const transaction = await connection.getParsedTransaction(input.signature, {
      commitment: "confirmed",
      maxSupportedTransactionVersion: 0,
    });

    if (transaction) {
      if (transaction.meta?.err) {
        throw new Error("The policy transaction failed on-chain.");
      }

      const accountKeys = transaction.transaction.message.accountKeys;
      const ownerSigned = accountKeys.some(
        (account) =>
          account.signer && account.pubkey.toBase58() === input.ownerAddress,
      );
      const touchesTemplate = accountKeys.some(
        (account) => account.pubkey.toBase58() === input.templateAddress,
      );
      const touchesTreasury = input.treasuryPda
        ? accountKeys.some(
            (account) => account.pubkey.toBase58() === input.treasuryPda,
          )
        : true;
      const callsAuraProgram =
        transaction.transaction.message.instructions.some(
          (instruction) => instruction.programId.toBase58() === input.programId,
        );

      if (!ownerSigned) {
        throw new Error(
          "The policy transaction was not signed by the owner wallet.",
        );
      }

      if (!touchesTemplate) {
        throw new Error(
          "The policy transaction does not reference this template PDA.",
        );
      }

      if (!touchesTreasury) {
        throw new Error(
          "The policy transaction does not reference this treasury PDA.",
        );
      }

      if (!callsAuraProgram) {
        throw new Error(
          "The policy transaction does not call the AURA program.",
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

  throw new Error("Could not find the confirmed policy transaction on RPC.");
}

function eventKind(action: PolicyTemplateAction) {
  return action === "create"
    ? "policy.template.created"
    : action === "update"
      ? "policy.template.updated"
      : action === "apply"
        ? "policy.template.applied"
        : "policy.template.closed";
}

function eventTitle(action: PolicyTemplateAction) {
  return action === "create"
    ? "Policy template created"
    : action === "update"
      ? "Policy template updated"
      : action === "apply"
        ? "Policy template applied"
        : "Policy template closed";
}

function eventSummary(input: {
  action: PolicyTemplateAction;
  templateName: string | null;
  templateId: string;
  treasuryPda: string | null;
}) {
  const name = input.templateName || `template ${input.templateId}`;

  if (input.action === "apply" && input.treasuryPda) {
    return `${name} was applied to treasury ${input.treasuryPda}.`;
  }

  if (input.action === "close") {
    return `${name} was closed on-chain.`;
  }

  return `${name} was ${input.action === "create" ? "created" : "updated"} on-chain.`;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before confirming policy transactions.", 401);
  }

  let body: ConfirmPolicyTemplateBody;

  try {
    body = (await request.json()) as ConfirmPolicyTemplateBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let action: PolicyTemplateAction;
  let signature: string;
  let ownerAddress: string;
  let templateId: string;
  let templateAddress: string;
  let treasuryPda: string | null;
  let cluster: "devnet" | "mainnet-beta";
  let programId: string;

  try {
    action = getAction(body.action);
    signature = getSignature(body.signature);
    ownerAddress = getPublicKey(body.ownerAddress, "Owner wallet");
    templateId = getTemplateId(body.templateId);
    templateAddress = getPublicKey(body.templateAddress, "Template PDA");
    treasuryPda = getOptionalPublicKey(body.treasuryPda, "Treasury PDA");
    cluster = getCluster(body.cluster);
    programId = getProgramId(body.programId);

    if (action === "apply" && !treasuryPda) {
      throw new Error("Treasury PDA is required when applying a template.");
    }
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  const [expectedTemplateAddress] = derivePolicyTemplateAddress(
    new PublicKey(ownerAddress),
    templateId,
    new PublicKey(programId),
  );

  if (expectedTemplateAddress.toBase58() !== templateAddress) {
    return jsonError(
      "Template PDA does not match the derived on-chain address.",
      400,
    );
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
      "Link a primary owner wallet before confirming policy transactions.",
      409,
    );
  }

  if (primaryWallet.wallet_address !== ownerAddress) {
    return jsonError(
      "Connect the primary owner wallet before confirming this policy transaction.",
      403,
    );
  }

  let transactionInfo: Awaited<ReturnType<typeof verifyPolicyTransaction>>;

  try {
    transactionInfo = await verifyPolicyTransaction({
      signature,
      ownerAddress,
      templateAddress,
      treasuryPda,
      programId,
      cluster,
    });
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  const templateName = getOptionalString(body.templateName, 48);
  const snapshotConnection = new Connection(getRpcUrl(cluster), "confirmed");

  try {
    if (action === "close") {
      await closePolicyTemplateSnapshot({
        admin,
        ownerId: user.id,
        ownerWallet: ownerAddress,
        cluster,
        programId,
        templatePda: templateAddress,
        signature,
        slot: transactionInfo.slot,
      });
    } else {
      const syncedTemplate = await syncPolicyTemplateSnapshotFromChain({
        admin,
        ownerId: user.id,
        ownerWallet: ownerAddress,
        cluster,
        programId,
        connection: snapshotConnection,
        templatePda: templateAddress,
        action,
        signature,
        slot: transactionInfo.slot,
      });

      if (action === "apply" && treasuryPda) {
        await syncTreasuryPolicySnapshotFromChain({
          admin,
          ownerId: user.id,
          ownerWallet: ownerAddress,
          cluster,
          programId,
          connection: snapshotConnection,
          treasuryPda,
          templatePda: templateAddress,
          templateId,
          templateName: syncedTemplate.name || templateName,
          action,
          signature,
          slot: transactionInfo.slot,
        });
      }
    }
  } catch (cause) {
    return jsonError(
      `Policy transaction confirmed, but the Supabase policy snapshot could not be updated: ${getErrorMessage(
        cause,
      )}`,
      500,
    );
  }

  const metadata: Json = {
    version: "aura.policy_template.tx.v1",
    action,
    source: { kind: "owner_web" },
    owner_wallet: ownerAddress,
    template_id: templateId,
    template_pda: templateAddress,
    template_name: templateName,
    treasury_pda: treasuryPda,
    source_preset: getOptionalNumber(body.sourcePreset),
    shared: typeof body.shared === "boolean" ? body.shared : null,
    cluster,
    program_id: programId,
    blockhash: getOptionalString(body.blockhash, 120),
    fee_lamports: getOptionalNumber(body.feeLamports),
    tx_slot: transactionInfo.slot,
    tx_block_time: transactionInfo.blockTime,
  };

  const { error: insertError } = await admin.from("activity_events").insert({
    owner_id: user.id,
    treasury_pda: treasuryPda,
    event_kind: eventKind(action),
    severity: action === "close" ? "warning" : "success",
    title: eventTitle(action),
    summary: eventSummary({ action, templateName, templateId, treasuryPda }),
    tx_signature: signature,
    metadata,
  });

  if (insertError) {
    return jsonError(insertError.message, 500);
  }

  return NextResponse.json({ ok: true, transaction: transactionInfo });
}
