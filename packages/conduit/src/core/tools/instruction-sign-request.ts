import { z } from "zod";

import type { ConduitDb } from "../control-plane/db.js";
import type { buildProgramInstruction } from "../instructions.js";
import { strictObject } from "../schemas.js";
import type { SolanaContext } from "../solana.js";
import type { Tool } from "../types.js";
import { queueOwnerInstructionSignRequest } from "./owner-sign-request.js";

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
  readonly safety: Awaited<
    ReturnType<typeof buildProgramInstruction>
  >["schema"]["safety"];
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
      return queueOwnerInstructionSignRequest(deps, ctx, {
        instruction: parsed.instruction,
        accounts: parsed.accounts,
        args: parsed.args,
        reason: parsed.reason ?? null,
        ttlSecs: parsed.ttlSecs,
      });
    },
  };
}
