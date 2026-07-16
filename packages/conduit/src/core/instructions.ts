import {
  AURA_FEATURE_DOMAINS,
  AURA_IDL,
  type AuraClient,
  type AuraFeatureDomain,
  type AuraInstructionFeature,
} from "@aura-protocol/sdk-ts";
import {
  PublicKey,
  SystemProgram,
  type TransactionInstruction,
} from "@solana/web3.js";
import BN from "bn.js";
import {
  classifyInstructionSafety,
  type InstructionSafetyProfile,
} from "./instruction-safety.js";

type IdlType = unknown;
type JsonRecord = Record<string, unknown>;
type IdlInstructionArg = { name: string; type: IdlType };
type IdlAccount = {
  name: string;
  signer?: boolean;
  writable?: boolean;
  optional?: boolean;
  address?: string;
};
type IdlInstruction = {
  name: string;
  args: IdlInstructionArg[];
  accounts: IdlAccount[];
};
type IdlDefinedType = {
  name: string;
  type: {
    kind: string;
    fields?: Array<{ name: string; type: IdlType }>;
  };
};

export interface ProgramInstructionInput {
  instruction: string;
  accounts: JsonRecord;
  args: JsonRecord | unknown[];
}

export interface InstructionAccountSchema {
  name: string;
  camelName: string;
  signer: boolean;
  writable: boolean;
  optional: boolean;
  address?: string;
}

export interface InstructionArgSchema {
  name: string;
  camelName: string;
  type: unknown;
  typeLabel: string;
  sample: unknown;
}

export interface ProgramInstructionSchema {
  name: string;
  camelName: string;
  accounts: InstructionAccountSchema[];
  args: InstructionArgSchema[];
  signerAccounts: string[];
  ownerSignatureRequired: boolean;
  safety: InstructionSafetyProfile;
}

export interface SerializedInstruction {
  programId: string;
  keys: Array<{
    pubkey: string;
    isSigner: boolean;
    isWritable: boolean;
  }>;
  dataBase64: string;
}

export interface ProgramInstructionBuild {
  schema: ProgramInstructionSchema;
  normalizedAccounts: JsonRecord;
  normalizedArgs: unknown[];
  instruction: TransactionInstruction;
  serializedInstruction: SerializedInstruction;
  requiredSigners: string[];
  signerAccounts: string[];
  ownerSignatureRequired: boolean;
}

const integerTypes = new Set([
  "u8",
  "i8",
  "u16",
  "i16",
  "u32",
  "i32",
  "u64",
  "i64",
  "u128",
  "i128",
]);

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function toCamelCase(value: string): string {
  return value.replace(/_([a-z])/g, (_, letter: string) =>
    letter.toUpperCase(),
  );
}

function toSnakeCase(value: string): string {
  return value.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

function normalizeInstructionName(value: string): string {
  return toSnakeCase(value.trim()).replace(/-+/g, "_");
}

function getInstruction(name: string): IdlInstruction {
  const normalized = normalizeInstructionName(name);
  const instruction = AURA_IDL.instructions.find(
    (entry) => entry.name === normalized,
  );
  if (!instruction) {
    throw new Error(`Unknown instruction '${name}'.`);
  }
  return instruction as unknown as IdlInstruction;
}

function getDefinedType(name: string): IdlDefinedType {
  const found = AURA_IDL.types.find((entry) => entry.name === name);
  if (!found) {
    throw new Error(`IDL type '${name}' was not found.`);
  }
  return found as unknown as IdlDefinedType;
}

function readField(input: JsonRecord, name: string): unknown {
  const camelName = toCamelCase(name);
  if (Object.hasOwn(input, camelName)) {
    return input[camelName];
  }
  if (Object.hasOwn(input, name)) {
    return input[name];
  }
  return undefined;
}

function decodeByteArray(value: unknown, label: string): number[] {
  if (Array.isArray(value)) {
    return value.map((entry, index) => {
      const parsed = Number(entry);
      if (!Number.isInteger(parsed) || parsed < 0 || parsed > 255) {
        throw new Error(`${label}[${index}] must be a byte.`);
      }
      return parsed;
    });
  }
  if (typeof value === "string") {
    const normalized = value.startsWith("0x") ? value.slice(2) : value;
    if (!/^[0-9a-fA-F]*$/.test(normalized) || normalized.length % 2 !== 0) {
      throw new Error(`${label} must be a byte array or hex string.`);
    }
    return Array.from(Buffer.from(normalized, "hex"));
  }
  throw new Error(`${label} must be a byte array.`);
}

function parseInteger(
  value: unknown,
  label: string,
  wide: boolean,
): number | BN {
  if (value === undefined || value === null || value === "") {
    throw new Error(`${label} is required.`);
  }
  const raw = typeof value === "bigint" ? value.toString() : value;
  if (wide) {
    try {
      return new BN(String(raw));
    } catch {
      throw new Error(`${label} must be an integer.`);
    }
  }
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) {
    throw new Error(`${label} must be an integer.`);
  }
  return parsed;
}

function parseIdlValue(
  type: IdlType,
  value: unknown,
  label: string,
  defaultSigner?: PublicKey,
): unknown {
  if (typeof type === "string") {
    if (type === "pubkey") {
      if (typeof value !== "string") {
        throw new Error(`${label} must be a public key string.`);
      }
      if (
        (value === "$signer" || value === "$wallet" || value === "$owner") &&
        defaultSigner
      ) {
        return defaultSigner;
      }
      return new PublicKey(value);
    }
    if (type === "string") {
      if (typeof value !== "string") {
        throw new Error(`${label} must be a string.`);
      }
      return value;
    }
    if (type === "bool") {
      if (typeof value === "boolean") {
        return value;
      }
      if (value === "true" || value === "false") {
        return value === "true";
      }
      throw new Error(`${label} must be a boolean.`);
    }
    if (integerTypes.has(type)) {
      return parseInteger(
        value,
        label,
        type === "u64" || type === "i64" || type === "u128" || type === "i128",
      );
    }
    if (type === "bytes") {
      return Buffer.from(decodeByteArray(value, label));
    }
    return value;
  }

  if (!isRecord(type)) {
    return value;
  }

  if ("option" in type) {
    if (value === undefined || value === null || value === "") {
      return null;
    }
    return parseIdlValue(type.option, value, label, defaultSigner);
  }

  if ("vec" in type) {
    if (type.vec === "u8") {
      return decodeByteArray(value, label);
    }
    if (!Array.isArray(value)) {
      throw new Error(`${label} must be an array.`);
    }
    return value.map((entry, index) =>
      parseIdlValue(type.vec, entry, `${label}[${index}]`, defaultSigner),
    );
  }

  if ("array" in type) {
    const [inner, length] = type.array as [IdlType, number];
    const values = inner === "u8" ? decodeByteArray(value, label) : value;
    if (!Array.isArray(values)) {
      throw new Error(`${label} must be an array.`);
    }
    if (values.length !== length) {
      throw new Error(`${label} must contain ${length} values.`);
    }
    return values.map((entry, index) =>
      parseIdlValue(inner, entry, `${label}[${index}]`, defaultSigner),
    );
  }

  if ("defined" in type && isRecord(type.defined)) {
    const definition = getDefinedType(String(type.defined.name));
    if (definition.type.kind !== "struct") {
      throw new Error(`${String(type.defined.name)} is not a struct.`);
    }
    if (!isRecord(value)) {
      throw new Error(`${label} must be an object.`);
    }
    const out: JsonRecord = {};
    for (const field of definition.type.fields ?? []) {
      out[toCamelCase(field.name)] = parseIdlValue(
        field.type,
        readField(value, field.name),
        `${label}.${field.name}`,
        defaultSigner,
      );
    }
    return out;
  }

  return value;
}

function parseArgs(
  instruction: IdlInstruction,
  input: JsonRecord | unknown[],
  defaultSigner?: PublicKey,
): unknown[] {
  if (Array.isArray(input)) {
    if (input.length !== instruction.args.length) {
      throw new Error(
        `${instruction.name} expects ${instruction.args.length} args.`,
      );
    }
    return instruction.args.map((arg, index) =>
      parseIdlValue(arg.type, input[index], arg.name, defaultSigner),
    );
  }
  const body = isRecord(input) ? input : {};
  return instruction.args.map((arg) => {
    let value = readField(body, arg.name);
    if (
      value === undefined &&
      instruction.args.length === 1 &&
      arg.name === "args"
    ) {
      value = body;
    }
    return parseIdlValue(arg.type, value, arg.name, defaultSigner);
  });
}

function parseAccountValue(
  account: IdlAccount,
  accounts: JsonRecord,
  programId: PublicKey,
  defaultSigner?: PublicKey,
): PublicKey | null {
  const raw = readField(accounts, account.name);
  if (raw === undefined || raw === null || raw === "") {
    if ("address" in account && typeof account.address === "string") {
      return new PublicKey(account.address);
    }
    if (account.name === "system_program") {
      return SystemProgram.programId;
    }
    if (account.name === "caller_program") {
      return programId;
    }
    if (
      (account.name === "owner" || account.name === "payer") &&
      defaultSigner
    ) {
      return defaultSigner;
    }
    if (account.optional) {
      return null;
    }
    throw new Error(`${account.name} account is required.`);
  }
  if (typeof raw !== "string") {
    throw new Error(`${account.name} must be a public key string.`);
  }
  if (
    (raw === "$signer" || raw === "$wallet" || raw === "$owner") &&
    defaultSigner
  ) {
    return defaultSigner;
  }
  return new PublicKey(raw);
}

function parseAccounts(
  instruction: IdlInstruction,
  accounts: JsonRecord,
  programId: PublicKey,
  defaultSigner?: PublicKey,
): JsonRecord {
  const out: JsonRecord = {};
  for (const account of instruction.accounts) {
    out[toCamelCase(account.name)] = parseAccountValue(
      account,
      accounts,
      programId,
      defaultSigner,
    );
  }
  return out;
}

function typeLabel(type: IdlType): string {
  if (typeof type === "string") {
    return type;
  }
  if (!isRecord(type)) {
    return "unknown";
  }
  if ("option" in type) {
    return `option<${typeLabel(type.option)}>`;
  }
  if ("vec" in type) {
    return `vec<${typeLabel(type.vec)}>`;
  }
  if ("array" in type) {
    const [inner, length] = type.array as [IdlType, number];
    return `[${typeLabel(inner)}; ${length}]`;
  }
  if ("defined" in type && isRecord(type.defined)) {
    return String(type.defined.name);
  }
  return "object";
}

function sampleValue(type: IdlType, depth = 0): unknown {
  if (depth > 4) {
    return null;
  }
  if (typeof type === "string") {
    if (type === "pubkey") return "$owner";
    if (type === "string") return "";
    if (type === "bool") return false;
    if (integerTypes.has(type)) {
      return type === "u64" ||
        type === "i64" ||
        type === "u128" ||
        type === "i128"
        ? "0"
        : 0;
    }
    if (type === "bytes") return [];
    return null;
  }
  if (!isRecord(type)) {
    return null;
  }
  if ("option" in type) return null;
  if ("vec" in type) return [];
  if ("array" in type) {
    const [inner, length] = type.array as [IdlType, number];
    return Array.from({ length }, () => sampleValue(inner, depth + 1));
  }
  if ("defined" in type && isRecord(type.defined)) {
    const definition = getDefinedType(String(type.defined.name));
    if (definition.type.kind !== "struct") {
      return null;
    }
    const out: JsonRecord = {};
    for (const field of definition.type.fields ?? []) {
      out[toCamelCase(field.name)] = sampleValue(field.type, depth + 1);
    }
    return out;
  }
  return null;
}

function signerAccountNames(instruction: IdlInstruction): string[] {
  return instruction.accounts
    .filter((account) => account.signer === true)
    .map((account) => account.name);
}

function ownerSignatureRequired(instruction: IdlInstruction): boolean {
  return signerAccountNames(instruction).some(
    (name) => name === "owner" || name === "payer",
  );
}

export function getProgramInstructionSchema(
  name: string,
): ProgramInstructionSchema {
  const instruction = getInstruction(name);
  const signerAccounts = signerAccountNames(instruction);
  const safety = classifyInstructionSafety({
    name: instruction.name,
    accounts: instruction.accounts,
  });
  return {
    name: instruction.name,
    camelName: toCamelCase(instruction.name),
    accounts: instruction.accounts.map((account) => ({
      name: account.name,
      camelName: toCamelCase(account.name),
      signer: account.signer === true,
      writable: account.writable === true,
      optional: account.optional === true,
      address:
        "address" in account && typeof account.address === "string"
          ? account.address
          : undefined,
    })),
    args: instruction.args.map((arg: IdlInstructionArg) => ({
      name: arg.name,
      camelName: toCamelCase(arg.name),
      type: arg.type,
      typeLabel: typeLabel(arg.type),
      sample: sampleValue(arg.type),
    })),
    signerAccounts,
    ownerSignatureRequired: ownerSignatureRequired(instruction),
    safety,
  };
}

export function getProgramInstructionCatalog() {
  const instructionByName = new Map<string, IdlInstruction>(
    AURA_IDL.instructions.map((instruction) => [
      instruction.name,
      instruction as unknown as IdlInstruction,
    ]),
  );
  const domains = AURA_FEATURE_DOMAINS.map((domain: AuraFeatureDomain) => ({
    ...domain,
    instructions: domain.instructions.map(
      (feature: AuraInstructionFeature) => ({
        ...feature,
        schema: instructionByName.has(feature.name)
          ? getProgramInstructionSchema(feature.name)
          : null,
      }),
    ),
  }));
  return {
    domains,
    totals: {
      domains: domains.length,
      instructions: AURA_IDL.instructions.length,
    },
  };
}

export async function buildProgramInstruction(
  client: AuraClient,
  input: ProgramInstructionInput,
  options: { programId: PublicKey; defaultSigner?: PublicKey },
): Promise<ProgramInstructionBuild> {
  const instructionDef = getInstruction(input.instruction);
  const methodName = toCamelCase(instructionDef.name);
  const method = (
    client.program.methods as unknown as Record<
      string,
      (...args: unknown[]) => unknown
    >
  )[methodName];
  if (typeof method !== "function") {
    throw new Error(
      `${instructionDef.name} is not exposed by the Anchor client.`,
    );
  }
  const normalizedAccounts = parseAccounts(
    instructionDef,
    input.accounts,
    options.programId,
    options.defaultSigner,
  );
  const normalizedArgs = parseArgs(
    instructionDef,
    input.args,
    options.defaultSigner,
  );
  const builder = method(...normalizedArgs) as {
    accountsStrict(accounts: JsonRecord): {
      instruction(): Promise<TransactionInstruction>;
    };
  };
  const instruction = await builder
    .accountsStrict(normalizedAccounts)
    .instruction();
  const schema = getProgramInstructionSchema(instructionDef.name);
  return {
    schema,
    normalizedAccounts: jsonSafe(normalizedAccounts) as JsonRecord,
    normalizedArgs: jsonSafe(normalizedArgs) as unknown[],
    instruction,
    serializedInstruction: serializeInstruction(instruction),
    requiredSigners: instruction.keys
      .filter((key) => key.isSigner)
      .map((key) => key.pubkey.toBase58()),
    signerAccounts: schema.signerAccounts,
    ownerSignatureRequired: schema.ownerSignatureRequired,
  };
}

export function serializeInstruction(
  instruction: TransactionInstruction,
): SerializedInstruction {
  return {
    programId: instruction.programId.toBase58(),
    keys: instruction.keys.map((key) => ({
      pubkey: key.pubkey.toBase58(),
      isSigner: key.isSigner,
      isWritable: key.isWritable,
    })),
    dataBase64: Buffer.from(instruction.data).toString("base64"),
  };
}

function jsonSafe(value: unknown): unknown {
  if (value instanceof PublicKey) {
    return value.toBase58();
  }
  if (BN.isBN(value)) {
    return value.toString(10);
  }
  if (typeof value === "bigint") {
    return value.toString();
  }
  if (Buffer.isBuffer(value)) {
    return Array.from(value);
  }
  if (Array.isArray(value)) {
    return value.map(jsonSafe);
  }
  if (isRecord(value)) {
    const out: JsonRecord = {};
    for (const [key, entry] of Object.entries(value)) {
      out[key] = jsonSafe(entry);
    }
    return out;
  }
  return value;
}
