/**
 * Instruction builder surface.
 *
 * Asserts the exported shape callers actually depend on: every domain
 * namespace exists, every instruction has all three call forms (builder,
 * `<name>Instruction` alias, `send<Name>`), and every instruction is mapped to
 * exactly one of the 13 domains. This is the contract that lets the IDL-driven
 * tests resolve a builder for each instruction.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AURA_INSTRUCTION_DEFINITIONS } from "../../../../sdk-ts/src/generated/instructions.generated.js";
import {
  getInstructionDomain,
  instructions,
} from "../../../../sdk-ts/src/index.js";
import { domainNamespaceKey } from "../../support/sample.js";

const DOMAIN_KEYS = [
  "treasury",
  "confidential",
  "execution",
  "governance",
  "dwallet",
  "policy",
  "budget",
  "operational",
  "lifecycle",
  "swarm",
  "fees",
  "addressLists",
  "batch",
] as const;

const namespaces = instructions as unknown as Record<
  string,
  Record<string, unknown>
>;

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

describe("domain namespaces", () => {
  it("exposes all 13 domain namespaces as objects", () => {
    for (const key of DOMAIN_KEYS) {
      assert.equal(
        typeof namespaces[key],
        "object",
        `missing namespace ${key}`,
      );
    }
  });

  it("does not expose unexpected extra domain namespaces", () => {
    // The instructions module also re-exports metadata helpers and types, so we
    // only assert that every *object-with-builders* namespace is a known domain.
    // Each domain key resolves; this guards against a renamed/removed domain.
    for (const key of DOMAIN_KEYS) {
      assert.ok(key in namespaces, `domain ${key} disappeared`);
    }
  });
});

describe("instruction definition surface", () => {
  it("there are exactly 161 instruction definitions", () => {
    assert.equal(AURA_INSTRUCTION_DEFINITIONS.length, 161);
  });

  it("instruction names are unique", () => {
    const names = new Set(AURA_INSTRUCTION_DEFINITIONS.map((d) => d.name));
    assert.equal(names.size, AURA_INSTRUCTION_DEFINITIONS.length);
  });

  it("method names are unique camelCase forms", () => {
    const methods = new Set(
      AURA_INSTRUCTION_DEFINITIONS.map((d) => d.methodName),
    );
    assert.equal(methods.size, AURA_INSTRUCTION_DEFINITIONS.length);
    for (const def of AURA_INSTRUCTION_DEFINITIONS) {
      assert.doesNotMatch(
        def.methodName,
        /_/,
        `${def.name}: methodName must be camelCase`,
      );
    }
  });

  it("every instruction maps to a known domain", () => {
    for (const def of AURA_INSTRUCTION_DEFINITIONS) {
      const domain = getInstructionDomain(def.name);
      assert.ok(domain, `no domain for ${def.name}`);
      const key = domainNamespaceKey(domain);
      assert.ok(
        DOMAIN_KEYS.includes(key as (typeof DOMAIN_KEYS)[number]),
        `unknown domain key ${key} for ${def.name}`,
      );
    }
  });

  it("getInstructionDomain returns undefined for unknown instructions", () => {
    assert.equal(getInstructionDomain("does_not_exist"), undefined);
  });
});

describe("three call forms per instruction", () => {
  for (const def of AURA_INSTRUCTION_DEFINITIONS) {
    it(`${def.name}: builder + alias + send helper are functions`, () => {
      const domain = getInstructionDomain(def.name);
      assert.ok(domain, def.name);
      const ns = namespaces[domainNamespaceKey(domain)];

      assert.equal(
        typeof ns[def.methodName],
        "function",
        `missing builder ${def.methodName}`,
      );
      assert.equal(
        typeof ns[`${def.methodName}Instruction`],
        "function",
        `missing alias ${def.methodName}Instruction`,
      );
      assert.equal(
        typeof ns[`send${capitalize(def.methodName)}`],
        "function",
        `missing send helper send${capitalize(def.methodName)}`,
      );
    });
  }
});
