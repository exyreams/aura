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
}

const DEFAULT_KEYPAIR_PATH = path.resolve(
  import.meta.dirname,
  "../../../wallet/wallet.json",
);

export function loadConfig(): BackendConfig {
  return {
    host: process.env.AURA_BACKEND_HOST?.trim() || "127.0.0.1",
    port: Number(process.env.AURA_BACKEND_PORT || 8787),
    defaultRpcUrl: process.env.AURA_DEFAULT_RPC_URL?.trim() || DEVNET_RPC_URL,
    defaultProgramId: process.env.AURA_DEFAULT_PROGRAM_ID?.trim()
      ? new PublicKey(process.env.AURA_DEFAULT_PROGRAM_ID.trim())
      : AURA_PROGRAM_ID,
    keypairPath:
      process.env.AURA_BACKEND_KEYPAIR?.trim() || DEFAULT_KEYPAIR_PATH,
    defaultAgentIntervalMs: Number(process.env.AURA_AGENT_INTERVAL_MS || 30000),
  };
}
