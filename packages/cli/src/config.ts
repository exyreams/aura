import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

import { AURA_PROGRAM_ID, DEVNET_RPC_URL } from "./sdk.js";

export type ConfigSource = "flag" | "env" | "config" | "default";

export interface AuraCliConfig {
  rpcUrl: string;
  walletPath: string;
  cluster: string;
  programId: string;
  defaultAgentId: string | null;
}

export interface ResolvedField<T> {
  value: T;
  source: ConfigSource;
}

export interface ResolvedAuraCliConfig {
  rpcUrl: ResolvedField<string>;
  walletPath: ResolvedField<string>;
  cluster: ResolvedField<string>;
  programId: ResolvedField<string>;
  defaultAgentId: ResolvedField<string | null>;
}

export interface AuraCliConfigOverrides {
  rpcUrl?: string;
  walletPath?: string;
  cluster?: string;
  programId?: string;
  defaultAgentId?: string | null;
}

export const DEFAULT_CONFIG: AuraCliConfig = {
  rpcUrl: DEVNET_RPC_URL,
  walletPath: "~/.config/solana/id.json",
  cluster: "devnet",
  programId: AURA_PROGRAM_ID.toBase58(),
  defaultAgentId: null,
};

export function expandHome(inputPath: string): string {
  if (inputPath === "~") {
    return homedir();
  }
  if (inputPath.startsWith("~/")) {
    return path.join(homedir(), inputPath.slice(2));
  }
  return inputPath;
}

export function compactHome(inputPath: string): string {
  const home = homedir();
  if (inputPath === home) {
    return "~";
  }
  if (inputPath.startsWith(`${home}${path.sep}`)) {
    return `~/${inputPath.slice(home.length + 1)}`;
  }
  return inputPath;
}

export function getConfigDir(): string {
  return path.join(homedir(), ".aura");
}

export function getConfigPath(): string {
  return path.join(getConfigDir(), "config.json");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function readConfigFile(): Partial<AuraCliConfig> {
  const filePath = getConfigPath();
  if (!existsSync(filePath)) {
    return {};
  }

  const parsed = JSON.parse(readFileSync(filePath, "utf8")) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Config file ${filePath} must contain a JSON object`);
  }

  return {
    rpcUrl: typeof parsed["rpcUrl"] === "string" ? parsed["rpcUrl"] : undefined,
    walletPath: typeof parsed["walletPath"] === "string" ? parsed["walletPath"] : undefined,
    cluster: typeof parsed["cluster"] === "string" ? parsed["cluster"] : undefined,
    programId: typeof parsed["programId"] === "string" ? parsed["programId"] : undefined,
    defaultAgentId:
      typeof parsed["defaultAgentId"] === "string" || parsed["defaultAgentId"] === null
        ? (parsed["defaultAgentId"] as string | null)
        : undefined,
  };
}

export function writeConfigFile(config: Partial<AuraCliConfig>): string {
  const filePath = getConfigPath();
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, `${JSON.stringify(config, null, 2)}\n`, "utf8");
  return filePath;
}

function pickField<T>(
  flagValue: T | undefined,
  envValue: T | undefined,
  fileValue: T | undefined,
  defaultValue: T,
): ResolvedField<T> {
  if (flagValue !== undefined) {
    return { value: flagValue, source: "flag" };
  }
  if (envValue !== undefined) {
    return { value: envValue, source: "env" };
  }
  if (fileValue !== undefined) {
    return { value: fileValue, source: "config" };
  }
  return { value: defaultValue, source: "default" };
}

export function resolveConfig(
  overrides: AuraCliConfigOverrides = {},
  env: NodeJS.ProcessEnv = process.env,
): ResolvedAuraCliConfig {
  const fileConfig = readConfigFile();

  return {
    rpcUrl: pickField(
      overrides.rpcUrl,
      env["AURA_RPC_URL"] ?? env["AURA_DEVNET_RPC_URL"] ?? env["SOLANA_RPC_URL"],
      fileConfig.rpcUrl,
      DEFAULT_CONFIG.rpcUrl,
    ),
    walletPath: pickField(
      overrides.walletPath,
      env["AURA_WALLET_PATH"] ?? env["PAYER_KEYPAIR"],
      fileConfig.walletPath,
      DEFAULT_CONFIG.walletPath,
    ),
    cluster: pickField(
      overrides.cluster,
      env["AURA_CLUSTER"],
      fileConfig.cluster,
      DEFAULT_CONFIG.cluster,
    ),
    programId: pickField(
      overrides.programId,
      env["AURA_PROGRAM_ID"],
      fileConfig.programId,
      DEFAULT_CONFIG.programId,
    ),
    defaultAgentId: pickField(
      overrides.defaultAgentId,
      env["AURA_DEFAULT_AGENT_ID"],
      fileConfig.defaultAgentId,
      DEFAULT_CONFIG.defaultAgentId,
    ),
  };
}

export function flattenResolvedConfig(resolved: ResolvedAuraCliConfig): AuraCliConfig {
  return {
    rpcUrl: resolved.rpcUrl.value,
    walletPath: resolved.walletPath.value,
    cluster: resolved.cluster.value,
    programId: resolved.programId.value,
    defaultAgentId: resolved.defaultAgentId.value,
  };
}
