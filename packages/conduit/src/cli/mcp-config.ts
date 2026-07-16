import path from "node:path";
import { fileURLToPath } from "node:url";
import type { Command } from "commander";

import { emitJson } from "./output.js";

export interface McpConfigCommandOptions {
  readonly defaultAccount?: string;
}

export function registerMcpConfigCommand(
  mcp: Command,
  options: McpConfigCommandOptions = {},
): void {
  mcp
    .command("config")
    .description("Print an MCP client config snippet for this Conduit package.")
    .option("--server-name <name>", "MCP server name", "aura")
    .option(
      "--account <name>",
      "keychain account to pass to conduit mcp",
      options.defaultAccount,
    )
    .option("--token-env <name>", "token env var name", "AURA_CONDUIT_TOKEN")
    .option("--command <path>", "node executable", process.execPath)
    .option("--json", "print raw JSON only", false)
    .action(
      (
        opts: {
          serverName: string;
          account?: string;
          tokenEnv: string;
          command: string;
          json?: boolean;
        },
        command,
      ) => {
        const globals = command.optsWithGlobals() as {
          account?: string;
        };
        const account = opts.account ?? globals.account;
        const args = [binPath(), "mcp"];
        if (account !== undefined) {
          args.push("--account", account);
        }
        const config = {
          mcpServers: {
            [opts.serverName]: {
              command: opts.command,
              args,
              env:
                account === undefined
                  ? { AURA_CONDUIT_TOKEN: `\${${opts.tokenEnv}}` }
                  : undefined,
            },
          },
        };
        if (opts.json === true) {
          emitJson(config);
          return;
        }
        process.stdout.write(`${JSON.stringify(config, null, 2)}\n`);
      },
    );
}

function binPath(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "../../bin/conduit.js");
}
