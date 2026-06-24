/**
 * IDL-driven sample value generator.
 *
 * Produces minimal, structurally-valid JS values for any IDL type so tests can
 * build and encode every instruction without hand-maintaining fixtures. Values
 * are intentionally trivial (zeros, empty collections, `null` options, first
 * enum variant) — enough for Borsh encoding, not for on-chain acceptance.
 */

import { PublicKey, type TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";
import {
  AURA_IDL,
  type AuraClient,
  type CreateTreasuryArgs,
  getInstructionDomain,
  instructions,
} from "../../src/index.js";

// Minimal structural view of the IDL — enough for sample generation.
type IdlTypeNode =
  | string
  | { option: IdlTypeNode }
  | { coption: IdlTypeNode }
  | { vec: IdlTypeNode }
  | { array: [IdlTypeNode, number] }
  | { defined: string | { name: string } };

interface IdlField {
  name: string;
  type: IdlTypeNode;
}

interface IdlInstruction {
  name: string;
  args: IdlField[];
}

interface IdlTypeDef {
  name: string;
  type:
    | { kind: "struct"; fields?: IdlField[] }
    | { kind: "enum"; variants: { name: string }[] }
    | { kind: "type"; alias: IdlTypeNode };
}

interface LooseIdl {
  instructions: IdlInstruction[];
  types: IdlTypeDef[];
}

const idl = AURA_IDL as unknown as LooseIdl;
const typeDefs = new Map(idl.types.map((t) => [t.name, t]));
const idlInstructions = new Map(idl.instructions.map((ix) => [ix.name, ix]));

const BIG_INT_TYPES = new Set(["u64", "u128", "u256", "i64", "i128", "i256"]);
const SMALL_INT_TYPES = new Set([
  "u8",
  "u16",
  "u32",
  "i8",
  "i16",
  "i32",
  "f32",
  "f64",
]);

/** Converts a snake_case IDL identifier to camelCase. */
export function camel(name: string): string {
  return name.includes("_")
    ? name.replace(/_([a-z0-9])/g, (_match, char: string) => char.toUpperCase())
    : name;
}

function definedName(node: { defined: string | { name: string } }): string {
  return typeof node.defined === "string" ? node.defined : node.defined.name;
}

/** Builds a minimal sample value for any IDL type node. */
export function sampleType(type: IdlTypeNode): unknown {
  if (typeof type === "string") {
    if (type === "bool") return false;
    if (type === "string") return "";
    if (type === "pubkey" || type === "publicKey") return PublicKey.default;
    if (type === "bytes") return Buffer.alloc(0);
    if (BIG_INT_TYPES.has(type)) return new BN(0);
    if (SMALL_INT_TYPES.has(type)) return 0;
    return 0;
  }
  if ("option" in type || "coption" in type) return null;
  if ("vec" in type) return [];
  if ("array" in type) {
    const [inner, len] = type.array;
    const count = typeof len === "number" ? len : 0;
    return Array.from({ length: count }, () => sampleType(inner));
  }
  if ("defined" in type) return sampleDefined(definedName(type));
  return null;
}

/** Builds a minimal sample value for a named (defined) IDL type. */
export function sampleDefined(name: string): unknown {
  const def = typeDefs.get(name);
  if (!def) return null;
  if (def.type.kind === "struct") {
    const value: Record<string, unknown> = {};
    for (const field of def.type.fields ?? []) {
      value[camel(field.name)] = sampleType(field.type);
    }
    return value;
  }
  if (def.type.kind === "enum") {
    const first = def.type.variants[0];
    return first ? { [camel(first.name)]: {} } : {};
  }
  return sampleType(def.type.alias);
}

/**
 * Builds the `args` portion of a domain builder input for an instruction,
 * matching the generated builder's shape:
 * - no args -> undefined
 * - single `args` struct -> the struct value
 * - multiple scalars -> `{ argName: value }`
 */
export function sampleArgs(instructionName: string): unknown {
  const ix = idlInstructions.get(instructionName);
  if (!ix || ix.args.length === 0) return undefined;
  if (ix.args.length === 1 && ix.args[0].name === "args") {
    return sampleType(ix.args[0].type);
  }
  const value: Record<string, unknown> = {};
  for (const arg of ix.args) {
    value[camel(arg.name)] = sampleType(arg.type);
  }
  return value;
}

/** Builds an `accounts` map (every account -> a fresh dummy key). */
export function sampleAccounts(
  accounts: readonly { propertyName: string }[],
): Record<string, PublicKey> {
  const value: Record<string, PublicKey> = {};
  for (const account of accounts) {
    value[account.propertyName] = PublicKey.unique();
  }
  return value;
}

type Builder = (
  client: AuraClient,
  input: unknown,
) => Promise<TransactionInstruction>;

const builderNamespaces = instructions as unknown as Record<
  string,
  Record<string, Builder>
>;

/** Maps a domain id to its instruction-namespace export key. */
export function domainNamespaceKey(domain: string): string {
  return domain === "address-lists" ? "addressLists" : domain;
}

/** Resolves the SDK instruction builder for a snake_case instruction name. */
export function resolveBuilder(
  instructionName: string,
  methodName: string,
): Builder | undefined {
  const domain = getInstructionDomain(instructionName);
  if (!domain) return undefined;
  return builderNamespaces[domainNamespaceKey(domain)]?.[methodName];
}

/**
 * Builds a structurally-complete, sensible {@link CreateTreasuryArgs}. The
 * nested policy/fee records come from the IDL (so new fields never break the
 * fixture); realistic spend limits are layered on top.
 */
export function buildCreateTreasuryArgs(
  owner: PublicKey,
  agentId: string,
  now: BN,
): CreateTreasuryArgs {
  const policyConfig = sampleDefined(
    "PolicyConfigRecord",
  ) as CreateTreasuryArgs["policyConfig"];
  policyConfig.dailyLimitUsd = new BN(10_000);
  policyConfig.perTxLimitUsd = new BN(1_000);
  policyConfig.daytimeHourlyLimitUsd = new BN(2_500);
  policyConfig.nighttimeHourlyLimitUsd = new BN(500);
  policyConfig.velocityLimitUsd = new BN(5_000);
  policyConfig.allowedProtocolBitmap = new BN(31);
  policyConfig.maxSlippageBps = new BN(100);
  policyConfig.bitcoinManualReviewThresholdUsd = new BN(5_000);

  const protocolFees = sampleDefined(
    "ProtocolFeesRecord",
  ) as CreateTreasuryArgs["protocolFees"];

  return {
    agentId,
    aiAuthority: owner,
    createdAt: now,
    pendingTransactionTtlSecs: new BN(900),
    policyConfig,
    protocolFees,
  };
}
