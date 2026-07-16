import { randomBytes } from "node:crypto";
import { Transaction } from "@solana/web3.js";
import { z } from "zod";

import type { ConduitDb } from "../control-plane/db.js";
import { SignRequestsRepo } from "../control-plane/sign-requests.js";
import { ConduitError } from "../errors.js";
import { buildProgramInstruction } from "../instructions.js";
import { strictObject } from "../schemas.js";
import type { SolanaContext } from "../solana.js";
import type { Tool } from "../types.js";

const jsonRecord = z.record(z.string(), z.unknown());
const argsInput = z.union([jsonRecord, z.array(z.unknown())]);

const input = strictObject({
  instruction: z
    .string()
    .trim()
    .min(1)
    .describe("Instruction name in snake_case, camelCase, or kebab-case."),
  accounts: jsonRecord.default({}),
  args: argsInput.default({}),
  reason: z
    .string()
    .trim()
    .max(2048)
    .optional()
    .describe("Human-readable reason shown in the approval queue."),
  ttlSecs: z.number().int().min(30).max(3600).default(600),
});

export type InstructionSignRequestInput = z.infer<typeof input>;

export interface InstructionSignRequestOutput {
  readonly signRequestId: string;
  readonly instruction: string;
  readonly status: "queued_for_human";
  readonly expiresAt: number;
  readonly requiredSigners: readonly string[];
  readonly signerAccounts: readonly string[];
  readonly ownerSignatureRequired: boolean;
  readonly note: string;
}

export interface InstructionSignRequestDeps {
  readonly db: ConduitDb;
  readonly solana: SolanaContext;
}

export function createInstructionSignRequestTool(
  deps: InstructionSignRequestDeps,
): Tool<typeof input, InstructionSignRequestOutput> {
  return {
    name: "aura.instruction.request_signature",
    description:
      "Builds any AURA instruction and queues an unsigned transaction for human review and signature. It never signs or submits directly.",
    input,
    requiredScopes: ["propose"],
    isWrite: true,
    triggersInbox: true,
    declaredInstructions: [],
    proxiesOwnerSignature: true,
    async handler(parsed, ctx) {
      try {
        const build = await buildProgramInstruction(
          deps.solana.client,
          {
            instruction: parsed.instruction,
            accounts: parsed.accounts,
            args: parsed.args,
          },
          {
            programId: deps.solana.programId,
            defaultSigner: ctx.session.ownerPubkey,
          },
        );
        const { blockhash, lastValidBlockHeight } =
          await deps.solana.connection.getLatestBlockhash("confirmed");
        const tx = new Transaction({
          feePayer: ctx.session.ownerPubkey,
          blockhash,
          lastValidBlockHeight,
        }).add(build.instruction);
        const unsignedTxB64 = tx
          .serialize({ requireAllSignatures: false, verifySignatures: false })
          .toString("base64");

        const row = new SignRequestsRepo(deps.db).create({
          ownerPubkey: ctx.session.ownerPubkey.toBase58(),
          instructionName: build.schema.name,
          unsignedTxB64,
          decodedSummary: {
            action: "instruction_request_signature",
            instruction: build.schema.name,
            signerAccounts: build.signerAccounts,
            requiredSigners: build.requiredSigners,
            ownerSignatureRequired: build.ownerSignatureRequired,
            reason: parsed.reason ?? null,
            normalizedAccounts: build.normalizedAccounts,
            normalizedArgs: build.normalizedArgs,
            blockhash,
            lastValidBlockHeight,
            nonce: randomBytes(12).toString("hex"),
          },
          callerId: ctx.session.id,
          callerSessionId: ctx.session.id,
          ttlSecs: parsed.ttlSecs,
        });

        return {
          signRequestId: row.id,
          instruction: build.schema.name,
          status: "queued_for_human",
          expiresAt: row.expiresAt,
          requiredSigners: build.requiredSigners,
          signerAccounts: build.signerAccounts,
          ownerSignatureRequired: build.ownerSignatureRequired,
          note: "Queued for human review. The transaction was not signed or submitted by Conduit.",
        };
      } catch (error) {
        throw new ConduitError(
          "invalid_input",
          error instanceof Error ? error.message : String(error),
        );
      }
    },
  };
}
