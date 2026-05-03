import { readFileSync } from "node:fs";

import {
  ComputeBudgetProgram,
  Keypair,
  PublicKey,
  Transaction,
  type Signer,
} from "@solana/web3.js";
import { type Command } from "commander";

import { buildCliContext } from "../context.js";
import { expandHome } from "../config.js";
import { createTable, emitJson, printBanner, printSuccess, printTable } from "../output.js";
import {
  buildProgramInstruction,
  getProgramInstructionCatalog,
  getProgramInstructionSchema,
  mergeJsonInput,
  parseJsonInput,
  parseKeyValuePairs,
  serializeInstructionBuild,
} from "../program-instructions.js";

function loadExtraSigner(path: string): Keypair {
  const resolved = expandHome(path);
  const secret = new Uint8Array(JSON.parse(readFileSync(resolved, "utf8")) as number[]);
  return Keypair.fromSecretKey(secret);
}

async function sendInstructionWithWallet(options: {
  command: Command;
  instructionName: string;
  accounts: Record<string, unknown>;
  args: Record<string, unknown> | unknown[];
  extraSignerPaths?: string[];
  computeUnitLimit?: number;
}) {
  const ctx = buildCliContext(options.command);
  if (!ctx.wallet) {
    throw new Error("A wallet is required to send an instruction.");
  }
  const extraSigners = (options.extraSignerPaths ?? []).map(loadExtraSigner);
  const build = await buildProgramInstruction(
    ctx.client,
    {
      instruction: options.instructionName,
      accounts: options.accounts,
      args: options.args,
    },
    { programId: ctx.programId, defaultSigner: ctx.wallet.publicKey },
  );
  const signerSet = new Set([
    ctx.wallet.publicKey.toBase58(),
    ...extraSigners.map((signer) => signer.publicKey.toBase58()),
  ]);
  const missingSigners = build.requiredSigners.filter((signer) => !signerSet.has(signer));
  if (missingSigners.length > 0) {
    throw new Error(
      `Missing signer(s): ${missingSigners.join(", ")}. Pass --extra-signer for additional keypairs.`,
    );
  }

  const tx = new Transaction();
  tx.add(
    ComputeBudgetProgram.setComputeUnitLimit({
      units: options.computeUnitLimit ?? 600_000,
    }),
    build.instruction,
  );
  tx.feePayer = ctx.wallet.publicKey;
  const latest = await ctx.connection.getLatestBlockhash("confirmed");
  tx.recentBlockhash = latest.blockhash;
  tx.sign(ctx.wallet, ...(extraSigners as Signer[]));
  const signature = await ctx.connection.sendRawTransaction(tx.serialize(), {
    preflightCommitment: "confirmed",
  });
  await ctx.connection.confirmTransaction(
    {
      signature,
      blockhash: latest.blockhash,
      lastValidBlockHeight: latest.lastValidBlockHeight,
    },
    "confirmed",
  );

  return { build, signature };
}

function parseBuildOptions(options: Record<string, unknown>) {
  const accountInput = parseJsonInput(
    typeof options["accounts"] === "string" ? options["accounts"] : undefined,
    "accounts",
  );
  const argInput = parseJsonInput(
    typeof options["args"] === "string" ? options["args"] : undefined,
    "args",
  );
  const accountOverrides = parseKeyValuePairs(
    Array.isArray(options["account"]) ? (options["account"] as string[]) : undefined,
  );
  const argOverrides = parseKeyValuePairs(
    Array.isArray(options["arg"]) ? (options["arg"] as string[]) : undefined,
  );
  if (Array.isArray(accountInput)) {
    throw new Error("accounts must be a JSON object.");
  }
  return {
    accounts: mergeJsonInput(accountInput, accountOverrides) as Record<string, unknown>,
    args: mergeJsonInput(argInput, argOverrides),
  };
}

export function registerInstructionCommands(program: Command): void {
  const instruction = program
    .command("instruction")
    .alias("instructions")
    .description("Build and send any current aura-core instruction from the IDL");

  instruction
    .command("list")
    .description("List every instruction grouped by domain")
    .action(function instructionList() {
      const ctx = buildCliContext(this, { needsWallet: false });
      const catalog = getProgramInstructionCatalog();
      if (ctx.output.json) {
        emitJson(ctx.output, catalog);
        return;
      }
      printBanner(ctx.output, "Instruction Surface");
      const table = createTable(["Domain", "Instructions"]);
      for (const domain of catalog.domains) {
        table.push([
          domain.label,
          domain.instructions.map((entry) => entry.name).join("\n"),
        ]);
      }
      printTable(ctx.output, table);
    });

  instruction
    .command("schema")
    .description("Show account and argument schema for one instruction")
    .argument("<name>", "instruction name, e.g. configure_budget_envelope")
    .action(function instructionSchema(name: string) {
      const ctx = buildCliContext(this, { needsWallet: false });
      const schema = getProgramInstructionSchema(name);
      if (ctx.output.json) {
        emitJson(ctx.output, schema);
        return;
      }
      printBanner(ctx.output, schema.name);
      const accounts = createTable(["Account", "Signer", "Writable", "Optional", "Default"]);
      for (const account of schema.accounts) {
        accounts.push([
          account.name,
          account.signer ? "yes" : "no",
          account.writable ? "yes" : "no",
          account.optional ? "yes" : "no",
          account.address ?? "",
        ]);
      }
      const args = createTable(["Arg", "Type", "Sample"]);
      for (const arg of schema.args) {
        args.push([arg.name, arg.typeLabel, JSON.stringify(arg.sample)]);
      }
      console.log(accounts.toString());
      if (schema.args.length > 0) {
        console.log("");
        console.log(args.toString());
      }
    });

  instruction
    .command("build")
    .description("Build any aura-core instruction and print serialized instruction data")
    .argument("<name>", "instruction name")
    .option("--accounts <json|@file>", "accounts object")
    .option("--args <json|@file>", "args object or ordered array")
    .option("--account <key=value>", "account override, repeatable", (value, previous: string[] = []) => [
      ...previous,
      value,
    ])
    .option("--arg <key=value>", "argument override, repeatable", (value, previous: string[] = []) => [
      ...previous,
      value,
    ])
    .action(async function instructionBuild(name: string) {
      const ctx = buildCliContext(this, { needsWallet: false });
      const options = this.opts() as Record<string, unknown>;
      const parsed = parseBuildOptions(options);
      const build = await buildProgramInstruction(
        ctx.client,
        {
          instruction: name,
          accounts: parsed.accounts,
          args: parsed.args,
        },
        { programId: ctx.programId },
      );
      emitJson(ctx.output, serializeInstructionBuild(build));
    });

  instruction
    .command("send")
    .description("Build and send any aura-core instruction using the configured wallet")
    .argument("<name>", "instruction name")
    .option("--accounts <json|@file>", "accounts object")
    .option("--args <json|@file>", "args object or ordered array")
    .option("--account <key=value>", "account override, repeatable", (value, previous: string[] = []) => [
      ...previous,
      value,
    ])
    .option("--arg <key=value>", "argument override, repeatable", (value, previous: string[] = []) => [
      ...previous,
      value,
    ])
    .option("--extra-signer <path>", "additional keypair path, repeatable", (value, previous: string[] = []) => [
      ...previous,
      value,
    ])
    .option("--compute-units <units>", "compute unit limit", Number)
    .action(async function instructionSend(name: string) {
      const options = this.opts() as Record<string, unknown>;
      const parsed = parseBuildOptions(options);
      const result = await sendInstructionWithWallet({
        command: this,
        instructionName: name,
        accounts: parsed.accounts,
        args: parsed.args,
        extraSignerPaths: Array.isArray(options["extraSigner"])
          ? (options["extraSigner"] as string[])
          : undefined,
        computeUnitLimit:
          typeof options["computeUnits"] === "number"
            ? options["computeUnits"]
            : undefined,
      });
      const ctx = buildCliContext(this);
      if (ctx.output.json) {
        emitJson(ctx.output, {
          signature: result.signature,
          ...serializeInstructionBuild(result.build),
        });
        return;
      }
      printSuccess(ctx.output, `Instruction sent: ${result.signature}`);
    });
}
