import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Json } from "@/lib/supabase/types";

const CIPHER_ALGORITHM = "aes-256-gcm";
const KEY_LENGTH_BYTES = 32;
const NONCE_LENGTH_BYTES = 12;

export interface DWalletCredentialContext {
  ownerId: string;
  walletId: string;
  agentSessionId: string | null;
}

interface DWalletSessionEnvelope {
  version: "aura.dwallet_session_ciphertext.v1";
  alg: "AES-256-GCM";
  key_version: string;
  aad: {
    owner_id: string;
    wallet_id: string;
    agent_session_id: string | null;
  };
  nonce: string;
  ciphertext: string;
  tag: string;
}

function base64UrlEncode(value: Buffer) {
  return value.toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url");
}

function decodeConfiguredKey() {
  const rawKey = process.env.DWALLET_CREDENTIALS_KEY?.trim();

  if (!rawKey) {
    throw new Error(
      "Missing DWALLET_CREDENTIALS_KEY for encrypted dWallet sessions.",
    );
  }

  const candidates: Buffer[] = [];

  if (/^[0-9a-f]{64}$/i.test(rawKey)) {
    candidates.push(Buffer.from(rawKey, "hex"));
  }

  candidates.push(Buffer.from(rawKey, "base64url"));
  candidates.push(Buffer.from(rawKey, "base64"));

  const key = candidates.find(
    (candidate) => candidate.length === KEY_LENGTH_BYTES,
  );

  if (!key) {
    throw new Error(
      "DWALLET_CREDENTIALS_KEY must be a 32-byte key encoded as base64url, base64, or 64 hex characters.",
    );
  }

  return key;
}

function buildAad(context: DWalletCredentialContext) {
  return Buffer.from(
    [
      "aura.dwallet-session.v1",
      context.ownerId,
      context.walletId,
      context.agentSessionId ?? "none",
    ].join(":"),
    "utf8",
  );
}

function getKeyVersion() {
  return process.env.DWALLET_CREDENTIALS_KEY_VERSION?.trim() || "v1";
}

export function encryptDWalletSessionMaterial(
  value: Json,
  context: DWalletCredentialContext,
): DWalletSessionEnvelope {
  const key = decodeConfiguredKey();
  const nonce = randomBytes(NONCE_LENGTH_BYTES);
  const cipher = createCipheriv(CIPHER_ALGORITHM, key, nonce);
  cipher.setAAD(buildAad(context));

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);

  return {
    version: "aura.dwallet_session_ciphertext.v1",
    alg: "AES-256-GCM",
    key_version: getKeyVersion(),
    aad: {
      owner_id: context.ownerId,
      wallet_id: context.walletId,
      agent_session_id: context.agentSessionId,
    },
    nonce: base64UrlEncode(nonce),
    ciphertext: base64UrlEncode(ciphertext),
    tag: base64UrlEncode(cipher.getAuthTag()),
  };
}

export function decryptDWalletSessionMaterial(
  envelope: DWalletSessionEnvelope,
  context: DWalletCredentialContext,
): Json {
  if (
    envelope.version !== "aura.dwallet_session_ciphertext.v1" ||
    envelope.alg !== "AES-256-GCM"
  ) {
    throw new Error("Unsupported dWallet session envelope.");
  }

  const key = decodeConfiguredKey();
  const decipher = createDecipheriv(
    CIPHER_ALGORITHM,
    key,
    base64UrlDecode(envelope.nonce),
  );
  decipher.setAAD(buildAad(context));
  decipher.setAuthTag(base64UrlDecode(envelope.tag));

  const plaintext = Buffer.concat([
    decipher.update(base64UrlDecode(envelope.ciphertext)),
    decipher.final(),
  ]);

  return JSON.parse(plaintext.toString("utf8")) as Json;
}
