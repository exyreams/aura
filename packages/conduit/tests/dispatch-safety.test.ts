import { strict as assert } from "node:assert";
import { test } from "node:test";
import { PublicKey } from "@solana/web3.js";
import { z } from "zod";
import { noopAuditLogger } from "../src/core/audit.js";
import { dispatchTool, type SafetyHooks } from "../src/core/dispatch.js";
import { ConduitError } from "../src/core/errors.js";
import { createInMemoryIdempotencyStore } from "../src/core/idempotency.js";
import { createToolRegistry } from "../src/core/registry.js";
import { strictObject } from "../src/core/schemas.js";
import type { Session, Tool } from "../src/core/types.js";

const VALID_PUBKEY = "11111111111111111111111111111111";

function makeSession(): Session {
  return {
    id: "ses_test",
    agentId: "agent",
    ownerPubkey: new PublicKey(VALID_PUBKEY),
    treasuryPubkey: new PublicKey(VALID_PUBKEY),
    sessionPubkey: null,
    scopes: ["read", "propose"],
    protocolVersion: 1,
    metadata: {},
  };
}

const readTool: Tool = {
  name: "test.read",
  description: "noop read",
  input: strictObject({}),
  requiredScopes: ["read"],
  isWrite: false,
  triggersInbox: false,
  declaredInstructions: [],
  async handler() {
    return { ok: true };
  },
};

const writeTool: Tool = {
  name: "test.write",
  description: "noop write",
  input: strictObject({ destination: z.string() }),
  requiredScopes: ["propose"],
  isWrite: true,
  triggersInbox: true,
  declaredInstructions: [
    { name: "propose_transaction", requiresSigner: ["session_key"] },
  ],
  async handler() {
    return { ok: true };
  },
};

test("dispatch calls recordSessionUse on every invocation", async () => {
  const seen: string[] = [];
  const hooks: SafetyHooks = { recordSessionUse: (id) => seen.push(id) };
  const deps = {
    registry: createToolRegistry([readTool]),
    audit: noopAuditLogger,
    idempotency: createInMemoryIdempotencyStore(),
    safety: hooks,
  };
  await dispatchTool(deps, {
    toolName: "test.read",
    rawInput: {},
    session: makeSession(),
  });
  assert.deepEqual(seen, ["ses_test"]);
});

test("dispatch consumes rate-limit with the correct kind", async () => {
  const consumed: Array<[string, string]> = [];
  const hooks: SafetyHooks = {
    consumeRateLimit: (id, kind) => consumed.push([id, kind]),
  };
  const deps = {
    registry: createToolRegistry([readTool, writeTool]),
    audit: noopAuditLogger,
    idempotency: createInMemoryIdempotencyStore(),
    safety: hooks,
  };
  await dispatchTool(deps, {
    toolName: "test.read",
    rawInput: {},
    session: makeSession(),
  });
  await dispatchTool(deps, {
    toolName: "test.write",
    rawInput: { destination: "X" },
    session: makeSession(),
  });
  assert.deepEqual(consumed, [
    ["ses_test", "read"],
    ["ses_test", "write"],
  ]);
});

test("dispatch fails fast when circuit breaker has tripped", async () => {
  const hooks: SafetyHooks = {
    assertNotPaused: () => {
      throw new ConduitError("forbidden", "tripped");
    },
  };
  const deps = {
    registry: createToolRegistry([readTool]),
    audit: noopAuditLogger,
    idempotency: createInMemoryIdempotencyStore(),
    safety: hooks,
  };
  const result = await dispatchTool(deps, {
    toolName: "test.read",
    rawInput: {},
    session: makeSession(),
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "forbidden");
});

test("dispatch records rejection on policy/rate/forbidden/invalid_input failures", async () => {
  const rejections: Array<[string, string]> = [];
  const hooks: SafetyHooks = {
    recordRejection: (tp, reason) => rejections.push([tp, reason]),
  };
  const failingTool: Tool = {
    ...readTool,
    name: "test.fail",
    async handler() {
      throw new ConduitError("policy_denied", "no");
    },
  };
  const deps = {
    registry: createToolRegistry([failingTool]),
    audit: noopAuditLogger,
    idempotency: createInMemoryIdempotencyStore(),
    safety: hooks,
  };
  await dispatchTool(deps, {
    toolName: "test.fail",
    rawInput: {},
    session: makeSession(),
  });
  assert.equal(rejections.length, 1);
  assert.equal(rejections[0]?.[0], VALID_PUBKEY);
  assert.match(rejections[0]?.[1] ?? "", /policy_denied/);
});

test("dispatch records anomaly observation only for writes", async () => {
  const writes: Array<[string, unknown]> = [];
  const hooks: SafetyHooks = {
    observeWrite: (treasury, args) => writes.push([treasury, args]),
  };
  const deps = {
    registry: createToolRegistry([readTool, writeTool]),
    audit: noopAuditLogger,
    idempotency: createInMemoryIdempotencyStore(),
    safety: hooks,
  };
  await dispatchTool(deps, {
    toolName: "test.read",
    rawInput: {},
    session: makeSession(),
  });
  await dispatchTool(deps, {
    toolName: "test.write",
    rawInput: { destination: "Bob" },
    session: makeSession(),
  });
  assert.equal(writes.length, 1);
  const firstWrite = writes[0];
  assert(firstWrite !== undefined);
  assert.equal((firstWrite[1] as { destination: string }).destination, "Bob");
});
