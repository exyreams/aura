import { createRequire } from "node:module";

import { Command } from "commander";

import { registerConfidentialCommands } from "./commands/confidential.js";
import { registerConfigCommands } from "./commands/config.js";
import { registerDashboardCommand } from "./commands/dashboard.js";
import { registerDwalletCommands } from "./commands/dwallet.js";
import { registerExecutionCommands } from "./commands/execution.js";
import { registerFeatureCommands } from "./commands/features.js";
import { registerGeneratedCommands } from "./commands/generated.js";
import { registerGovernanceCommands } from "./commands/governance.js";
import { registerInstructionCommands } from "./commands/instruction.js";
import { registerPdaCommands } from "./commands/pda.js";
import { registerTreasuryCommands } from "./commands/treasury.js";
import { resolveGlobalConfig } from "./core/context.js";
import { renderError } from "./core/errors.js";
import { checkWalletFileHygiene } from "./core/security.js";
import { ACTIVE_DEVELOPMENT_WARNING, printWarn } from "./ui/output.js";
import { block, setColorEnabled } from "./ui/theme.js";

// Read the version from package.json at runtime so it can never drift from the
// published package. Resolves to the package root from both dist/ and src/.
const require = createRequire(import.meta.url);
const VERSION = (require("../package.json") as { version: string }).version;

export function createProgram(): Command {
  const program = new Command();

  program
    .name("aura")
    .description(
      "Production-grade CLI for the AURA autonomous treasury program on Solana",
    )
    .version(VERSION, "-v, --version", "print the CLI version")
    .showHelpAfterError()
    .showSuggestionAfterError()
    .option("--rpc-url <url>", "override the RPC endpoint")
    .option("--wallet <path>", "override the keypair file path")
    .option("--program-id <id>", "override the AURA program ID")
    .option("--cluster <name>", "cluster label for display")
    .option("--json", "output machine-readable JSON")
    .option("--quiet", "suppress non-error terminal output")
    .option("--dry-run", "build and preview the transaction without sending")
    .option("-y, --yes", "skip confirmation prompts (non-interactive)")
    .option("--no-simulate", "skip the preflight simulation before sending")
    .option("--no-color", "disable colored output")
    .option("--compute-units <n>", "override the compute-unit limit", (value) =>
      Number(value),
    )
    .addHelpText(
      "afterAll",
      () => `\n${block("WARNING", "warn")} ${ACTIVE_DEVELOPMENT_WARNING}`,
    );

  // Best-effort keypair hygiene warning before any command runs.
  program.hook("preAction", (thisCommand) => {
    const opts = thisCommand.opts() as Record<string, unknown>;
    if (opts.json === true || opts.quiet === true) {
      return;
    }
    try {
      const { config } = resolveGlobalConfig(thisCommand);
      const hygiene = checkWalletFileHygiene(config.walletPath);
      if (hygiene.warning) {
        printWarn({ json: false, quiet: false }, hygiene.warning);
      }
    } catch {
      // Never let a preflight warning block a command.
    }
  });

  registerConfigCommands(program);
  registerTreasuryCommands(program);
  registerDwalletCommands(program);
  registerConfidentialCommands(program);
  registerExecutionCommands(program);
  registerGovernanceCommands(program);
  registerFeatureCommands(program);
  registerPdaCommands(program);
  registerDashboardCommand(program);
  registerInstructionCommands(program);

  // Generated per-domain instruction commands provide complete coverage of
  // every program instruction. Registered last so they merge into the
  // ergonomic command groups above without clobbering their friendly verbs.
  registerGeneratedCommands(program);

  return program;
}

/** Disables color early (before help/preview render) for --no-color / --json / NO_COLOR. */
function configureColor(argv: string[]): void {
  if (
    argv.includes("--no-color") ||
    argv.includes("--json") ||
    process.env.NO_COLOR !== undefined
  ) {
    setColorEnabled(false);
  }
}

export async function main(argv = process.argv): Promise<void> {
  configureColor(argv);
  try {
    await createProgram().parseAsync(argv);
  } catch (error) {
    renderError(error);
    process.exitCode = 1;
  }
}
