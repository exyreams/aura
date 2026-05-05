import { AURA_PROGRAM_ID, DEVNET_RPC_URL } from "@aura-protocol/sdk-ts";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";

export interface BackendConfig {
  host: string;
  port: number;
  defaultRpcUrl: string;
  defaultProgramId: PublicKey;
  databasePath: string;
  encryptionKeyHex: string;
  jwtSecretHex: string;
  jwtExpirySecs: number;
  cookieName: string;
  cookieDomain?: string;
  cookieSecure: boolean;
  defaultAgentIntervalMs: number;
  bodyLimitBytes: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  allowedOrigins: string[];
  logLevel: "debug" | "info" | "warn" | "error";
}

const DEFAULT_ALLOWED_ORIGINS = [
  "http://127.0.0.1:3000",
  "http://localhost:3000",
];

function parseNumber(value: string | undefined, fallback: number, label: string) {
  if (!value?.trim()) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${label} must be a positive number.`);
  }
  return parsed;
}

function parseHexSecret(value: string | undefined, label: string) {
  const trimmed = value?.trim() || "";
  if (!/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    throw new Error(`${label} must be set to 32 random bytes encoded as 64 hex characters.`);
  }
  return trimmed;
}

export function loadConfig(): BackendConfig {
  const allowedOrigins = process.env.AURA_ALLOWED_ORIGINS?.trim()
    ? process.env.AURA_ALLOWED_ORIGINS.split(",")
        .map((origin) => origin.trim())
        .filter(Boolean)
    : DEFAULT_ALLOWED_ORIGINS;

  const logLevel = process.env.AURA_LOG_LEVEL?.trim();
  const resolvedLogLevel: BackendConfig["logLevel"] =
    logLevel === "debug" ||
    logLevel === "info" ||
    logLevel === "warn" ||
    logLevel === "error"
      ? logLevel
      : "info";

  return {
    host: process.env.AURA_BACKEND_HOST?.trim() || "127.0.0.1",
    port: parseNumber(process.env.AURA_BACKEND_PORT, 8787, "AURA_BACKEND_PORT"),
    defaultRpcUrl: process.env.AURA_DEFAULT_RPC_URL?.trim() || DEVNET_RPC_URL,
    defaultProgramId: process.env.AURA_DEFAULT_PROGRAM_ID?.trim()
      ? new PublicKey(process.env.AURA_DEFAULT_PROGRAM_ID.trim())
      : AURA_PROGRAM_ID,
    databasePath: path.resolve(
      process.env.AURA_DATABASE_PATH?.trim() || "./data/aura.db",
    ),
    encryptionKeyHex: parseHexSecret(
      process.env.AURA_ENCRYPTION_KEY,
      "AURA_ENCRYPTION_KEY",
    ),
    jwtSecretHex: parseHexSecret(
      process.env.AURA_JWT_SECRET,
      "AURA_JWT_SECRET",
    ),
    jwtExpirySecs: parseNumber(
      process.env.AURA_JWT_EXPIRY_SECS,
      86_400,
      "AURA_JWT_EXPIRY_SECS",
    ),
    cookieName: process.env.AURA_COOKIE_NAME?.trim() || "aura_session",
    cookieDomain: process.env.AURA_COOKIE_DOMAIN?.trim() || undefined,
    cookieSecure: process.env.AURA_COOKIE_SECURE?.trim() === "false" ? false : true,
    defaultAgentIntervalMs: parseNumber(
      process.env.AURA_AGENT_INTERVAL_MS,
      30000,
      "AURA_AGENT_INTERVAL_MS",
    ),
    bodyLimitBytes: parseNumber(
      process.env.AURA_BODY_LIMIT_BYTES,
      1_000_000,
      "AURA_BODY_LIMIT_BYTES",
    ),
    rateLimitWindowMs: parseNumber(
      process.env.AURA_RATE_LIMIT_WINDOW_MS,
      60_000,
      "AURA_RATE_LIMIT_WINDOW_MS",
    ),
    rateLimitMaxRequests: parseNumber(
      process.env.AURA_RATE_LIMIT_MAX_REQUESTS,
      120,
      "AURA_RATE_LIMIT_MAX_REQUESTS",
    ),
    allowedOrigins,
    logLevel: resolvedLogLevel,
  };
}
