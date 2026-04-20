import { Connection, PublicKey } from "@solana/web3.js";
import type { Command } from "commander";

import {
  flattenResolvedConfig,
  type AuraCliConfig,
  type AuraCliConfigOverrides,
  resolveConfig,
  type ResolvedAuraCliConfig,
} from "./config.js";
import { Aura, AuraClient } from "./sdk.js";
import { loadKeypair } from "./wallet.js";

export interface GlobalOptions {
  rpcUrl?: string;
  wallet?: string;
  programId?: string;
  cluster?: string;
  json?: boolean;
  quiet?: boolean;
  dryRun?: boolean;
}

export interface CliContext {
  output: {
    json: boolean;
    quiet: boolean;
  };
  dryRun: boolean;
  resolvedConfig: ResolvedAuraCliConfig;
  config: AuraCliConfig;
  connection: Connection;
  programId: PublicKey;
  aura?: Aura;
  client: AuraClient;
  wallet?: ReturnType<typeof loadKeypair>;
}

export function getGlobalOptions(command: Command): GlobalOptions {
  const raw = command.optsWithGlobals() as Record<string, unknown>;
  return {
    rpcUrl: typeof raw["rpcUrl"] === "string" ? raw["rpcUrl"] : undefined,
    wallet: typeof raw["wallet"] === "string" ? raw["wallet"] : undefined,
    programId: typeof raw["programId"] === "string" ? raw["programId"] : undefined,
    cluster: typeof raw["cluster"] === "string" ? raw["cluster"] : undefined,
    json: raw["json"] === true,
    quiet: raw["quiet"] === true,
    dryRun: raw["dryRun"] === true,
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

  const wallet = options.needsWallet === false ? undefined : loadKeypair(config.walletPath);
  const aura = wallet
    ? new Aura({
        rpcUrl: config.rpcUrl,
        keypair: wallet,
        programId,
      })
    : undefined;
  const client = aura?.lowLevel ?? new AuraClient({ connection, programId });

  return {
    output: {
      json: globals.json === true,
      quiet: globals.quiet === true,
    },
    dryRun: globals.dryRun === true,
    resolvedConfig,
    config,
    connection,
    programId,
    aura,
    client,
    wallet,
  };
}
