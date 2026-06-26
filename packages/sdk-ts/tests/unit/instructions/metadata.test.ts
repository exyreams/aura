/**
 * Instruction metadata helpers.
 *
 * Exercises the runtime introspection surface (`listInstructionAccounts`,
 * `listRequiredInstructionAccounts`, `listOptionalInstructionAccounts`,
 * `listInstructionArgs`, `requireInstructionDefinition`,
 * `getAuraInstructionDefinition`) that apps use for capability discovery, and
 * pins the required/optional partition against every instruction.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AURA_INSTRUCTION_DEFINITIONS } from "../../../src/generated/instructions.generated.js";
import { instructions } from "../../../src/index.js";
import { findInstruction } from "../../support/idl.js";

describe("requireInstructionDefinition / getAuraInstructionDefinition", () => {
  it("resolves a known instruction by snake_case name", () => {
    const def = instructions.requireInstructionDefinition("abandon_proposal");
    assert.equal(def.methodName, "abandonProposal");
    assert.equal(def.name, "abandon_proposal");
  });

  it("getAuraInstructionDefinition returns undefined for unknown names", () => {
    assert.equal(
      instructions.getAuraInstructionDefinition("does_not_exist"),
      undefined,
    );
  });

  it("requireInstructionDefinition throws on unknown names", () => {
    assert.throws(
      () => instructions.requireInstructionDefinition("does_not_exist"),
      /Unknown AURA instruction/,
    );
  });
});

describe("listInstructionAccounts", () => {
  it("returns the full ordered account list with flags", () => {
    const accounts = instructions.listInstructionAccounts("createTreasury");
    assert.deepEqual(
      accounts.map((a) => [a.propertyName, a.signer, a.writable, a.optional]),
      [
        ["owner", true, true, false],
        ["treasury", false, true, false],
        ["systemProgram", false, false, false],
      ],
    );
  });

  it("accepts both snake_case and camelCase instruction names", () => {
    const bySnake = instructions.listInstructionAccounts("abandon_proposal");
    const byCamel = instructions.listInstructionAccounts("abandonProposal");
    assert.deepEqual(
      bySnake.map((a) => a.propertyName),
      byCamel.map((a) => a.propertyName),
    );
  });
});

describe("required / optional partition", () => {
  it("required + optional reconstruct the full list for every instruction", () => {
    for (const def of AURA_INSTRUCTION_DEFINITIONS) {
      const required = instructions.listRequiredInstructionAccounts(def.name);
      const optional = instructions.listOptionalInstructionAccounts(def.name);
      assert.equal(
        required.length + optional.length,
        def.accounts.length,
        def.name,
      );
      // Required must all be non-optional; optional must all be optional.
      assert.ok(
        required.every((a) => !a.optional),
        `${def.name}: required`,
      );
      assert.ok(
        optional.every((a) => a.optional),
        `${def.name}: optional`,
      );
    }
  });

  it("abandon_proposal exposes exactly one optional account (dwalletState)", () => {
    assert.deepEqual(
      instructions
        .listOptionalInstructionAccounts("abandon_proposal")
        .map((a) => a.propertyName),
      ["dwalletState"],
    );
  });
});

describe("listInstructionArgs", () => {
  it("returns args matching the IDL arg list for every instruction", () => {
    for (const def of AURA_INSTRUCTION_DEFINITIONS) {
      const args = instructions.listInstructionArgs(def.name);
      const idlIx = findInstruction(def.name);
      assert.ok(idlIx, def.name);
      assert.equal(args.length, idlIx.args.length, `${def.name}: arg count`);
      args.forEach((arg, i) => {
        assert.equal(arg.name, idlIx.args[i].name, `${def.name}.args[${i}]`);
      });
    }
  });
});
