/**
 * Typed, read-only access to the generated Anchor IDL.
 *
 * Tests use this as the source of truth for what the program actually exposes:
 * the instruction set, account set, event set, type defs, and error table.
 * Cross-checking the SDK against the IDL (and the IDL against an independent
 * discriminator oracle) is how we pin the SDK to the deployed program.
 */

import { AURA_IDL } from "../../src/constants.js";

/** An IDL type node (string primitive, option/vec/array wrapper, or defined ref). */
export type IdlTypeNode =
  | string
  | { option: IdlTypeNode }
  | { coption: IdlTypeNode }
  | { vec: IdlTypeNode }
  | { array: [IdlTypeNode, number] }
  | { defined: string | { name: string } };

export interface IdlInstructionAccount {
  name: string;
  signer?: boolean;
  writable?: boolean;
  optional?: boolean;
  pda?: unknown;
  address?: string;
}

export interface IdlField {
  name: string;
  type: IdlTypeNode;
}

export interface IdlInstruction {
  name: string;
  discriminator: number[];
  accounts: IdlInstructionAccount[];
  args: IdlField[];
}

export interface IdlAccount {
  name: string;
  discriminator: number[];
}

export interface IdlEvent {
  name: string;
  discriminator: number[];
}

export interface IdlError {
  code: number;
  name: string;
  msg?: string;
}

export interface IdlTypeDef {
  name: string;
  type:
    | { kind: "struct"; fields?: IdlField[] }
    | { kind: "enum"; variants: { name: string }[] }
    | { kind: "type"; alias: IdlTypeNode };
}

interface LooseIdl {
  address: string;
  instructions: IdlInstruction[];
  accounts: IdlAccount[];
  events?: IdlEvent[];
  errors?: IdlError[];
  types: IdlTypeDef[];
}

const idl = AURA_IDL as unknown as LooseIdl;

/** The program address declared in the IDL. */
export const idlAddress: string = idl.address;

/** Every instruction in declaration order. */
export const idlInstructions: readonly IdlInstruction[] = idl.instructions;

/** Every account type. */
export const idlAccounts: readonly IdlAccount[] = idl.accounts;

/** Every event type (may be empty). */
export const idlEvents: readonly IdlEvent[] = idl.events ?? [];

/** Every error entry (may be empty). */
export const idlErrors: readonly IdlError[] = idl.errors ?? [];

/** Every named type definition. */
export const idlTypes: readonly IdlTypeDef[] = idl.types;

const instructionByName = new Map(idl.instructions.map((ix) => [ix.name, ix]));
const typeByName = new Map(idl.types.map((t) => [t.name, t]));

/** Look up an instruction by its snake_case name. */
export function findInstruction(name: string): IdlInstruction | undefined {
  return instructionByName.get(name);
}

/** Look up a named type definition. */
export function findType(name: string): IdlTypeDef | undefined {
  return typeByName.get(name);
}

/** Every instruction name (snake_case), sorted for stable iteration. */
export function instructionNames(): string[] {
  return idl.instructions.map((ix) => ix.name).sort();
}

/** Converts a snake_case IDL identifier to camelCase (matches SDK accessors). */
export function camel(name: string): string {
  return name.includes("_")
    ? name.replace(/_([a-z0-9])/g, (_m, c: string) => c.toUpperCase())
    : name;
}
