import {
  AURA_PROGRAM_ID,
  AuraClient,
  DWALLET_DEVNET_PROGRAM_ID,
} from "@aura-protocol/sdk-ts";
import { type Connection, Keypair, PublicKey } from "@solana/web3.js";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { IkaDWalletClient } from "@/lib/ika/client";
import { createIkaClient } from "@/lib/ika/client";
import type {
  Database,
  DWalletSessionRow,
  Json,
  WalletRegistryRow,
} from "@/lib/supabase/types";

export const SOLANA_CHAIN_CODE = 2;
export const SOL_ASSET_ID = "sol";
export const SOL_DECIMALS = 9;
export const TRANSFER_TX_TYPE_CODE = 0;
export const CURVE_ED25519 = 2;
export const SCHEME_EDDSA_SHA512 = 5;

export interface PublicDWalletExecutionSession {
  id: string;
  provider: "ika";
  status: "active";
  publicKeyHex: string;
  authorizedUserPubkey: string;
  messageMetadataDigest: string | null;
  dwalletProgramId: string;
  curve: typeof CURVE_ED25519;
  signatureScheme: typeof SCHEME_EDDSA_SHA512;
}

export interface IkaDWalletExecutionSession
  extends PublicDWalletExecutionSession {
  grpcUrl: string | null;
  authority: Keypair;
  sessionIdentifier: Uint8Array;
  dkgAttestation: {
    attestationData: Uint8Array;
    networkSignature: Uint8Array;
    networkPubkey: Uint8Array;
    epoch: bigint;
  };
  createClient(): IkaDWalletClient;
}

type AdminClient = SupabaseClient<Database>;

export function getAuraProgramId() {
  const configured = process.env.NEXT_PUBLIC_AURA_PROGRAM_ID?.trim();
  return configured ? new PublicKey(configured) : AURA_PROGRAM_ID;
}

export function getAuraRpcUrl() {
  return (
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL?.trim() ||
    "https://api.devnet.solana.com"
  );
}

export function createAuraClient(connection: Connection) {
  return new AuraClient({
    connection,
    programId: getAuraProgramId(),
  });
}

export async function loadPublicDWalletExecutionSession(
  admin: AdminClient,
  input: {
    ownerId: string;
    walletId: string;
    agentSessionId: string;
  },
): Promise<PublicDWalletExecutionSession> {
  const session = await loadDWalletSession(admin, input);
  return publicExecutionSession(session);
}

export async function loadIkaDWalletExecutionSession(
  admin: AdminClient,
  input: {
    ownerId: string;
    walletId: string;
    agentSessionId: string;
  },
): Promise<IkaDWalletExecutionSession> {
  const session = await loadDWalletSession(admin, input);
  const publicSession = publicExecutionSession(session);

  if (!session.session_ciphertext) {
    throw new Error(
      "This dWallet has no encrypted Ika session material. Re-provision or link an executable Ika dWallet before agent transfers.",
    );
  }

  const { decryptDWalletSessionMaterial } = await import(
    "@/lib/dwallet/credentials"
  );
  const material = decryptDWalletSessionMaterial(
    session.session_ciphertext as unknown as Parameters<
      typeof decryptDWalletSessionMaterial
    >[0],
    {
      ownerId: input.ownerId,
      walletId: input.walletId,
      agentSessionId: input.agentSessionId,
    },
  );

  return parseIkaSessionMaterial(material, publicSession);
}

export function assertNativeSolanaDWallet(wallet: WalletRegistryRow) {
  if (wallet.wallet_kind !== "dwallet") {
    throw new Error("Conduit transfers require a dWallet.");
  }

  if (wallet.chain_id !== SOLANA_CHAIN_CODE) {
    throw new Error("Real execution currently supports Solana dWallets only.");
  }

  if (!wallet.treasury_pda) {
    throw new Error(
      "This dWallet is missing an AURA treasury PDA. Link it on-chain before transferring.",
    );
  }

  if (!wallet.dwallet_id) {
    throw new Error(
      "This dWallet is missing its Ika dWallet account. Re-register it before transferring.",
    );
  }

  if (!wallet.dwallet_state_pda) {
    throw new Error(
      "This dWallet is missing its AURA dWallet state account. Register it on-chain before transferring.",
    );
  }
}

export function publicExecutionSession(
  session: DWalletSessionRow,
): PublicDWalletExecutionSession {
  if (session.provider !== "ika") {
    throw new Error(
      "Real execution currently requires an Ika dWallet session.",
    );
  }

  if (session.status !== "active") {
    throw new Error(
      "This dWallet does not have an active Ika session. Re-provision or link it before transferring.",
    );
  }

  const publicKeyHex = getHexString(session.public_key_hex, "Public key hex");
  const authorizedUserPubkey = getPublicKeyString(
    session.authorized_user_pubkey,
    "Authorized user",
  );
  const messageMetadataDigest = getOptionalHexString(
    session.message_metadata_digest,
    "Message metadata digest",
  );

  return {
    id: session.id,
    provider: "ika",
    status: "active",
    publicKeyHex,
    authorizedUserPubkey,
    messageMetadataDigest,
    dwalletProgramId: DWALLET_DEVNET_PROGRAM_ID.toBase58(),
    curve: CURVE_ED25519,
    signatureScheme: SCHEME_EDDSA_SHA512,
  };
}

export function assertDWalletAddressMatchesSession(
  wallet: WalletRegistryRow,
  session: PublicDWalletExecutionSession,
) {
  const sessionAddress = new PublicKey(
    Buffer.from(session.publicKeyHex, "hex"),
  ).toBase58();

  if (wallet.chain_address !== sessionAddress) {
    throw new Error(
      "The registered dWallet address does not match the active Ika session public key.",
    );
  }
}

async function loadDWalletSession(
  admin: AdminClient,
  input: {
    ownerId: string;
    walletId: string;
    agentSessionId: string;
  },
) {
  const select = "*";
  const { data, error } = await admin
    .from("dwallet_sessions")
    .select(select)
    .eq("owner_id", input.ownerId)
    .eq("wallet_id", input.walletId)
    .eq("agent_session_id", input.agentSessionId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data) {
    throw new Error(
      "This dWallet is not linked to an executable session for this agent.",
    );
  }

  return data as DWalletSessionRow;
}

function parseIkaSessionMaterial(
  material: Json,
  publicSession: PublicDWalletExecutionSession,
): IkaDWalletExecutionSession {
  const record = getRecord(material, "dWallet session material");
  if (
    getString(record.version, "Session material version") !==
    "aura.ika_dwallet_session.v1"
  ) {
    throw new Error("Unsupported dWallet session material.");
  }

  const authorityRecord = getRecord(record.authority, "Ika authority");
  const dkgRecord = getRecord(record.dkg, "Ika DKG");
  const dwalletRecord = getRecord(record.dwallet, "Ika dWallet");
  const grpcUrl = getOptionalString(record.grpc_url);

  const authority = Keypair.fromSecretKey(
    base64UrlBytes(
      getString(authorityRecord.secret_key_base64url, "Ika authority secret"),
      "Ika authority secret",
    ),
  );
  const authorityPublicKey = getPublicKeyString(
    authorityRecord.public_key,
    "Ika authority public key",
  );
  if (authority.publicKey.toBase58() !== authorityPublicKey) {
    throw new Error("Ika authority secret does not match its public key.");
  }
  if (authorityPublicKey !== publicSession.authorizedUserPubkey) {
    throw new Error(
      "Ika authority does not match the dWallet authorized user.",
    );
  }

  const materialPublicKeyHex = getHexString(
    dwalletRecord.public_key_hex,
    "Ika dWallet public key hex",
  );
  if (materialPublicKeyHex !== publicSession.publicKeyHex) {
    throw new Error("Ika dWallet public key does not match the registry row.");
  }

  return {
    ...publicSession,
    grpcUrl,
    authority,
    sessionIdentifier: hexBytes(
      getHexString(dkgRecord.session_identifier_hex, "Ika session identifier"),
      "Ika session identifier",
    ),
    dkgAttestation: {
      attestationData: hexBytes(
        getHexString(dkgRecord.attestation_data_hex, "DKG attestation"),
        "DKG attestation",
      ),
      networkSignature: hexBytes(
        getHexString(dkgRecord.network_signature_hex, "DKG network signature"),
        "DKG network signature",
      ),
      networkPubkey: hexBytes(
        getHexString(dkgRecord.network_pubkey_hex, "DKG network public key"),
        "DKG network public key",
      ),
      epoch: BigInt(getString(dkgRecord.epoch, "DKG epoch")),
    },
    createClient() {
      return createIkaClient(grpcUrl ?? undefined, authority.secretKey);
    },
  };
}

function getRecord(value: unknown, label: string): Record<string, Json> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`${label} is invalid.`);
  }

  return value as Record<string, Json>;
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

function getPublicKeyString(value: unknown, label: string) {
  const text = getString(value, label);
  try {
    return new PublicKey(text).toBase58();
  } catch {
    throw new Error(`${label} must be a valid Solana address.`);
  }
}

function getHexString(value: unknown, label: string) {
  const text = getString(value, label).toLowerCase();
  if (!/^[0-9a-f]+$/u.test(text) || text.length % 2 !== 0) {
    throw new Error(`${label} must be even-length hexadecimal.`);
  }

  return text;
}

function getOptionalHexString(value: unknown, label: string) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return getHexString(value, label);
}

function hexBytes(value: string, label: string) {
  const bytes = Buffer.from(value, "hex");
  if (bytes.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  return new Uint8Array(bytes);
}

function base64UrlBytes(value: string, label: string) {
  const bytes = Buffer.from(value, "base64url");
  if (bytes.length === 0) {
    throw new Error(`${label} must not be empty.`);
  }

  return new Uint8Array(bytes);
}
