import { z } from "zod";

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
});

export type InstructionPrepareInput = z.infer<typeof input>;

export interface InstructionPrepareOutput {
  readonly schema: Awaited<
    ReturnType<typeof buildProgramInstruction>
  >["schema"];
  readonly normalizedAccounts: Record<string, unknown>;
  readonly normalizedArgs: unknown[];
  readonly instruction: Awaited<
    ReturnType<typeof buildProgramInstruction>
  >["serializedInstruction"];
  readonly requiredSigners: readonly string[];
  readonly signerAccounts: readonly string[];
  readonly ownerSignatureRequired: boolean;
  readonly note: string;
}

export function createInstructionPrepareTool(
  solana: SolanaContext,
): Tool<typeof input, InstructionPrepareOutput> {
  return {
    name: "aura.instruction.prepare",
    description:
      "Validates accounts and args for any AURA instruction and returns serialized instruction bytes without signing or submitting.",
    input,
    requiredScopes: ["read"],
    isWrite: false,
    triggersInbox: false,
    declaredInstructions: [],
    async handler(parsed, ctx) {
      try {
        const build = await buildProgramInstruction(
          solana.client,
          {
            instruction: parsed.instruction,
            accounts: parsed.accounts,
            args: parsed.args,
          },
          {
            programId: solana.programId,
            defaultSigner: ctx.session.ownerPubkey,
          },
        );
        return {
          schema: build.schema,
          normalizedAccounts: build.normalizedAccounts,
          normalizedArgs: build.normalizedArgs,
          instruction: build.serializedInstruction,
          requiredSigners: build.requiredSigners,
          signerAccounts: build.signerAccounts,
          ownerSignatureRequired: build.ownerSignatureRequired,
          note: "Prepared only. Use aura.instruction.request_signature to queue a human-reviewed transaction.",
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
