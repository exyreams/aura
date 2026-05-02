import { AURA_PROGRAM_ID, DEVNET_RPC_URL } from "@aura-protocol/sdk-ts";
import path from "node:path";
import { PublicKey } from "@solana/web3.js";

export interface BackendConfig {
  host: string;
  port: number;
  defaultRpcUrl: string;
  defaultProgramId: PublicKey;
  keypairPath: string;
  defaultAgentIntervalMs: number;
  bodyLimitBytes: number;
  rateLimitWindowMs: number;
  rateLimitMaxRequests: number;
  allowedOrigins: string[];
  apiToken?: string;
  logLevel: "debug" | "info" | "warn" | "error";
}

const DEFAULT_KEYPAIR_PATH = path.resolve(
  import.meta.dirname ?? process.cwd(),
  "../../../wallet/wallet.json",
);

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
    keypairPath:
      process.env.AURA_BACKEND_KEYPAIR?.trim() || DEFAULT_KEYPAIR_PATH,
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
    apiToken: process.env.AURA_API_TOKEN?.trim() || undefined,
    logLevel: resolvedLogLevel,
  };
}
