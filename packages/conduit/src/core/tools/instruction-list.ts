import type { z } from "zod";

import { getProgramInstructionCatalog } from "../instructions.js";
import { strictObject } from "../schemas.js";
import type { Tool } from "../types.js";

const input = strictObject({});

export type InstructionListInput = z.infer<typeof input>;

export const instructionListTool: Tool<
  typeof input,
  ReturnType<typeof getProgramInstructionCatalog>
> = {
  name: "aura.instructions.list",
  description:
    "Lists every current AURA program instruction grouped by feature domain, including account, argument, signer, and safety schemas.",
  input,
  requiredScopes: ["read"],
  isWrite: false,
  triggersInbox: false,
  declaredInstructions: [],
  async handler() {
    return getProgramInstructionCatalog();
  },
};
