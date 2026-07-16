import { strict as assert } from "node:assert";
import { test } from "node:test";

import { noopAuditLogger } from "../src/core/audit.js";
import { dispatchTool } from "../src/core/dispatch.js";
import { createInMemoryIdempotencyStore } from "../src/core/idempotency.js";
import { createToolRegistry } from "../src/core/registry.js";
import { createStubSessionResolver } from "../src/core/session.js";
import { whoamiTool } from "../src/core/tools/whoami.js";

const VALID_PUBKEY = "11111111111111111111111111111111";

test("aura.whoami round-trip through dispatchTool", async () => {
  const registry = createToolRegistry([whoamiTool]);
  const idempotency = createInMemoryIdempotencyStore();
  const resolver = createStubSessionResolver({
    id: "test-session",
    agentId: "claude-code-laptop",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
    scopes: ["read"],
    metadata: { host: "laptop" },
  });
  const session = await resolver.resolve(undefined);

  const result = await dispatchTool(
    { registry, audit: noopAuditLogger, idempotency },
    {
      toolName: "aura.whoami",
      rawInput: {},
      session,
    },
  );

  assert.equal(result.ok, true);
  if (!result.ok) return;
  const value = result.value as Record<string, unknown>;
  assert.equal(value.sessionId, "test-session");
  assert.equal(value.agentId, "claude-code-laptop");
  assert.equal(value.ownerPubkey, VALID_PUBKEY);
  assert.equal(value.treasuryPubkey, VALID_PUBKEY);
  assert.equal(value.sessionPubkey, null);
  assert.deepEqual((value.scopes as ReadonlyArray<string>).slice(), ["read"]);
  assert.equal((value.metadata as Record<string, string>).host, "laptop");
  assert.equal(typeof value.protocolVersion, "number");
});

test("aura.whoami rejects extra input fields", async () => {
  const registry = createToolRegistry([whoamiTool]);
  const idempotency = createInMemoryIdempotencyStore();
  const session = await createStubSessionResolver({
    agentId: "agent",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
  }).resolve(undefined);

  const result = await dispatchTool(
    { registry, audit: noopAuditLogger, idempotency },
    {
      toolName: "aura.whoami",
      rawInput: { junk: "field" },
      session,
    },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "invalid_input");
});

test("dispatch is idempotent — second call returns the same value flagged as cached", async () => {
  const registry = createToolRegistry([whoamiTool]);
  const idempotency = createInMemoryIdempotencyStore();
  const session = await createStubSessionResolver({
    agentId: "agent",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
  }).resolve(undefined);

  const first = await dispatchTool(
    { registry, audit: noopAuditLogger, idempotency },
    { toolName: "aura.whoami", rawInput: {}, session },
  );
  const second = await dispatchTool(
    { registry, audit: noopAuditLogger, idempotency },
    { toolName: "aura.whoami", rawInput: {}, session },
  );

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  if (!first.ok || !second.ok) return;
  assert.deepEqual(first.value, second.value);
  assert.equal(first.idempotent, false);
  assert.equal(second.idempotent, true);
});

test("dispatch returns not_found for unknown tools", async () => {
  const registry = createToolRegistry([whoamiTool]);
  const idempotency = createInMemoryIdempotencyStore();
  const session = await createStubSessionResolver({
    agentId: "agent",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
  }).resolve(undefined);

  const result = await dispatchTool(
    { registry, audit: noopAuditLogger, idempotency },
    { toolName: "does.not.exist", rawInput: {}, session },
  );

  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "not_found");
});
