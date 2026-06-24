import {
  AURA_INSTRUCTION_DEFINITIONS,
  type AuraInstructionDefinition,
  getAuraInstructionDefinition,
} from "../generated/instructions.generated.js";

export type { AuraInstructionDefinition };
export { AURA_INSTRUCTION_DEFINITIONS, getAuraInstructionDefinition };

export type InstructionAccountRequirement =
  AuraInstructionDefinition["accounts"][number];
export type InstructionArgRequirement =
  AuraInstructionDefinition["args"][number];

export function listInstructionDefinitions(): readonly AuraInstructionDefinition[] {
  return AURA_INSTRUCTION_DEFINITIONS;
}

export function requireInstructionDefinition(
  name: string,
): AuraInstructionDefinition {
  const definition = getAuraInstructionDefinition(name);
  if (!definition) {
    throw new Error(`Unknown AURA instruction: ${name}`);
  }
  return definition;
}

export function listInstructionAccounts(
  name: string,
): readonly InstructionAccountRequirement[] {
  return requireInstructionDefinition(name).accounts;
}

export function listInstructionArgs(
  name: string,
): readonly InstructionArgRequirement[] {
  return requireInstructionDefinition(name).args;
}

export function listRequiredInstructionAccounts(
  name: string,
): readonly InstructionAccountRequirement[] {
  return listInstructionAccounts(name).filter((account) => !account.optional);
}

export function listOptionalInstructionAccounts(
  name: string,
): readonly InstructionAccountRequirement[] {
  return listInstructionAccounts(name).filter((account) => account.optional);
}
