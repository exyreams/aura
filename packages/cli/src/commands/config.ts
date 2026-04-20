import { input } from "@inquirer/prompts";
import { type Command } from "commander";

import {
  compactHome,
  DEFAULT_CONFIG,
  flattenResolvedConfig,
  getConfigPath,
  readConfigFile,
  resolveConfig,
  type AuraCliConfig,
  writeConfigFile,
} from "../config.js";
import { resolveGlobalConfig } from "../context.js";
import { createTable, emitJson, printBanner, printSuccess } from "../output.js";

const CONFIG_KEYS = new Map<string, keyof AuraCliConfig>([
  ["rpc-url", "rpcUrl"],
  ["wallet-path", "walletPath"],
  ["cluster", "cluster"],
  ["program-id", "programId"],
  ["default-agent-id", "defaultAgentId"],
]);

export function registerConfigCommands(program: Command): void {
  const config = program.command("config").description("Manage AURA CLI configuration");

  config
    .command("init")
    .description("Create or update ~/.aura/config.json")
    .action(async function configInit() {
      const { globals, config: current } = resolveGlobalConfig(this);
      const output = {
        json: globals.json === true,
        quiet: globals.quiet === true,
      };

      printBanner(output, "AURA CLI - Initial Setup");

      const rpcUrl = await input({
        message: "RPC URL",
        default: current.rpcUrl,
      });
      const walletPath = await input({
        message: "Wallet path",
        default: current.walletPath,
      });
      const programId = await input({
        message: "Program ID",
        default: current.programId,
      });
      const defaultAgentId = await input({
        message: "Default agent ID (optional)",
        default: current.defaultAgentId ?? "",
      });

      const filePath = writeConfigFile({
        rpcUrl,
        walletPath,
        cluster: current.cluster,
        programId,
        defaultAgentId: defaultAgentId.trim().length > 0 ? defaultAgentId.trim() : null,
      });

      if (output.json) {
        emitJson(output, {
          path: filePath,
          config: {
            rpcUrl,
            walletPath,
            cluster: current.cluster,
            programId,
            defaultAgentId: defaultAgentId.trim().length > 0 ? defaultAgentId.trim() : null,
          },
        });
        return;
      }

      printSuccess(output, `Config written to ${filePath}`);
    });

  config
    .command("show")
    .description("Display the resolved CLI configuration")
    .action(async function configShow() {
      const { globals, resolvedConfig, config: flattened } = resolveGlobalConfig(this);
      const output = {
        json: globals.json === true,
        quiet: globals.quiet === true,
      };

      if (output.json) {
        emitJson(output, {
          values: flattened,
          sources: {
            rpcUrl: resolvedConfig.rpcUrl.source,
            walletPath: resolvedConfig.walletPath.source,
            cluster: resolvedConfig.cluster.source,
            programId: resolvedConfig.programId.source,
            defaultAgentId: resolvedConfig.defaultAgentId.source,
          },
        });
        return;
      }

      printBanner(output, "Config");
      const table = createTable(["Field", "Value", "Source"]);
      table.push(
        ["RPC URL", resolvedConfig.rpcUrl.value, resolvedConfig.rpcUrl.source],
        ["Wallet", compactHome(resolvedConfig.walletPath.value), resolvedConfig.walletPath.source],
        ["Cluster", resolvedConfig.cluster.value, resolvedConfig.cluster.source],
        ["Program ID", resolvedConfig.programId.value, resolvedConfig.programId.source],
        [
          "Default Agent",
          resolvedConfig.defaultAgentId.value ?? "—",
          resolvedConfig.defaultAgentId.source,
        ],
      );
      console.log(table.toString());
    });

  config
    .command("set")
    .description("Set a single config value")
    .argument("<key>", "rpc-url | wallet-path | cluster | program-id | default-agent-id")
    .argument("<value>", "value to persist")
    .action(async function configSet(key: string, value: string) {
      const { globals } = resolveGlobalConfig(this);
      const output = {
        json: globals.json === true,
        quiet: globals.quiet === true,
      };

      const field = CONFIG_KEYS.get(key);
      if (!field) {
        throw new Error(`Unknown config key '${key}'.`);
      }

      const current = readConfigFile();
      const next: Partial<AuraCliConfig> = {
        ...current,
        [field]: field === "defaultAgentId" && value === "null" ? null : value,
      };
      const filePath = writeConfigFile(next);
      const resolved = flattenResolvedConfig(resolveConfig());

      if (output.json) {
        emitJson(output, { path: filePath, key: field, value: next[field], config: resolved });
        return;
      }

      printSuccess(output, `Updated ${field} in ${filePath}`);
    });
}
