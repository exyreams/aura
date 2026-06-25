/**
 * Shared plumbing for IDL-driven instruction commands.
 *
 * Both the raw `aura ix` surface and the generated per-domain subcommands
 * (`aura <domain> <instruction>`) funnel through here: identical flags, schema
 * help, account/arg parsing, signer resolution, and the secure send pipeline.
 */

import type { Command } from "commander";

import { buildCliContext, type CliContext } from "../core/context.js";
import { CliError } from "../core/errors.js";
import { runInstructions } from "../core/runner.js";
import { loadKeypair } from "../core/wallet.js";
import {
  buildProgramInstruction,
  getProgramInstructionSchema,
  mergeJsonInput,
  type ProgramInstructionSchema,
  parseJsonInput,
  parseKeyValuePairs,
} from "../lib/instructions.js";
import {
  createTable,
  emitJson,
  printBanner,
  printInfo,
  printTable,
} from "../ui/output.js";
import { block, style } from "../ui/theme.js";

const collect = (value: string, previous: string[] = []): string[] => [
  ...previous,
  value,
];

/** Adds the standard build/send flags shared by every instruction command. */
export function addBuildOptions(cmd: Command): Command {
  return cmd
    .option(
      "--accounts <json|@file>",
      "accounts as a JSON object or @path/to/accounts.json",
    )
    .option(
      "--args <json|@file>",
      "args as a JSON object/array or @path/to/args.json",
    )
    .option(
      "--account <key=value>",
      "set or override one account (repeatable)",
      collect,
      [],
    )
    .option(
      "--arg <key=value>",
      "set or override one argument (repeatable)",
      collect,
      [],
    )
    .option(
      "--extra-signer <path>",
      "additional signer keypair file (repeatable)",
      collect,
      [],
    )
    .option("--schema", "print the account/argument schema and exit");
}

export interface ParsedBuildOptions {
  accounts: Record<string, unknown>;
  args: Record<string, unknown> | unknown[];
}

/** Merges --accounts/--args JSON with repeatable --account/--arg key=value overrides. */
export function parseBuildOptions(
  options: Record<string, unknown>,
): ParsedBuildOptions {
  const accountInput = parseJsonInput(
    typeof options.accounts === "string" ? options.accounts : undefined,
    "accounts",
  );
  const argInput = parseJsonInput(
    typeof options.args === "string" ? options.args : undefined,
    "args",
  );
  const accountOverrides = parseKeyValuePairs(
    Array.isArray(options.account) ? (options.account as string[]) : undefined,
  );
  const argOverrides = parseKeyValuePairs(
    Array.isArray(options.arg) ? (options.arg as string[]) : undefined,
  );
  if (Array.isArray(accountInput)) {
    throw new CliError("--accounts must be a JSON object, not an array.", {
      code: "INVALID_INPUT",
      tip: 'Provide accounts as {"treasury": "<pubkey>", "owner": "$wallet"}.',
    });
  }
  return {
    accounts: mergeJsonInput(accountInput, accountOverrides) as Record<
      string,
      unknown
    >,
    args: mergeJsonInput(argInput, argOverrides),
  };
}

/** Renders an instruction's account/argument schema as themed tables. */
export function printInstructionSchema(
  ctx: CliContext,
  schema: ProgramInstructionSchema,
): void {
  if (ctx.output.json) {
    emitJson(ctx.output, schema);
    return;
  }

  printBanner(ctx.output, schema.name, "instruction schema");

  const accounts = createTable([
    "Account",
    "Signer",
    "Writable",
    "Optional",
    "Default",
  ]);
  for (const account of schema.accounts) {
    accounts.push([
      account.name,
      account.signer ? style.warn("yes") : "no",
      account.writable ? "yes" : "no",
      account.optional ? "yes" : "no",
      account.address ?? "",
    ]);
  }
  printTable(ctx.output, accounts);

  if (schema.args.length > 0) {
    const args = createTable(["Arg", "Type", "Sample"]);
    for (const arg of schema.args) {
      args.push([arg.name, arg.typeLabel, JSON.stringify(arg.sample)]);
    }
    printTable(ctx.output, args);
  }

  printInfo(
    ctx.output,
    `\n${style.muted("usage")}  ${style.code(
      `aura ix send ${schema.name} --account treasury=<pubkey> --arg <name>=<value>`,
    )}`,
  );
  printInfo(
    ctx.output,
    `${style.muted("hint")}   ${style.dim(
      'signer accounts accept "$wallet"; bytes accept hex or number arrays',
    )}`,
  );
}

/** Resolves repeatable `--extra-signer` paths into Keypairs. */
function loadExtraSigners(options: Record<string, unknown>) {
  const paths = Array.isArray(options.extraSigner)
    ? (options.extraSigner as string[])
    : [];
  return paths.map((path) => loadKeypair(path));
}

/**
 * Builds an instruction from CLI flags and runs it through the secure pipeline.
 * Handles `--schema` (no wallet needed) before anything else.
 */
export async function execInstruction(
  command: Command,
  instructionName: string,
): Promise<void> {
  const options = command.opts() as Record<string, unknown>;
  const schema = getProgramInstructionSchema(instructionName);

  if (options.schema === true) {
    const ctx = buildCliContext(command, { needsWallet: false });
    printInstructionSchema(ctx, schema);
    return;
  }

  const ctx = buildCliContext(command);
  const wallet = ctx.wallet;
  if (!wallet) {
    throw new CliError(`A wallet is required to send ${schema.name}.`, {
      code: "WALLET_REQUIRED",
      tip: "Configure a wallet with `aura config init` or pass --wallet <path>.",
    });
  }

  const parsed = parseBuildOptions(options);
  const extraSigners = loadExtraSigners(options);

  let build: Awaited<ReturnType<typeof buildProgramInstruction>>;
  try {
    build = await buildProgramInstruction(
      ctx.client,
      {
        instruction: instructionName,
        accounts: parsed.accounts,
        args: parsed.args,
      },
      { programId: ctx.programId, defaultSigner: wallet.publicKey },
    );
  } catch (error) {
    throw new CliError(error instanceof Error ? error.message : String(error), {
      code: "BUILD_FAILED",
      tip: `Run \`aura ix schema ${schema.name}\` to see required accounts and args.`,
      cause: error,
    });
  }

  const signerSet = new Set([
    wallet.publicKey.toBase58(),
    ...extraSigners.map((signer) => signer.publicKey.toBase58()),
  ]);
  const missing = build.requiredSigners.filter(
    (signer) => !signerSet.has(signer),
  );
  if (missing.length > 0) {
    throw new CliError(`Missing required signer(s): ${missing.join(", ")}.`, {
      code: "MISSING_SIGNER",
      tip: "Pass --extra-signer <keypair.json> for each additional signer.",
    });
  }

  await runInstructions(ctx, [build.instruction], {
    action: schema.name,
    instructionName: schema.name,
    extraSigners,
    summary: [
      ["accounts", style.dim(`${build.instruction.keys.length}`)],
      ["args", style.dim(`${schema.args.length}`)],
    ],
    result: { accounts: build.normalizedAccounts, args: build.normalizedArgs },
  });
}

/** Help text appended to a generated subcommand: its accounts and args. */
export function instructionHelpText(instructionName: string): string {
  const schema = getProgramInstructionSchema(instructionName);
  const accounts = schema.accounts
    .map((a) => {
      const tags = [a.signer ? "signer" : null, a.optional ? "optional" : null]
        .filter(Boolean)
        .join(",");
      return `    ${a.name}${tags ? style.dim(` (${tags})`) : ""}`;
    })
    .join("\n");
  const args = schema.args.length
    ? schema.args
        .map((a) => `    ${a.name}: ${style.dim(a.typeLabel)}`)
        .join("\n")
    : `    ${style.dim("(none)")}`;
  return [
    "",
    `${block("Accounts", "muted")}`,
    accounts,
    "",
    `${block("Arguments", "muted")}`,
    args,
  ].join("\n");
}
