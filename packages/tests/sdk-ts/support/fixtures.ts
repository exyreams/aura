/**
 * IDL-driven fixture generator for the devnet suite.
 *
 * Produces structurally-valid argument objects for any IDL type so tests can
 * build instructions without hand-maintaining fixtures. The base generator
 * yields minimal values (zeros, empty collections, null options, first enum
 * variant); {@link buildCreateTreasuryArgs} layers realistic policy limits on
 * top. This is a self-contained copy of the unit suite's generator so the test
 * package depends only on the published SDK surface, never its internals.
 */

import { AURA_IDL, type CreateTreasuryArgs } from "@aura-protocol/sdk-ts";
import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

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

interface IdlTypeDef {
  name: string;
  type:
    | { kind: "struct"; fields?: IdlField[] }
    | { kind: "enum"; variants: { name: string }[] }
    | { kind: "type"; alias: IdlTypeNode };
}

interface LooseIdl {
  types: IdlTypeDef[];
}

const idl = AURA_IDL as unknown as LooseIdl;
const typeDefs = new Map(idl.types.map((t) => [t.name, t]));

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
    ? name.replace(/_([a-z0-9])/g, (_m, char: string) => char.toUpperCase())
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
 * Builds a structurally-complete, sensible {@link CreateTreasuryArgs}. The
 * nested policy/fee records come from the IDL (so new fields never break the
 * fixture); realistic spend limits are layered on top:
 *   - perTxLimitUsd  = 1_000   (USD cents semantics per the program)
 *   - dailyLimitUsd  = 10_000
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

  // The sampled record zero-fills the reputation policy, which makes
  // `multiplier_bps` return 0 (zero threshold => high tier => 0 bps) and
  // collapses the effective daily limit to 0 — denying every proposal. Restore
  // the program's real defaults so a within-limit proposal is actually approved.
  policyConfig.reputationPolicy = {
    highScoreThreshold: new BN(80),
    mediumScoreThreshold: new BN(50),
    highMultiplierBps: new BN(15_000),
    lowMultiplierBps: new BN(7_000),
  };

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
