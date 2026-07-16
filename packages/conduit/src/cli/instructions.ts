import { PublicKey, Transaction } from "@solana/web3.js";
import type { Command } from "commander";

import { SignRequestsRepo } from "../core/control-plane/sign-requests.js";
import {
  buildProgramInstruction,
  getProgramInstructionCatalog,
  getProgramInstructionSchema,
} from "../core/instructions.js";
import { createSolanaContext } from "../core/solana.js";
import { mergeJsonInput, parseJsonInput, parseKeyValuePairs } from "./json.js";
import { emitJson, fail, printRows } from "./output.js";

export interface InstructionCommandOptions {
  readonly defaults: {
    rpcUrl: string;
    cluster: string;
    programId?: string | null;
    dbPath: string;
  };
  readonly openDb: (
    path: string,
  ) => import("../core/control-plane/db.js").ConduitDb;
}

interface PrepareOptions {
  accounts?: string;
  args?: string;
  account?: string[];
  arg?: string[];
  owner?: string;
  rpcUrl: string;
  cluster: string;
  programId?: string;
  json?: boolean;
}

interface RequestSignatureOptions extends Omit<PrepareOptions, "owner"> {
  owner: string;
  dbPath: string;
  reason?: string;
  ttlSecs: number;
}

export function registerInstructionCommands(
  parent: Command,
  options: InstructionCommandOptions,
): void {
  const instructions = parent
    .command("instructions")
    .alias("ix")
    .description("Inspect and prepare AURA program instructions.");

  instructions
    .command("list")
    .description("List all current AURA IDL instructions by feature domain.")
    .option("--json", "print machine-readable output", false)
    .action((opts: { json?: boolean }) => {
      const catalog = getProgramInstructionCatalog();
      if (opts.json === true) {
        emitJson(catalog);
        return;
      }
      for (const domain of catalog.domains) {
        process.stdout.write(`\n${domain.label ?? domain.id}\n`);
        printRows(
          domain.instructions.map((entry) => [
            entry.name,
            entry.schema?.safety.signerClass ?? "unknown",
            entry.schema?.safety.riskLevel ?? "unknown",
            entry.schema?.safety.humanReview ?? "unknown",
            entry.description ?? "",
          ]),
          {
            header: ["instruction", "signer", "risk", "review", "description"],
          },
        );
      }
      process.stdout.write(
        `\n${catalog.totals.instructions} instructions across ${catalog.totals.domains} domains\n`,
      );
    });

  instructions
    .command("describe")
    .description("Describe one AURA program instruction.")
    .argument("<instruction>", "instruction name")
    .option("--json", "print machine-readable output", false)
    .action((instruction: string, opts: { json?: boolean }) => {
      try {
        const schema = getProgramInstructionSchema(instruction);
        if (opts.json === true) {
          emitJson(schema);
          return;
        }
        printInstructionSchema(schema);
      } catch (error) {
        fail(errorMessage(error), opts.json === true, 2);
      }
    });

  instructions
    .command("prepare")
    .description(
      "Validate accounts/args and print serialized instruction bytes without signing.",
    )
    .argument("<instruction>", "instruction name")
    .option("--accounts <json>", "accounts JSON or @file", "{}")
    .option("--args <json>", "args JSON or @file", "{}")
    .option("--account <key=value...>", "account override", collect, [])
    .option("--arg <key=value...>", "argument override", collect, [])
    .option("--owner <pubkey>", "default owner/signer for $owner placeholders")
    .option("--rpc-url <url>", "Solana RPC URL", options.defaults.rpcUrl)
    .option("--cluster <name>", "cluster label", options.defaults.cluster)
    .option(
      "--program-id <pubkey>",
      "AURA program id",
      options.defaults.programId ?? undefined,
    )
    .option("--json", "print machine-readable output", false)
    .action(async (instruction: string, opts: PrepareOptions) => {
      try {
        const result = await prepareInstruction(instruction, opts);
        const output = publicPreparedInstruction(result);
        if (opts.json === true) {
          emitJson(output);
          return;
        }
        process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
      } catch (error) {
        fail(errorMessage(error), opts.json === true, 2);
      }
    });

  instructions
    .command("request-signature")
    .description(
      "Queue an unsigned transaction for human review in the local sign-request table.",
    )
    .argument("<instruction>", "instruction name")
    .requiredOption(
      "--owner <pubkey>",
      "owner pubkey and transaction fee payer",
    )
    .option("--accounts <json>", "accounts JSON or @file", "{}")
    .option("--args <json>", "args JSON or @file", "{}")
    .option("--account <key=value...>", "account override", collect, [])
    .option("--arg <key=value...>", "argument override", collect, [])
    .option("--reason <text>", "human-readable review reason")
    .option("--db-path <path>", "SQLite DB path", options.defaults.dbPath)
    .option("--rpc-url <url>", "Solana RPC URL", options.defaults.rpcUrl)
    .option("--cluster <name>", "cluster label", options.defaults.cluster)
    .option(
      "--program-id <pubkey>",
      "AURA program id",
      options.defaults.programId ?? undefined,
    )
    .option(
      "--ttl-secs <n>",
      "sign request TTL",
      (value: string) => Number.parseInt(value, 10),
      600,
    )
    .option("--json", "print machine-readable output", false)
    .action(async (instruction: string, opts: RequestSignatureOptions) => {
      let db: ReturnType<InstructionCommandOptions["openDb"]> | undefined;
      try {
        const prepared = await prepareInstruction(instruction, opts);
        const owner = new PublicKey(opts.owner);
        const solana = createSolanaContext({
          rpcUrl: opts.rpcUrl,
          cluster: opts.cluster,
          ...(opts.programId !== undefined
            ? { programId: opts.programId }
            : {}),
        });
        const { blockhash, lastValidBlockHeight } =
          await solana.connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({
          feePayer: owner,
          blockhash,
          lastValidBlockHeight,
        }).add(prepared.rawInstruction);
        const unsignedTxB64 = tx
          .serialize({ requireAllSignatures: false, verifySignatures: false })
          .toString("base64");
        db = options.openDb(opts.dbPath);
        const row = new SignRequestsRepo(db).create({
          ownerPubkey: owner.toBase58(),
          instructionName: prepared.schema.name,
          unsignedTxB64,
          decodedSummary: {
            action: "instruction_request_signature",
            instruction: prepared.schema.name,
            reason: opts.reason ?? null,
            normalizedAccounts: prepared.normalizedAccounts,
            normalizedArgs: prepared.normalizedArgs,
            requiredSigners: prepared.requiredSigners,
            signerAccounts: prepared.signerAccounts,
            ownerSignatureRequired: prepared.ownerSignatureRequired,
            safety: prepared.schema.safety,
            blockhash,
            lastValidBlockHeight,
          },
          callerId: "conduit-cli",
          callerSessionId: null,
          ttlSecs: opts.ttlSecs,
        });
        const output = {
          signRequestId: row.id,
          instruction: prepared.schema.name,
          expiresAt: row.expiresAt,
          ownerPubkey: owner.toBase58(),
          requiredSigners: prepared.requiredSigners,
          signerAccounts: prepared.signerAccounts,
          ownerSignatureRequired: prepared.ownerSignatureRequired,
          safety: prepared.schema.safety,
        };
        if (opts.json === true) {
          emitJson(output);
          return;
        }
        process.stdout.write(
          `Queued sign request ${row.id} for ${prepared.schema.name}\n` +
            `expires: ${new Date(row.expiresAt).toISOString()}\n`,
        );
      } catch (error) {
        fail(errorMessage(error), opts.json === true, 2);
      } finally {
        db?.close();
      }
    });
}

function publicPreparedInstruction(
  prepared: Awaited<ReturnType<typeof prepareInstruction>>,
) {
  return {
    schema: prepared.schema,
    normalizedAccounts: prepared.normalizedAccounts,
    normalizedArgs: prepared.normalizedArgs,
    instruction: prepared.instruction,
    requiredSigners: prepared.requiredSigners,
    signerAccounts: prepared.signerAccounts,
    ownerSignatureRequired: prepared.ownerSignatureRequired,
    safety: prepared.schema.safety,
  };
}

async function prepareInstruction(instruction: string, opts: PrepareOptions) {
  const accounts = mergeJsonInput(
    parseJsonInput(opts.accounts, "accounts"),
    parseKeyValuePairs(opts.account),
  );
  const args = mergeJsonInput(
    parseJsonInput(opts.args, "args"),
    parseKeyValuePairs(opts.arg),
  );
  if (Array.isArray(accounts)) {
    throw new Error("accounts must be a JSON object.");
  }
  const solana = createSolanaContext({
    rpcUrl: opts.rpcUrl,
    cluster: opts.cluster,
    ...(opts.programId !== undefined ? { programId: opts.programId } : {}),
  });
  const build = await buildProgramInstruction(
    solana.client,
    { instruction, accounts, args },
    {
      programId: solana.programId,
      ...(opts.owner !== undefined
        ? { defaultSigner: new PublicKey(opts.owner) }
        : {}),
    },
  );
  return {
    schema: build.schema,
    normalizedAccounts: build.normalizedAccounts,
    normalizedArgs: build.normalizedArgs,
    instruction: build.serializedInstruction,
    rawInstruction: build.instruction,
    requiredSigners: build.requiredSigners,
    signerAccounts: build.signerAccounts,
    ownerSignatureRequired: build.ownerSignatureRequired,
  };
}

function printInstructionSchema(
  schema: ReturnType<typeof getProgramInstructionSchema>,
): void {
  process.stdout.write(`${schema.name}\n`);
  process.stdout.write(`owner signature: ${schema.ownerSignatureRequired}\n`);
  process.stdout.write(
    `signer accounts: ${schema.signerAccounts.join(", ") || "-"}\n`,
  );
  process.stdout.write(`signer class: ${schema.safety.signerClass}\n`);
  process.stdout.write(`risk: ${schema.safety.riskLevel}\n`);
  process.stdout.write(`human review: ${schema.safety.humanReview}\n`);
  process.stdout.write(`agent policy: ${schema.safety.agentPolicy}\n`);
  process.stdout.write(
    `safety reasons: ${schema.safety.reasons.join("; ") || "-"}\n`,
  );
  process.stdout.write("\naccounts\n");
  printRows(
    schema.accounts.map((account) => [
      account.name,
      account.signer ? "signer" : "-",
      account.writable ? "writable" : "-",
      account.optional ? "optional" : "required",
    ]),
    { header: ["name", "signer", "writable", "required"] },
  );
  process.stdout.write("\nargs\n");
  printRows(
    schema.args.map((arg) => [
      arg.name,
      arg.typeLabel,
      JSON.stringify(arg.sample),
    ]),
    { header: ["name", "type", "sample"] },
  );
}

function collect(value: string, previous: string[]): string[] {
  previous.push(value);
  return previous;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
