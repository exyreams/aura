import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { AURA_CHAINS, getChainName, SOLANA_CHAIN_ID } from "@/lib/aura/chains";
import {
  assertConduitScope,
  authenticateConduitAgent,
} from "@/lib/conduit/agent-token";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

const MAX_LABEL_LENGTH = 80;
const MAX_ADDRESS_LENGTH = 160;
const MAX_IDENTIFIER_LENGTH = 180;
const SUPPORTED_CHAIN_IDS = new Set<number>(
  AURA_CHAINS.map((chain) => chain.id),
);

interface AgentDWalletBody {
  chainId?: unknown;
  chainAddress?: unknown;
  label?: unknown;
  dwalletId?: unknown;
  dwalletStatePda?: unknown;
  dwalletAccount?: unknown;
  authorizedUserPubkey?: unknown;
  messageMetadataDigest?: unknown;
  publicKeyHex?: unknown;
  providerSessionId?: unknown;
  provider_session_id?: unknown;
  metadata?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Could not create pending dWallet.";
}

function getErrorStatus(error: unknown) {
  const message = getErrorMessage(error);

  if (message.includes("Missing Conduit bearer token")) {
    return 401;
  }

  if (
    message.includes("Unknown or revoked") ||
    message.includes("expired") ||
    message.includes("revoked") ||
    message.includes("missing wallet:create")
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

function getOptionalString(value: unknown, maxLength = MAX_IDENTIFIER_LENGTH) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return value.trim().slice(0, maxLength);
}

function getChainId(value: unknown) {
  const chainId =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : Number.NaN;

  if (!Number.isInteger(chainId) || !SUPPORTED_CHAIN_IDS.has(chainId)) {
    throw new Error("Choose a supported chain.");
  }

  return chainId;
}

function normalizeSolanaPublicKey(value: unknown, label: string) {
  const text = getString(value, label);

  try {
    return new PublicKey(text).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana address.`);
  }
}

function normalizeOptionalSolanaPublicKey(value: unknown, label: string) {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  return normalizeSolanaPublicKey(value, label);
}

function normalizeChainAddress(value: unknown, chainId: number) {
  if (chainId === SOLANA_CHAIN_ID) {
    return normalizeSolanaPublicKey(value, "Wallet address");
  }

  const address = getString(value, "Wallet address");

  if (address.length > MAX_ADDRESS_LENGTH) {
    throw new Error("Wallet address is too long.");
  }

  return address;
}

function normalizePublicKeyHex(value: unknown) {
  const publicKeyHex = getOptionalString(value, 512);

  if (!publicKeyHex) {
    return null;
  }

  if (!/^[0-9a-f]+$/i.test(publicKeyHex) || publicKeyHex.length % 2 !== 0) {
    throw new Error("Public key hex must be even-length hexadecimal.");
  }

  return publicKeyHex;
}

function normalizeMetadata(value: unknown): Json {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const serialized = JSON.stringify(value);
  if (serialized.length > 8_192) {
    throw new Error("Metadata is too large.");
  }

  return JSON.parse(serialized) as Json;
}

export async function POST(request: Request) {
  let auth: Awaited<ReturnType<typeof authenticateConduitAgent>>;
  let body: AgentDWalletBody;

  try {
    auth = await authenticateConduitAgent(request);
    assertConduitScope(auth.session, "wallet:create");
    body = (await request.json()) as AgentDWalletBody;
  } catch (cause) {
    return jsonError(getErrorMessage(cause), getErrorStatus(cause));
  }

  let chainId: number;
  let chainAddress: string;
  let dwalletId: string;
  let dwalletStatePda: string | null;
  let dwalletAccount: string | null;
  let authorizedUserPubkey: string | null;
  let messageMetadataDigest: string | null;
  let publicKeyHex: string | null;
  let providerSessionId: string | null;
  let label: string | null;
  let requestMetadata: Json;

  try {
    chainId = getChainId(body.chainId);
    chainAddress = normalizeChainAddress(body.chainAddress, chainId);
    dwalletId = getString(body.dwalletId, "dWallet ID").slice(
      0,
      MAX_IDENTIFIER_LENGTH,
    );
    dwalletStatePda = normalizeOptionalSolanaPublicKey(
      body.dwalletStatePda,
      "dWallet state PDA",
    );
    dwalletAccount = normalizeOptionalSolanaPublicKey(
      body.dwalletAccount,
      "dWallet account",
    );
    authorizedUserPubkey = normalizeOptionalSolanaPublicKey(
      body.authorizedUserPubkey,
      "Authorized user public key",
    );
    messageMetadataDigest = getOptionalString(body.messageMetadataDigest, 160);
    publicKeyHex = normalizePublicKeyHex(body.publicKeyHex);
    providerSessionId = getOptionalString(
      body.providerSessionId ?? body.provider_session_id,
    );
    label = getOptionalString(body.label, MAX_LABEL_LENGTH);
    requestMetadata = normalizeMetadata(body.metadata);
  } catch (cause) {
    return jsonError(getErrorMessage(cause), 400);
  }

  const chainName = getChainName(chainId);
  const walletLabel =
    label ??
    `${auth.session.agent_label ?? auth.session.agent_id} ${chainName} dWallet`;
  const now = new Date().toISOString();
  const walletMetadata: Json = {
    version: "aura.wallet_registry.dwallet.v1",
    created_via: "conduit_agent",
    source: "agent",
    provider: "conduit",
    provider_session_id: providerSessionId,
    dashboard_action: "link_wallet_from_dashboard",
    onchain_registration: "not_recorded",
    registration_tx_signature: null,
    session_material: "not_available",
    agent: {
      id: auth.session.id,
      agent_id: auth.session.agent_id,
      label: auth.session.agent_label,
      treasury_pda: auth.session.treasury_pda,
    },
    dwallet: {
      dwallet_account: dwalletAccount,
      authorized_user_pubkey: authorizedUserPubkey,
      message_metadata_digest: messageMetadataDigest,
      public_key_hex: publicKeyHex,
    },
    agent_request: {
      recorded_at: now,
      metadata: requestMetadata,
    },
  };

  const { data: wallet, error: walletError } = await auth.admin
    .from("wallet_registry")
    .insert({
      owner_id: auth.session.owner_id,
      agent_session_id: auth.session.id,
      treasury_pda: auth.session.treasury_pda,
      wallet_kind: "dwallet",
      chain_id: chainId,
      chain_name: chainName,
      dwallet_id: dwalletId,
      dwallet_state_pda: dwalletStatePda,
      chain_address: chainAddress,
      label: walletLabel,
      status: "agent_created_pending",
      metadata: walletMetadata,
    })
    .select("*")
    .single();

  if (walletError) {
    const status = walletError.code === "23505" ? 409 : 500;
    const message =
      walletError.code === "23505"
        ? "A wallet with this chain address is already registered."
        : walletError.message;
    return jsonError(message, status);
  }

  const { data: dwalletSession, error: sessionError } = await auth.admin
    .from("dwallet_sessions")
    .insert({
      wallet_id: wallet.id,
      owner_id: auth.session.owner_id,
      agent_session_id: auth.session.id,
      provider: "conduit",
      provider_session_id: providerSessionId,
      status: "metadata_only",
      public_key_hex: publicKeyHex,
      authorized_user_pubkey: authorizedUserPubkey,
      message_metadata_digest: messageMetadataDigest,
      metadata: {
        version: "aura.dwallet_session.v1",
        created_via: "conduit_agent",
        source: "agent",
        chain_id: chainId,
        chain_name: chainName,
        chain_address: chainAddress,
        dwallet_id: dwalletId,
        dwallet_state_pda: dwalletStatePda,
        dwallet_account: dwalletAccount,
        provider_session_id: providerSessionId,
        has_encrypted_session: false,
        dashboard_action: "link_wallet_from_dashboard",
      },
    })
    .select("id,provider,status,created_at")
    .single();

  if (sessionError) {
    await auth.admin.from("wallet_registry").delete().eq("id", wallet.id);
    return jsonError(sessionError.message, 500);
  }

  await auth.admin.from("activity_events").insert({
    owner_id: auth.session.owner_id,
    agent_session_id: auth.session.id,
    treasury_pda: auth.session.treasury_pda,
    wallet_id: wallet.id,
    event_kind: "wallet.dwallet.agent_created",
    severity: "warning",
    title: "dWallet created by agent",
    summary: `${walletLabel} was recorded by ${auth.session.agent_label ?? auth.session.agent_id}. Link it from the dashboard before agent execution uses it.`,
    metadata: {
      version: "aura.wallet_event.dwallet_agent_created.v1",
      source: "conduit_agent",
      provider: "conduit",
      provider_session_id: providerSessionId,
      chain_id: chainId,
      chain_name: chainName,
      chain_address: chainAddress,
      dwallet_id: dwalletId,
      dwallet_state_pda: dwalletStatePda,
      dwallet_account: dwalletAccount,
      authorized_user_pubkey: authorizedUserPubkey,
      message_metadata_digest: messageMetadataDigest,
      public_key_hex: publicKeyHex,
      dwallet_session_id: dwalletSession.id,
      dashboard_action: "link_wallet_from_dashboard",
    },
  });

  return NextResponse.json({
    wallet,
    dwalletSession: {
      id: dwalletSession.id,
      provider: dwalletSession.provider,
      status: dwalletSession.status,
      createdAt: dwalletSession.created_at,
      hasEncryptedSession: false,
    },
    nextAction: "link_wallet_from_dashboard",
  });
}
