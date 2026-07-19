import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { metadataString } from "@/lib/agents/session-model";
import {
  assertConduitScope,
  authenticateConduitAgent,
} from "@/lib/conduit/agent-token";
import {
  assertDWalletAddressMatchesSession,
  assertNativeSolanaDWallet,
  getAuraProgramId,
  loadPublicDWalletExecutionSession,
  SOL_ASSET_ID,
  SOL_DECIMALS,
  SOLANA_CHAIN_CODE,
  TRANSFER_TX_TYPE_CODE,
} from "@/lib/conduit/wallet-transfer-execution";
import {
  evaluateTransferPolicies,
  transferPolicyDenialMessage,
  transferPolicyEvaluationToJson,
} from "@/lib/policies/transfer-policy";
import type { Json } from "@/lib/supabase/types";
import { getDWalletStatusModel } from "@/lib/wallets/dwallet-status";
import { getTransferRequestSummary } from "@/lib/wallets/transfer-requests";

export const runtime = "nodejs";

const MAX_NOTE_LENGTH = 240;
const MAX_METADATA_BYTES = 8_192;
const REQUEST_TTL_MINUTES = 30;

interface ConduitTransferRequestBody {
  walletId?: unknown;
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
  metadata?: unknown;
}

function jsonError(message: string, status: number, details?: Json) {
  return NextResponse.json({ error: message, details }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not create transfer request.";
}

function getAuthErrorStatus(error: unknown) {
  const message = getErrorMessage(error);

  if (message.includes("Missing Conduit bearer token")) {
    return 401;
  }

  if (
    message.includes("Unknown or revoked") ||
    message.includes("expired") ||
    message.includes("revoked") ||
    message.includes("missing wallet:transfer")
  ) {
    return 403;
  }

  return 400;
}

function getString(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`${label} is required.`);
  }

  return value.trim();
}

function getOptionalString(value: unknown, maxLength = 240) {
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

function getRawAmount(value: unknown) {
  const rawAmount =
    typeof value === "number" && Number.isInteger(value)
      ? String(value)
      : getString(value, "Raw amount");

  if (!/^\d+$/u.test(rawAmount) || BigInt(rawAmount) <= BigInt(0)) {
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

function formatRawAmount(rawAmount: string, decimals: number) {
  if (decimals === 0) {
    return rawAmount;
  }

  const padded = rawAmount.padStart(decimals + 1, "0");
  const whole = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/u, "");

  return fraction ? `${whole}.${fraction}` : whole;
}

function normalizeMetadata(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > MAX_METADATA_BYTES) {
    throw new Error("Metadata is too large.");
  }

  return JSON.parse(serialized) as Json;
}

function transferNextAction(status: string) {
  if (status === "pending") {
    return "owner_review_required" as const;
  }

  if (status === "approved") {
    return "approved_execution_bridge_pending" as const;
  }

  return "none" as const;
}

function getSetupErrorStatus(error: unknown) {
  const message = getErrorMessage(error);
  return message.includes("supports Solana") ? 400 : 409;
}

export async function POST(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateConduitAgent>>;
  let body: ConduitTransferRequestBody;

  try {
    auth = await authenticateConduitAgent(request);
    assertConduitScope(auth.session, "wallet:transfer");
    body = (await request.json()) as ConduitTransferRequestBody;
  } catch (cause) {
    return jsonError(getErrorMessage(cause), getAuthErrorStatus(cause));
  }

  let walletId: string;
  let recipientAddress: string;
  let rawAmount: string;
  let decimals: number;
  let amountUi: string;
  let assetKind: "native" | "token";
  let assetSymbol: string;
  let assetName: string | null;
  let tokenMint: string | null;
  let tokenProgram: string | null;
  let sourceTokenAccount: string | null;
  let note: string | null;
  let requestMetadata: Json;

  try {
    walletId = getString(body.walletId, "Wallet ID");
    recipientAddress = getPublicKey(body.recipientAddress, "Recipient");
    rawAmount = getRawAmount(body.rawAmount);
    decimals = getDecimals(body.decimals);
    amountUi =
      getOptionalString(body.amountUi, 80) ??
      formatRawAmount(rawAmount, decimals);
    assetKind = body.assetKind === "token" ? "token" : "native";
    assetSymbol = (
      getOptionalString(body.assetSymbol, 24) ??
      (assetKind === "native" ? "SOL" : null) ??
      getString(body.assetSymbol, "Asset symbol")
    ).slice(0, 24);
    assetName = getOptionalString(body.assetName, 80);
    note = getOptionalString(body.note, MAX_NOTE_LENGTH);
    requestMetadata = normalizeMetadata(body.metadata);

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

  const { data: wallet, error: walletError } = await auth.admin
    .from("wallet_registry")
    .select("*")
    .eq("id", walletId)
    .eq("owner_id", auth.session.owner_id)
    .maybeSingle();

  if (walletError) {
    return jsonError(walletError.message, 500);
  }

  if (!wallet) {
    return jsonError("Wallet not found for this owner.", 404);
  }

  if (wallet.wallet_kind !== "dwallet") {
    return jsonError("Conduit transfers require a dWallet.", 409);
  }

  const walletStatus = getDWalletStatusModel(wallet);
  if (walletStatus.isOwnerLinkRequired) {
    return jsonError(
      walletStatus.nextActionDescription ??
        "Link this dWallet from the dashboard before requesting transfers.",
      409,
    );
  }

  const { data: walletPermission, error: permissionError } = await auth.admin
    .from("agent_wallet_permissions")
    .select("*")
    .eq("owner_id", auth.session.owner_id)
    .eq("wallet_id", wallet.id)
    .eq("agent_session_id", auth.session.id)
    .eq("status", "active")
    .contains("scopes", ["wallet:transfer"])
    .maybeSingle();

  if (permissionError) {
    return jsonError(permissionError.message, 500);
  }

  if (!walletPermission) {
    return jsonError(
      "Grant wallet transfer access to this signer agent first.",
      403,
    );
  }

  const policyEvaluation = await evaluateTransferPolicies({
    ownerId: auth.session.owner_id,
    wallet,
    agent: auth.session,
    admin: auth.admin,
    transfer: {
      assetKind,
      assetSymbol,
      rawAmount,
      amountUi,
      decimals,
      recipientAddress,
      tokenMint,
      expiresInMinutes: REQUEST_TTL_MINUTES,
    },
  });

  const policyMetadata = transferPolicyEvaluationToJson(policyEvaluation);

  const message = `${auth.session.agent_label ?? auth.session.agent_id} requests ${amountUi} ${assetSymbol} from ${
    wallet.label ?? wallet.chain_name
  } to ${recipientAddress}.`;

  if (policyEvaluation.decision === "block") {
    const deniedMetadata: Json = {
      version: "aura.wallet_transfer_policy_denial.v1",
      created_via: "conduit_agent",
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
        id: auth.session.id,
        agent_id: auth.session.agent_id,
        label: auth.session.agent_label,
        treasury_pda: auth.session.treasury_pda,
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
      permission: {
        id: walletPermission.id,
        scopes: walletPermission.scopes,
        grant_source: walletPermission.grant_source,
      },
      policy: policyMetadata,
      source: {
        kind: "conduit_agent",
        conduit_session_id: auth.session.id,
        conduit_agent_id: auth.session.agent_id,
        metadata: requestMetadata,
      },
    };

    await auth.admin.from("activity_events").insert({
      owner_id: auth.session.owner_id,
      agent_session_id: auth.session.id,
      treasury_pda: wallet.treasury_pda ?? auth.session.treasury_pda,
      wallet_id: wallet.id,
      event_kind: "policy.transfer.denied",
      severity: "error",
      title: "Transfer denied by policy",
      summary: message,
      metadata: deniedMetadata,
    });

    return jsonError(
      transferPolicyDenialMessage(policyEvaluation),
      422,
      policyMetadata,
    );
  }

  if (policyEvaluation.decision === "allow") {
    if (assetKind !== "native") {
      return jsonError(
        "Real agent execution currently supports native SOL transfers only. Token transfers must stay out of the agent execution path until SPL transfer construction is wired.",
        409,
      );
    }

    if (decimals !== SOL_DECIMALS || assetSymbol.toUpperCase() !== "SOL") {
      return jsonError(
        "Native Solana dWallet execution requires SOL with 9 decimals.",
        400,
      );
    }

    let dwalletSession: Awaited<
      ReturnType<typeof loadPublicDWalletExecutionSession>
    >;

    try {
      assertNativeSolanaDWallet(wallet);
      dwalletSession = await loadPublicDWalletExecutionSession(auth.admin, {
        ownerId: auth.session.owner_id,
        walletId: wallet.id,
        agentSessionId: auth.session.id,
      });
      assertDWalletAddressMatchesSession(wallet, dwalletSession);
    } catch (cause) {
      return jsonError(getErrorMessage(cause), getSetupErrorStatus(cause));
    }

    if (!policyEvaluation.amountUsd) {
      return jsonError(
        "Policy allowed this transfer without a trusted USD amount; refusing agent execution.",
        409,
      );
    }

    const url = new URL(request.url);
    const programId = getAuraProgramId();
    const executionIntent = {
      version: "aura.wallet_transfer_execution_intent.v1",
      mode: "native_solana_dwallet_transfer",
      status: "ready",
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
      dwallet: {
        id: dwalletSession.id,
        provider: dwalletSession.provider,
        status: dwalletSession.status,
        publicKeyHex: dwalletSession.publicKeyHex,
        authorizedUserPubkey: dwalletSession.authorizedUserPubkey,
        messageMetadataDigest: dwalletSession.messageMetadataDigest,
        dwalletProgramId: dwalletSession.dwalletProgramId,
        curve: dwalletSession.curve,
        signatureScheme: dwalletSession.signatureScheme,
      },
      transfer: {
        asset_kind: assetKind,
        asset_id: SOL_ASSET_ID,
        symbol: "SOL",
        name: assetName,
        amount_ui: amountUi,
        raw_amount: rawAmount,
        decimals,
        recipient_address: recipientAddress,
        note,
      },
      aura: {
        program_id: programId.toBase58(),
        treasury_pda: wallet.treasury_pda,
        owner_pubkey: metadataString(auth.session.metadata, "owner_wallet"),
        agent_id: auth.session.agent_id,
        ai_authority: metadataString(
          auth.session.metadata,
          "authority_public_key",
        ),
        amount_usd: policyEvaluation.amountUsd,
        target_chain: SOLANA_CHAIN_CODE,
        tx_type: TRANSFER_TX_TYPE_CODE,
        confirmations_required: 1,
      },
      policy: policyMetadata,
      endpoints: {
        dwallet_signature: "/wallets/dwallet-signatures",
        execution_result: "/wallets/transfer-executions",
      },
      source: {
        kind: "conduit_agent",
        conduit_session_id: auth.session.id,
        conduit_agent_id: auth.session.agent_id,
        metadata: requestMetadata,
      },
    } satisfies Json;

    await auth.admin.from("activity_events").insert({
      owner_id: auth.session.owner_id,
      agent_session_id: auth.session.id,
      treasury_pda: wallet.treasury_pda ?? auth.session.treasury_pda,
      wallet_id: wallet.id,
      event_kind: "wallet.transfer.execution_intent.created",
      severity: "info",
      title: "Transfer execution prepared",
      summary: message,
      metadata: executionIntent,
    });

    return NextResponse.json({
      signRequest: null,
      execution: executionIntent,
      dashboardUrl: `${url.origin}/dashboard/wallets`,
      nextAction: "execute_native_solana_transfer",
      runtimeCanExecute: true,
      policy: policyEvaluation,
      note: "Policy allowed this native SOL transfer. Conduit must now submit the bound AURA proposal, obtain the dWallet signature for the exact Solana message, broadcast it, and settle on-chain.",
    });
  }

  const expiresAt = new Date();
  expiresAt.setMinutes(
    expiresAt.getMinutes() + policyEvaluation.effectiveExpiryMinutes,
  );

  const payload: Json = {
    version: "aura.wallet_transfer_request.v1",
    created_via: "conduit_agent",
    execution_status: "pending_owner_approval",
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
      id: auth.session.id,
      agent_id: auth.session.agent_id,
      label: auth.session.agent_label,
      treasury_pda: auth.session.treasury_pda,
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
    permission: {
      id: walletPermission.id,
      scopes: walletPermission.scopes,
      grant_source: walletPermission.grant_source,
    },
    policy: policyMetadata,
    source: {
      kind: "conduit_agent",
      reviewed_by_owner: false,
      conduit_session_id: auth.session.id,
      conduit_agent_id: auth.session.agent_id,
      metadata: requestMetadata,
    },
    sdk_hint: {
      package: "@aura-protocol/sdk-ts",
      flow: "ownerReviewRequired",
      execution_bridge: "policy_review_required",
    },
  };

  const { data: signRequest, error: insertError } = await auth.admin
    .from("sign_requests")
    .insert({
      owner_id: auth.session.owner_id,
      agent_session_id: auth.session.id,
      treasury_pda: wallet.treasury_pda ?? auth.session.treasury_pda,
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

  await auth.admin.from("activity_events").insert({
    owner_id: auth.session.owner_id,
    agent_session_id: auth.session.id,
    treasury_pda: wallet.treasury_pda ?? auth.session.treasury_pda,
    wallet_id: wallet.id,
    event_kind: "wallet.transfer_request.created_by_agent",
    severity: "warning",
    title: "Transfer request queued by agent",
    summary: message,
    proposal_id: signRequest.id,
    metadata: payload,
  });

  const url = new URL(request.url);
  const dashboardUrl = `${url.origin}/dashboard/wallets`;
  const summary = getTransferRequestSummary(signRequest);

  return NextResponse.json({
    signRequest,
    transfer: summary,
    dashboardUrl,
    nextAction: transferNextAction(signRequest.status),
    runtimeCanExecute: false,
    policy: policyEvaluation,
    note: "The transfer needs owner review because the live policy could not produce an agent-executable allow decision.",
  });
}
