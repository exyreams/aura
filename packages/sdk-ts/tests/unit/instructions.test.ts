/**
 * Instruction coverage.
 *
 * Drives every instruction in the IDL through its generated SDK builder and
 * asserts the encoded instruction is well-formed (program id, discriminator,
 * account count). Also checks the namespace/alias/send surface and the runtime
 * instruction metadata.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { AURA_INSTRUCTION_DEFINITIONS } from "../../src/generated/instructions.generated.js";
import {
  AURA_PROGRAM_ID,
  getInstructionDomain,
  instructions,
} from "../../src/index.js";
import { offlineClient } from "../support/offline.js";
import {
  domainNamespaceKey,
  resolveBuilder,
  sampleAccounts,
  sampleArgs,
} from "../support/sample.js";

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

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

const namespaces = instructions as unknown as Record<
  string,
  Record<string, unknown>
>;

test("exposes every domain namespace", () => {
  for (const key of DOMAIN_KEYS) {
    assert.equal(typeof namespaces[key], "object", `missing namespace ${key}`);
  }
});

test("IDL and metadata agree on instruction count", () => {
  assert.equal(AURA_INSTRUCTION_DEFINITIONS.length, 161);
});

test("every instruction maps to a known domain", () => {
  for (const def of AURA_INSTRUCTION_DEFINITIONS) {
    const domain = getInstructionDomain(def.name);
    assert.ok(domain, `no domain for ${def.name}`);
    const key = domainNamespaceKey(domain as string);
    assert.ok(
      DOMAIN_KEYS.includes(key as (typeof DOMAIN_KEYS)[number]),
      `unknown domain key ${key} for ${def.name}`,
    );
  }
});

test("every instruction exposes builder, alias, and send helper", () => {
  for (const def of AURA_INSTRUCTION_DEFINITIONS) {
    const domain = getInstructionDomain(def.name);
    assert.ok(domain, def.name);
    const ns = namespaces[domainNamespaceKey(domain as string)];
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
      `missing send helper for ${def.methodName}`,
    );
  }
});

// One generated test per instruction: build it and verify encoding.
for (const def of AURA_INSTRUCTION_DEFINITIONS) {
  test(`builds ${def.name}`, async () => {
    const client = offlineClient();
    const builder = resolveBuilder(def.name, def.methodName);
    assert.ok(builder, `no builder resolved for ${def.name}`);

    const accounts = sampleAccounts(def.accounts);
    const args = sampleArgs(def.name);
    const input = args === undefined ? { accounts } : { accounts, args };

    const ix = await builder(client, input);

    assert.ok(
      ix.programId.equals(AURA_PROGRAM_ID),
      `${def.name}: wrong program id`,
    );
    assert.deepEqual(
      Array.from(ix.data.subarray(0, 8)),
      def.discriminator,
      `${def.name}: discriminator mismatch`,
    );
    assert.equal(
      ix.keys.length,
      def.accounts.length,
      `${def.name}: expected ${def.accounts.length} keys, got ${ix.keys.length}`,
    );
  });
}

// Spot-check the account-flag metadata against a couple of known instructions.
test("instruction metadata exposes account flags", () => {
  const createAccounts = instructions.listInstructionAccounts("createTreasury");
  assert.deepEqual(
    createAccounts.map((a) => [a.propertyName, a.signer, a.optional]),
    [
      ["owner", true, false],
      ["treasury", false, false],
      ["systemProgram", false, false],
    ],
  );

  assert.deepEqual(
    instructions
      .listOptionalInstructionAccounts("abandonProposal")
      .map((a) => a.propertyName),
    ["dwalletState"],
  );
  assert.equal(
    instructions.requireInstructionDefinition("abandon_proposal").methodName,
    "abandonProposal",
  );
  assert.throws(
    () => instructions.requireInstructionDefinition("does_not_exist"),
    /Unknown AURA instruction/,
  );
});

test("required + optional accounts partition the full account list", () => {
  for (const def of AURA_INSTRUCTION_DEFINITIONS) {
    const required = instructions.listRequiredInstructionAccounts(def.name);
    const optional = instructions.listOptionalInstructionAccounts(def.name);
    assert.equal(
      required.length + optional.length,
      def.accounts.length,
      def.name,
    );
  }
});
