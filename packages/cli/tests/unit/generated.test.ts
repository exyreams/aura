/** Every program instruction is reachable as a registered CLI command. */

import assert from "node:assert/strict";
import test from "node:test";

import { AURA_FEATURE_DOMAINS, AURA_IDL } from "@aura-protocol/sdk-ts";

import { generatedInstructionCount } from "../../src/commands/generated.js";
import { createProgram } from "../../src/index.js";

function toKebab(name: string): string {
  return name.replace(/_/g, "-");
}

test("every program instruction is registered under its domain group", () => {
  const program = createProgram();
  const missing: string[] = [];

  for (const domain of AURA_FEATURE_DOMAINS) {
    const group = program.commands.find(
      (command) => command.name() === domain.id,
    );
    if (!group) {
      missing.push(`missing domain group: ${domain.id}`);
      continue;
    }
    for (const feature of domain.instructions) {
      const sub = toKebab(feature.name);
      const found = group.commands.some(
        (command) => command.name() === sub || command.aliases().includes(sub),
      );
      if (!found) {
        missing.push(`${domain.id} ${sub}`);
      }
    }
  }

  assert.deepEqual(missing, []);
});

test("generated command count matches the full instruction surface", () => {
  assert.equal(generatedInstructionCount(), AURA_IDL.instructions.length);
});

test("ergonomic verbs coexist with generated instruction subcommands", () => {
  const program = createProgram();
  const treasury = program.commands.find(
    (command) => command.name() === "treasury",
  );
  assert.ok(treasury, "treasury group should exist");
  const names = treasury.commands.map((command) => command.name());
  assert.ok(
    names.includes("create"),
    "ergonomic `treasury create` should exist",
  );
  assert.ok(
    names.includes("create-treasury"),
    "generated `treasury create-treasury` should exist",
  );
});

test("the raw instruction surface is registered with aliases and subcommands", () => {
  const program = createProgram();
  const ix = program.commands.find(
    (command) =>
      command.name() === "instruction" || command.aliases().includes("ix"),
  );
  assert.ok(ix, "instruction/ix command should exist");
  const subcommands = ix.commands.map((command) => command.name());
  for (const expected of ["list", "schema", "build", "send"]) {
    assert.ok(
      subcommands.includes(expected),
      `ix ${expected} should be registered`,
    );
  }
});
