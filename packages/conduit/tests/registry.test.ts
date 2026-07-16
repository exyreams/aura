import { strict as assert } from "node:assert";
import { test } from "node:test";
import { z } from "zod";

import {
  createToolRegistry,
  RegistryInvariantError,
} from "../src/core/registry.js";
import { strictObject } from "../src/core/schemas.js";
import type { Tool } from "../src/core/types.js";

const emptyInput = strictObject({});

function buildTool(overrides: Partial<Tool> = {}): Tool {
  const base: Tool = {
    name: "test.tool",
    description: "test",
    input: emptyInput,
    requiredScopes: [],
    isWrite: false,
    triggersInbox: false,
    declaredInstructions: [],
    async handler() {
      return {};
    },
  };
  return { ...base, ...overrides };
}

test("registry stores and retrieves tools by name", () => {
  const tool = buildTool({ name: "aura.example" });
  const registry = createToolRegistry([tool]);
  assert.equal(registry.has("aura.example"), true);
  assert.equal(registry.get("aura.example"), tool);
  assert.deepEqual(
    registry.list().map((t) => t.name),
    ["aura.example"],
  );
});

test("registry rejects duplicate names", () => {
  assert.throws(
    () =>
      createToolRegistry([
        buildTool({ name: "aura.dup" }),
        buildTool({ name: "aura.dup" }),
      ]),
    RegistryInvariantError,
  );
});

test("registry refuses to boot if a tool requires the owner as signer", () => {
  const ownerSignedTool = buildTool({
    name: "aura.illegal",
    isWrite: true,
    declaredInstructions: [
      { name: "configure_guardrails", requiresSigner: ["owner"] },
    ],
  });
  assert.throws(
    () => createToolRegistry([ownerSignedTool]),
    (err: unknown) => {
      assert.equal(err instanceof RegistryInvariantError, true);
      if (err instanceof RegistryInvariantError) {
        assert.match(err.message, /owner/);
        assert.equal(err.tool, "aura.illegal");
      }
      return true;
    },
  );
});

test("registry enforces write-label consistency: write without instructions throws", () => {
  const inconsistent = buildTool({ name: "aura.bad-write", isWrite: true });
  assert.throws(
    () => createToolRegistry([inconsistent]),
    RegistryInvariantError,
  );
});

test("registry enforces write-label consistency: instructions without isWrite throws", () => {
  const inconsistent = buildTool({
    name: "aura.bad-read",
    isWrite: false,
    declaredInstructions: [
      { name: "propose_transaction", requiresSigner: ["session_key"] },
    ],
  });
  assert.throws(
    () => createToolRegistry([inconsistent]),
    RegistryInvariantError,
  );
});

test("registry accepts a well-formed write tool with non-owner signer", () => {
  const ok = buildTool({
    name: "aura.proposal.create",
    isWrite: true,
    declaredInstructions: [
      {
        name: "propose_transaction",
        requiresSigner: ["session_key", "ai_authority"],
      },
    ],
  });
  const registry = createToolRegistry([ok]);
  assert.equal(registry.has("aura.proposal.create"), true);
});

// Make sure z import isn't accidentally tree-shaken in CI.
test("Zod import remains live (sanity)", () => {
  const schema = z.string();
  assert.equal(schema.safeParse("ok").success, true);
});
