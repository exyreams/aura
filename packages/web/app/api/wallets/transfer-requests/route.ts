import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const MAX_NOTE_LENGTH = 240;
const REQUEST_TTL_MINUTES = 30;
interface CreateTransferRequestBody {
  walletId?: unknown;
  agentSessionId?: unknown;
  recipientAddress?: unknown;
  amountUi?: unknown;
  rawAmount?: unknown;
  decimals?: unknown;
  assetKind?: unknown;
  assetSymbol?: unknown;
  assetName?: unknown;
  tokenMint?: unknown;
  tokenProgram?: unknown;
  sourceTokenAccount?: unknown;
  note?: unknown;
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

function getOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function getPublicKey(value: unknown, label: string) {
  const text = getString(value, label);

  try {
    return new PublicKey(text).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana address.`);
  }
}

function getRawAmount(value: unknown) {
  const rawAmount = getString(value, "Raw amount");

  if (!/^\d+$/.test(rawAmount) || BigInt(rawAmount) <= BigInt(0)) {
    throw new Error("Raw amount must be a positive integer.");
  }

  return rawAmount;
}

function getDecimals(value: unknown) {
  if (
    typeof value !== "number" ||
    !Number.isInteger(value) ||
    value < 0 ||
    value > 18
  ) {
    throw new Error("Token decimals must be an integer between 0 and 18.");
  }

  return value;
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not create request.";
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before creating a transfer request.", 401);
  }

  let body: CreateTransferRequestBody;

  try {
    body = (await request.json()) as CreateTransferRequestBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  let walletId: string;
  let agentSessionId: string;
  let recipientAddress: string;
  let rawAmount: string;
  let decimals: number;
  let assetKind: "native" | "token";
  let assetSymbol: string;
  let assetName: string | null;
  let tokenMint: string | null;
  let tokenProgram: string | null;
  let sourceTokenAccount: string | null;
  let amountUi: string;
  let note: string | null;

  try {
    walletId = getString(body.walletId, "Wallet ID");
    agentSessionId = getString(body.agentSessionId, "Signer agent");
    recipientAddress = getPublicKey(body.recipientAddress, "Recipient");
    rawAmount = getRawAmount(body.rawAmount);
    decimals = getDecimals(body.decimals);
    amountUi = getString(body.amountUi, "Amount");
    assetKind = body.assetKind === "token" ? "token" : "native";
    assetSymbol = getString(body.assetSymbol, "Asset symbol").slice(0, 24);
    assetName = getOptionalString(body.assetName)?.slice(0, 80) ?? null;
    note = getOptionalString(body.note)?.slice(0, MAX_NOTE_LENGTH) ?? null;

    if (assetKind === "token") {
      tokenMint = getPublicKey(body.tokenMint, "Token mint");
      tokenProgram = getPublicKey(body.tokenProgram, "Token program");
      sourceTokenAccount = getPublicKey(
        body.sourceTokenAccount,
        "Source token account",
      );
    } else {
      tokenMint = null;
      tokenProgram = null;
      sourceTokenAccount = null;
    }
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

  const { data: agent, error: agentError } = await admin
    .from("agent_sessions")
    .select("*")
    .eq("id", agentSessionId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (agentError) {
    return jsonError(agentError.message, 500);
  }

  if (!agent) {
    return jsonError("Signer agent not found for this owner.", 404);
  }

  if (wallet.agent_session_id && wallet.agent_session_id !== agent.id) {
    return jsonError(
      "Transfer requests must use the signer agent linked to this wallet.",
      409,
    );
  }

  if (!wallet.agent_session_id) {
    return jsonError("This wallet is not linked to a signer agent.", 409);
  }

  if (agent.status !== "active") {
    return jsonError("Choose an active signer agent.", 409);
  }

  if (!agent.scopes.includes("wallet:transfer")) {
    return jsonError("Signer agent is missing the wallet:transfer scope.", 403);
  }

  const expiresAt = new Date();
  expiresAt.setMinutes(expiresAt.getMinutes() + REQUEST_TTL_MINUTES);

  const message = `Transfer ${amountUi} ${assetSymbol} from ${
    wallet.label ?? wallet.chain_name
  } to ${recipientAddress}.`;

  const payload = {
    version: "aura.wallet_transfer_request.v1",
    created_via: "web",
    execution_status: "pending_agent_signing",
    wallet: {
      id: wallet.id,
      kind: wallet.wallet_kind,
      chain_id: wallet.chain_id,
      chain_name: wallet.chain_name,
      chain_address: wallet.chain_address,
      treasury_pda: wallet.treasury_pda,
      dwallet_id: wallet.dwallet_id,
      dwallet_state_pda: wallet.dwallet_state_pda,
    },
    agent: {
      id: agent.id,
      agent_id: agent.agent_id,
      label: agent.agent_label,
      treasury_pda: agent.treasury_pda,
    },
    transfer: {
      asset_kind: assetKind,
      symbol: assetSymbol,
      name: assetName,
      amount_ui: amountUi,
      raw_amount: rawAmount,
      decimals,
      recipient_address: recipientAddress,
      token_mint: tokenMint,
      token_program: tokenProgram,
      source_token_account: sourceTokenAccount,
      note,
    },
    sdk_hint: {
      package: "@aura-protocol/sdk-ts",
      flow: "proposeTransaction -> runAuraApproval -> sendSolanaTransfer",
      requires_native_binding: wallet.wallet_kind === "dwallet",
    },
  };

  const { data: signRequest, error: insertError } = await admin
    .from("sign_requests")
    .insert({
      owner_id: user.id,
      agent_session_id: agent.id,
      treasury_pda: wallet.treasury_pda,
      request_kind: "wallet_withdrawal_approval",
      status: "pending",
      payload,
      message,
      expires_at: expiresAt.toISOString(),
    })
    .select("*")
    .single();

  if (insertError) {
    return jsonError(insertError.message, 500);
  }

  await admin.from("activity_events").insert({
    owner_id: user.id,
    agent_session_id: agent.id,
    treasury_pda: wallet.treasury_pda,
    wallet_id: wallet.id,
    event_kind: "wallet.transfer_request.created",
    severity: "info",
    title: "Transfer request created",
    summary: message,
    proposal_id: signRequest.id,
    metadata: payload,
  });

  return NextResponse.json({ signRequest });
}
