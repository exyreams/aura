import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { type AgentScope, isAgentScope } from "@/lib/agents/scopes";
import type { Json } from "@/lib/supabase/types";

const USER_CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const USER_CODE_LENGTH = 8;
const HANDOFF_AAD = Buffer.from("aura.conduit.token_handoff.v1", "utf8");

export const DEVICE_CODE_TTL_SECONDS = 15 * 60;
export const DEVICE_POLL_INTERVAL_SECONDS = 5;
export const TOKEN_HANDOFF_TTL_SECONDS = 5 * 60;

export interface EncryptedHandoffToken {
  tokenCiphertext: string;
  tokenIv: string;
  tokenTag: string;
}

export function createDeviceCodeSecret() {
  return `dev_${randomBytes(32).toString("base64url")}`;
}

export function createUserCode() {
  let raw = "";

  for (let index = 0; index < USER_CODE_LENGTH; index += 1) {
    raw += USER_CODE_ALPHABET[randomBytes(1)[0] % USER_CODE_ALPHABET.length];
  }

  return formatUserCode(raw);
}

export function formatUserCode(value: string) {
  const compact = value.toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (compact.length !== USER_CODE_LENGTH) {
    throw new Error("Enter the 8-character Conduit authorization code.");
  }

  return `${compact.slice(0, 4)}-${compact.slice(4)}`;
}

export function normalizeDeviceScopes(value: unknown): AgentScope[] {
  if (!Array.isArray(value)) {
    return ["read"];
  }

  const invalidScopes = value.filter(
    (scope) => typeof scope !== "string" || !isAgentScope(scope),
  );

  if (invalidScopes.length > 0) {
    throw new Error("Device request includes unsupported scopes.");
  }

  return Array.from(new Set(["read", ...(value as AgentScope[])]));
}

export function hashDeviceCode(deviceCode: string) {
  return createHash("sha256").update(deviceCode, "utf8").digest("hex");
}

export function expiresAtFromNow(seconds: number) {
  return new Date(Date.now() + seconds * 1000).toISOString();
}

export function secondsUntil(value: string | null) {
  if (!value) {
    return 0;
  }

  return Math.max(
    0,
    Math.floor((new Date(value).getTime() - Date.now()) / 1000),
  );
}

export function isJsonObject(
  value: Json,
): value is { [key: string]: Json | undefined } {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function getHandoffKey() {
  const secret =
    process.env.CONDUIT_TOKEN_HANDOFF_SECRET ?? process.env.SUPABASE_SECRET_KEY;

  if (!secret) {
    throw new Error(
      "Missing CONDUIT_TOKEN_HANDOFF_SECRET or SUPABASE_SECRET_KEY.",
    );
  }

  return createHash("sha256").update(secret, "utf8").digest();
}

export function encryptHandoffToken(token: string): EncryptedHandoffToken {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getHandoffKey(), iv);
  cipher.setAAD(HANDOFF_AAD);

  const ciphertext = Buffer.concat([
    cipher.update(token, "utf8"),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();

  return {
    tokenCiphertext: ciphertext.toString("base64url"),
    tokenIv: iv.toString("base64url"),
    tokenTag: tag.toString("base64url"),
  };
}

export function decryptHandoffToken({
  tokenCiphertext,
  tokenIv,
  tokenTag,
}: EncryptedHandoffToken) {
  const decipher = createDecipheriv(
    "aes-256-gcm",
    getHandoffKey(),
    Buffer.from(tokenIv, "base64url"),
  );
  decipher.setAAD(HANDOFF_AAD);
  decipher.setAuthTag(Buffer.from(tokenTag, "base64url"));

  return Buffer.concat([
    decipher.update(Buffer.from(tokenCiphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}
