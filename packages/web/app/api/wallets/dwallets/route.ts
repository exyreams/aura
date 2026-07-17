import { PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { AURA_CHAINS, getChainName, SOLANA_CHAIN_ID } from "@/lib/aura/chains";
import { getPrimaryAccountWallet } from "@/lib/auth/primary-wallet";
import { encryptDWalletSessionMaterial } from "@/lib/dwallet/credentials";
import { provisionIkaDWallet } from "@/lib/dwallet/provision";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/types";

export const runtime = "nodejs";

const MAX_LABEL_LENGTH = 80;
const MAX_ADDRESS_LENGTH = 160;
const MAX_IDENTIFIER_LENGTH = 180;
const SUPPORTED_CHAIN_IDS = new Set<number>(
  AURA_CHAINS.map((chain) => chain.id),
);

type DWalletMode = "register" | "provision";
type DWalletProvider = "manual" | "ika" | "conduit";

interface CreateDWalletBody {
  mode?: unknown;
  provider?: unknown;
  agentSessionId?: unknown;
  chainId?: unknown;
  chainAddress?: unknown;
  label?: unknown;
  dwalletId?: unknown;
  dwalletStatePda?: unknown;
  dwalletAccount?: unknown;
  authorizedUserPubkey?: unknown;
  messageMetadataDigest?: unknown;
  publicKeyHex?: unknown;
  registrationTxSignature?: unknown;
}

interface NormalizedDWalletInput {
  provider: DWalletProvider;
  providerSessionId: string | null;
  chainId: number;
  chainAddress: string;
  label: string | null;
  dwalletId: string | null;
  dwalletStatePda: string | null;
  dwalletAccount: string | null;
  authorizedUserPubkey: string | null;
  messageMetadataDigest: string | null;
  publicKeyHex: string | null;
  registrationTxSignature: string | null;
  sessionMaterial: Json | null;
}

interface ProviderDWalletResponse {
  providerSessionId?: unknown;
  provider_session_id?: unknown;
  chainId?: unknown;
  chain?: unknown;
  chainAddress?: unknown;
  chain_address?: unknown;
  address?: unknown;
  label?: unknown;
  dwalletId?: unknown;
  dwallet_id?: unknown;
  dwalletStatePda?: unknown;
  dwallet_state_pda?: unknown;
  dwalletAccount?: unknown;
  dwallet_account?: unknown;
  authorizedUserPubkey?: unknown;
  authorized_user_pubkey?: unknown;
  messageMetadataDigest?: unknown;
  message_metadata_digest?: unknown;
  publicKeyHex?: unknown;
  public_key_hex?: unknown;
  transferSignature?: unknown;
  registrationTxSignature?: unknown;
  registration_tx_signature?: unknown;
  sessionMaterial?: unknown;
  session_material?: unknown;
  credentials?: unknown;
}

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Could not register dWallet.";
}

function getMode(value: unknown): DWalletMode {
  return value === "provision" ? "provision" : "register";
}

function getProvider(value: unknown, mode: DWalletMode): DWalletProvider {
  if (mode === "register") {
    return "manual";
  }

  if (value === "ika" || value === "conduit") {
    return value;
  }

  return "ika";
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

function normalizeSessionMaterial(value: unknown): Json | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  return value as Json;
}

function normalizeInput(
  body: CreateDWalletBody,
  mode: DWalletMode,
  provider: DWalletProvider,
): NormalizedDWalletInput {
  const chainId = getChainId(body.chainId);

  return {
    provider,
    providerSessionId: getOptionalString(
      (body as ProviderDWalletResponse).providerSessionId ??
        (body as ProviderDWalletResponse).provider_session_id,
    ),
    chainId,
    chainAddress: normalizeChainAddress(body.chainAddress, chainId),
    label: getOptionalString(body.label, MAX_LABEL_LENGTH),
    dwalletId: getOptionalString(body.dwalletId),
    dwalletStatePda: normalizeOptionalSolanaPublicKey(
      body.dwalletStatePda,
      "dWallet state PDA",
    ),
    dwalletAccount: normalizeOptionalSolanaPublicKey(
      body.dwalletAccount,
      "dWallet account",
    ),
    authorizedUserPubkey: normalizeOptionalSolanaPublicKey(
      body.authorizedUserPubkey,
      "Authorized user public key",
    ),
    messageMetadataDigest: getOptionalString(body.messageMetadataDigest, 160),
    publicKeyHex: normalizePublicKeyHex(body.publicKeyHex),
    registrationTxSignature: getOptionalString(
      body.registrationTxSignature,
      MAX_IDENTIFIER_LENGTH,
    ),
    sessionMaterial:
      mode === "provision" ? normalizeSessionMaterial(body) : null,
  };
}

function normalizeProviderResponse(
  value: ProviderDWalletResponse,
  provider: DWalletProvider,
  fallbackChainId: number,
  fallbackLabel: string | null,
): NormalizedDWalletInput {
  const chainId = getChainId(value.chainId ?? value.chain ?? fallbackChainId);

  return {
    provider,
    providerSessionId: getOptionalString(
      value.providerSessionId ?? value.provider_session_id,
    ),
    chainId,
    chainAddress: normalizeChainAddress(
      value.chainAddress ?? value.chain_address ?? value.address,
      chainId,
    ),
    label: getOptionalString(value.label, MAX_LABEL_LENGTH) ?? fallbackLabel,
    dwalletId: getOptionalString(value.dwalletId ?? value.dwallet_id),
    dwalletStatePda: normalizeOptionalSolanaPublicKey(
      value.dwalletStatePda ?? value.dwallet_state_pda,
      "dWallet state PDA",
    ),
    dwalletAccount: normalizeOptionalSolanaPublicKey(
      value.dwalletAccount ?? value.dwallet_account,
      "dWallet account",
    ),
    authorizedUserPubkey: normalizeOptionalSolanaPublicKey(
      value.authorizedUserPubkey ?? value.authorized_user_pubkey,
      "Authorized user public key",
    ),
    messageMetadataDigest: getOptionalString(
      value.messageMetadataDigest ?? value.message_metadata_digest,
      160,
    ),
    publicKeyHex: normalizePublicKeyHex(
      value.publicKeyHex ?? value.public_key_hex,
    ),
    registrationTxSignature: getOptionalString(
      value.registrationTxSignature ??
        value.registration_tx_signature ??
        value.transferSignature,
      MAX_IDENTIFIER_LENGTH,
    ),
    sessionMaterial: normalizeSessionMaterial(
      value.sessionMaterial ?? value.session_material ?? value.credentials,
    ),
  };
}

async function provisionDWallet(input: {
  body: CreateDWalletBody;
  provider: DWalletProvider;
  ownerId: string;
  ownerWallet: string;
  agent: {
    id: string;
    agent_id: string;
    agent_label: string | null;
    treasury_pda: string | null;
    metadata: Json;
  };
}) {
  const chainId = getChainId(input.body.chainId);
  const label = getOptionalString(input.body.label, MAX_LABEL_LENGTH);

  if (input.provider === "ika") {
    const provisioned = await provisionIkaDWallet({ chainId, label });
    return normalizeProviderResponse(
      provisioned,
      input.provider,
      chainId,
      label,
    );
  }

  const endpoint = process.env.CONDUIT_DWALLET_PROVISION_URL;

  if (!endpoint) {
    throw new Error(
      "Conduit dWallet provisioning is not wired in the web app yet. Use Ika online creation or register an existing dWallet.",
    );
  }

  const token = process.env.CONDUIT_DWALLET_PROVISION_TOKEN;
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({
      version: "aura.dwallet_provision_request.v1",
      owner_id: input.ownerId,
      owner_wallet: input.ownerWallet,
      agent_session_id: input.agent.id,
      agent_id: input.agent.agent_id,
      agent_label: input.agent.agent_label,
      agent_metadata: input.agent.metadata,
      treasury_pda: input.agent.treasury_pda,
      chain_id: chainId,
      chain_name: getChainName(chainId),
      label,
      rpc_url: process.env.NEXT_PUBLIC_SOLANA_RPC_URL,
      program_id: process.env.NEXT_PUBLIC_AURA_PROGRAM_ID,
    }),
  });

  const payload = (await response.json()) as ProviderDWalletResponse & {
    error?: string;
  };

  if (!response.ok) {
    throw new Error(payload.error ?? "dWallet provider request failed.");
  }

  return normalizeProviderResponse(payload, input.provider, chainId, label);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return jsonError("Sign in before registering a dWallet.", 401);
  }

  let body: CreateDWalletBody;

  try {
    body = (await request.json()) as CreateDWalletBody;
  } catch {
    return jsonError("Request body must be valid JSON.", 400);
  }

  const mode = getMode(body.mode);
  const provider = getProvider(body.provider, mode);
  let agentSessionId: string;

  try {
    agentSessionId = getString(body.agentSessionId, "Signer agent");
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
      "Link a primary owner wallet before registering a dWallet.",
      409,
    );
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

  if (agent.status !== "active") {
    return jsonError("Choose an active signer agent.", 409);
  }

  let normalized: NormalizedDWalletInput;

  try {
    normalized =
      mode === "provision"
        ? await provisionDWallet({
            body,
            provider,
            ownerId: user.id,
            ownerWallet: primaryWallet.wallet_address,
            agent,
          })
        : normalizeInput(body, mode, provider);
  } catch (cause) {
    const message = getErrorMessage(cause);
    const status =
      mode === "provision"
        ? message.includes("not configured")
          ? 501
          : message.includes("Choose a supported chain")
            ? 400
            : 502
        : 400;
    return jsonError(message, status);
  }

  if (!normalized.dwalletId) {
    return jsonError(
      "dWallet ID is required.",
      mode === "provision" ? 502 : 400,
    );
  }

  const chainName = getChainName(normalized.chainId);
  const walletLabel =
    normalized.label ??
    `${agent.agent_label ?? agent.agent_id} ${chainName} dWallet`;

  const { data: wallet, error: walletError } = await admin
    .from("wallet_registry")
    .insert({
      owner_id: user.id,
      agent_session_id: agent.id,
      treasury_pda: agent.treasury_pda,
      wallet_kind: "dwallet",
      chain_id: normalized.chainId,
      chain_name: chainName,
      dwallet_id: normalized.dwalletId,
      dwallet_state_pda: normalized.dwalletStatePda,
      chain_address: normalized.chainAddress,
      label: walletLabel,
      status: normalized.registrationTxSignature
        ? "onchain_registered"
        : mode === "provision"
          ? "ika_provisioned"
          : "metadata_registered",
      metadata: {
        version: "aura.wallet_registry.dwallet.v1",
        created_via: "web",
        source: mode,
        provider: normalized.provider,
        provider_session_id: normalized.providerSessionId,
        onchain_registration: normalized.registrationTxSignature
          ? "recorded"
          : "not_recorded",
        registration_tx_signature: normalized.registrationTxSignature,
        session_material: normalized.sessionMaterial
          ? "encrypted_service_only"
          : "not_available",
        agent: {
          id: agent.id,
          agent_id: agent.agent_id,
          label: agent.agent_label,
          treasury_pda: agent.treasury_pda,
        },
        dwallet: {
          dwallet_account: normalized.dwalletAccount,
          authorized_user_pubkey: normalized.authorizedUserPubkey,
          message_metadata_digest: normalized.messageMetadataDigest,
          public_key_hex: normalized.publicKeyHex,
        },
      },
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

  let sessionCiphertext: Json | null = null;
  let keyVersion: string | null = null;

  try {
    if (normalized.sessionMaterial) {
      const envelope = encryptDWalletSessionMaterial(
        normalized.sessionMaterial,
        {
          ownerId: user.id,
          walletId: wallet.id,
          agentSessionId: agent.id,
        },
      );
      sessionCiphertext = envelope as unknown as Json;
      keyVersion = envelope.key_version;
    }
  } catch (cause) {
    await admin.from("wallet_registry").delete().eq("id", wallet.id);
    return jsonError(getErrorMessage(cause), 500);
  }

  const hasEncryptedSession = Boolean(sessionCiphertext);
  const { data: dwalletSession, error: sessionError } = await admin
    .from("dwallet_sessions")
    .insert({
      wallet_id: wallet.id,
      owner_id: user.id,
      agent_session_id: agent.id,
      provider: normalized.provider,
      provider_session_id: normalized.providerSessionId,
      status: hasEncryptedSession ? "active" : "metadata_only",
      session_ciphertext: sessionCiphertext,
      key_version: keyVersion,
      public_key_hex: normalized.publicKeyHex,
      authorized_user_pubkey: normalized.authorizedUserPubkey,
      message_metadata_digest: normalized.messageMetadataDigest,
      metadata: {
        version: "aura.dwallet_session.v1",
        created_via: "web",
        source: mode,
        chain_id: normalized.chainId,
        chain_name: chainName,
        chain_address: normalized.chainAddress,
        dwallet_id: normalized.dwalletId,
        dwallet_state_pda: normalized.dwalletStatePda,
        dwallet_account: normalized.dwalletAccount,
        registration_tx_signature: normalized.registrationTxSignature,
        has_encrypted_session: hasEncryptedSession,
      },
    })
    .select("id,provider,status,created_at")
    .single();

  if (sessionError) {
    await admin.from("wallet_registry").delete().eq("id", wallet.id);
    return jsonError(sessionError.message, 500);
  }

  await admin.from("activity_events").insert({
    owner_id: user.id,
    agent_session_id: agent.id,
    treasury_pda: agent.treasury_pda,
    wallet_id: wallet.id,
    event_kind: "wallet.dwallet.registered",
    severity: "success",
    title: mode === "provision" ? "dWallet provisioned" : "dWallet registered",
    summary: `${walletLabel} is linked to ${agent.agent_label ?? agent.agent_id}.`,
    tx_signature: normalized.registrationTxSignature,
    metadata: {
      version: "aura.wallet_event.dwallet_registered.v1",
      source: mode,
      provider: normalized.provider,
      provider_session_id: normalized.providerSessionId,
      chain_id: normalized.chainId,
      chain_name: chainName,
      chain_address: normalized.chainAddress,
      dwallet_id: normalized.dwalletId,
      dwallet_state_pda: normalized.dwalletStatePda,
      dwallet_account: normalized.dwalletAccount,
      authorized_user_pubkey: normalized.authorizedUserPubkey,
      message_metadata_digest: normalized.messageMetadataDigest,
      public_key_hex: normalized.publicKeyHex,
      registration_tx_signature: normalized.registrationTxSignature,
      has_encrypted_session: hasEncryptedSession,
      dwallet_session_id: dwalletSession.id,
    },
  });

  return NextResponse.json({
    wallet,
    dwalletSession: {
      id: dwalletSession.id,
      provider: dwalletSession.provider,
      status: dwalletSession.status,
      createdAt: dwalletSession.created_at,
      hasEncryptedSession,
    },
  });
}
