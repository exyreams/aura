import { AURA_PROGRAM_ID, DEVNET_RPC_URL } from "@aura/sdk-ts";
import { PublicKey } from "@solana/web3.js";

export interface BackendConfig {
  host: string;
  port: number;
  defaultRpcUrl: string;
  defaultProgramId: PublicKey;
  keypairPath: string;
  defaultAgentIntervalMs: number;
}

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing required env ${name}`);
  }
  return value;
}

export function loadConfig(): BackendConfig {
  return {
    host: process.env.AURA_BACKEND_HOST?.trim() || "127.0.0.1",
    port: Number(process.env.AURA_BACKEND_PORT || 8787),
    defaultRpcUrl: process.env.AURA_DEFAULT_RPC_URL?.trim() || DEVNET_RPC_URL,
    defaultProgramId: process.env.AURA_DEFAULT_PROGRAM_ID?.trim()
      ? new PublicKey(process.env.AURA_DEFAULT_PROGRAM_ID.trim())
      : AURA_PROGRAM_ID,
    keypairPath: requireEnv("AURA_BACKEND_KEYPAIR"),
    defaultAgentIntervalMs: Number(process.env.AURA_AGENT_INTERVAL_MS || 30000),
  };
}
