import { Command } from "commander";

import { registerConfidentialCommands } from "./commands/confidential.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerDashboardCommand } from "./commands/dashboard.js";
import { registerDwalletCommands } from "./commands/dwallet.js";
import { registerExecutionCommands } from "./commands/execution.js";
import { registerGovernanceCommands } from "./commands/governance.js";
import { registerTreasuryCommands } from "./commands/treasury.js";
import { printError } from "./output.js";

export function createProgram(): Command {
  const program = new Command();

  program
    .name("aura")
    .description("Production-grade CLI for the AURA autonomous treasury program")
    .version("0.1.0")
    .showHelpAfterError()
    .showSuggestionAfterError()
    .option("--rpc-url <url>", "override RPC endpoint")
    .option("--wallet <path>", "override keypair file path")
    .option("--program-id <id>", "override AURA program ID")
    .option("--cluster <name>", "cluster label for display")
    .option("--json", "output machine-readable JSON")
    .option("--quiet", "suppress non-error terminal output")
    .option("--dry-run", "build and display the instruction without sending");

  registerConfigCommands(program);
  registerTreasuryCommands(program);
  registerDwalletCommands(program);
  registerConfidentialCommands(program);
  registerExecutionCommands(program);
  registerGovernanceCommands(program);
  registerDashboardCommand(program);

  return program;
}

export async function main(argv = process.argv): Promise<void> {
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    printError(error);
    process.exitCode = 1;
  }
}
