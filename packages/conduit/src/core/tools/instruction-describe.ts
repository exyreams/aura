import { z } from "zod";

import { ConduitError } from "../errors.js";
import { getProgramInstructionSchema } from "../instructions.js";
import { strictObject } from "../schemas.js";
import type { Tool } from "../types.js";

const input = strictObject({
  instruction: z
    .string()
    .trim()
    .min(1)
    .describe("Instruction name in snake_case, camelCase, or kebab-case."),
});

export type InstructionDescribeInput = z.infer<typeof input>;

export const instructionDescribeTool: Tool<
  typeof input,
  ReturnType<typeof getProgramInstructionSchema>
> = {
  name: "aura.instruction.describe",
  description:
    "Returns the account, argument, signer, and sample-input schema for one AURA program instruction.",
  input,
  requiredScopes: ["read"],
  isWrite: false,
  triggersInbox: false,
  declaredInstructions: [],
  async handler(parsed) {
    try {
      return getProgramInstructionSchema(parsed.instruction);
    } catch (error) {
      throw new ConduitError(
        "invalid_input",
        error instanceof Error ? error.message : String(error),
      );
    }
  },
};
