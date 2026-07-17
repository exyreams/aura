import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AURA_PROGRAM_ID } from "@aura-protocol/sdk-ts";
import { z } from "zod";

import { openConduitDb } from "../src/core/control-plane/db.js";
import {
  createToolRegistry,
  RegistryInvariantError,
} from "../src/core/registry.js";
import { strictObject } from "../src/core/schemas.js";
import { InMemorySigningService } from "../src/core/signing/in-memory.js";
import { createSolanaContext } from "../src/core/solana.js";
import { buildToolCatalogue } from "../src/core/tools/index.js";
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

test("registry accepts explicit dashboard/control-plane writes", () => {
  const ok = buildTool({
    name: "aura.wallet.create",
    isWrite: true,
    mutatesOffchainState: true,
  });
  const registry = createToolRegistry([ok]);
  assert.equal(registry.has("aura.wallet.create"), true);
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

test("registry accepts the full Conduit tool catalogue", () => {
  const db = openConduitDb({ inMemory: true });
  const solana = createSolanaContext({
    rpcUrl: "http://127.0.0.1:8899",
    programId: AURA_PROGRAM_ID,
  });
  const registry = createToolRegistry(
    buildToolCatalogue({
      solana,
      db,
      signer: new InMemorySigningService(),
      dashboardBaseUrl: "http://localhost:3000",
      controlPlaneBaseUrl: "http://localhost:3000/api/conduit",
    }),
  );

  assert.equal(registry.has("aura.wallet.transfer.request"), true);
  assert.equal(registry.has("aura.wallet.transfer.status"), true);
  db.close();
});

// Make sure z import isn't accidentally tree-shaken in CI.
test("Zod import remains live (sanity)", () => {
  const schema = z.string();
  assert.equal(schema.safeParse("ok").success, true);
});
