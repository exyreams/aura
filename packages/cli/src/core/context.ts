import { AuraClient } from "@aura-protocol/sdk-ts";
import { Connection, PublicKey } from "@solana/web3.js";
import type { Command } from "commander";
import {
  type AuraCliConfig,
  type AuraCliConfigOverrides,
  flattenResolvedConfig,
  type ResolvedAuraCliConfig,
  resolveConfig,
} from "./config.js";
import { classifyNetwork, type NetworkInfo } from "./network.js";
import { loadKeypair } from "./wallet.js";

export interface GlobalOptions {
  rpcUrl?: string;
  wallet?: string;
  programId?: string;
  cluster?: string;
  json?: boolean;
  quiet?: boolean;
  dryRun?: boolean;
  /** Skip interactive confirmations (CI / non-interactive use). */
  yes?: boolean;
  /** Preflight-simulate writes before sending (default true; `--no-simulate`). */
  simulate?: boolean;
  /** Override the compute-unit limit for sent transactions. */
  computeUnits?: number;
}

/** Per-invocation send/guard flags derived from global options. */
export interface CliFlags {
  yes: boolean;
  simulate: boolean;
  computeUnits?: number;
}

export interface CliContext {
  output: {
    json: boolean;
    quiet: boolean;
  };
  dryRun: boolean;
  flags: CliFlags;
  resolvedConfig: ResolvedAuraCliConfig;
  config: AuraCliConfig;
  connection: Connection;
  programId: PublicKey;
  network: NetworkInfo;
  client: AuraClient;
  wallet?: ReturnType<typeof loadKeypair>;
}

export function getGlobalOptions(command: Command): GlobalOptions {
  const raw = command.optsWithGlobals() as Record<string, unknown>;
  return {
    rpcUrl: typeof raw.rpcUrl === "string" ? raw.rpcUrl : undefined,
    wallet: typeof raw.wallet === "string" ? raw.wallet : undefined,
    programId: typeof raw.programId === "string" ? raw.programId : undefined,
    cluster: typeof raw.cluster === "string" ? raw.cluster : undefined,
    json: raw.json === true,
    quiet: raw.quiet === true,
    dryRun: raw.dryRun === true,
    yes: raw.yes === true,
    // commander sets `simulate` to false only when `--no-simulate` is passed.
    simulate: raw.simulate !== false,
    computeUnits:
      typeof raw.computeUnits === "number" ? raw.computeUnits : undefined,
  };
}

export function resolveGlobalConfig(command: Command): {
  globals: GlobalOptions;
  resolvedConfig: ResolvedAuraCliConfig;
  config: AuraCliConfig;
} {
  const globals = getGlobalOptions(command);
  const overrides: AuraCliConfigOverrides = {
    rpcUrl: globals.rpcUrl,
    walletPath: globals.wallet,
    programId: globals.programId,
    cluster: globals.cluster,
  };
  const resolvedConfig = resolveConfig(overrides);
  const config = flattenResolvedConfig(resolvedConfig);
  return { globals, resolvedConfig, config };
}

export function buildCliContext(
  command: Command,
  options: { needsWallet?: boolean } = {},
): CliContext {
  const { globals, resolvedConfig, config } = resolveGlobalConfig(command);
  const connection = new Connection(config.rpcUrl, "confirmed");
  const programId = new PublicKey(config.programId);

  const wallet =
    options.needsWallet === false ? undefined : loadKeypair(config.walletPath);
  const client = new AuraClient({ connection, programId });

  return {
    output: {
      json: globals.json === true,
      quiet: globals.quiet === true,
    },
    dryRun: globals.dryRun === true,
    flags: {
      yes: globals.yes === true,
      simulate: globals.simulate !== false,
      computeUnits: globals.computeUnits,
    },
    resolvedConfig,
    config,
    connection,
    programId,
    network: classifyNetwork(config.rpcUrl),
    client,
    wallet,
  };
}
