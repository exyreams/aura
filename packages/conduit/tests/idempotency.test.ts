import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  canonicalizeArgs,
  computeIdempotencyKey,
  createInMemoryIdempotencyStore,
} from "../src/core/idempotency.js";

test("canonicalizeArgs sorts keys recursively", () => {
  const a = canonicalizeArgs({ z: 1, a: { b: 2, a: 3 } });
  const b = canonicalizeArgs({ a: { a: 3, b: 2 }, z: 1 });
  assert.equal(a, b);
  assert.equal(a, '{"a":{"a":3,"b":2},"z":1}');
});

test("canonicalizeArgs handles arrays without sorting their order", () => {
  assert.equal(canonicalizeArgs([3, 1, 2]), "[3,1,2]");
});

test("computeIdempotencyKey is stable for equivalent canonical inputs", () => {
  const k1 = computeIdempotencyKey({
    sessionId: "s1",
    tool: "t",
    canonicalArgs: '{"a":1,"b":2}',
  });
  const k2 = computeIdempotencyKey({
    sessionId: "s1",
    tool: "t",
    canonicalArgs: '{"a":1,"b":2}',
  });
  assert.equal(k1, k2);
});

test("computeIdempotencyKey changes when callerKey changes", () => {
  const base = { sessionId: "s1", tool: "t", canonicalArgs: "{}" };
  const k1 = computeIdempotencyKey(base);
  const k2 = computeIdempotencyKey({ ...base, callerKey: "abc" });
  assert.notEqual(k1, k2);
});

test("in-memory store records and returns prior results", () => {
  const store = createInMemoryIdempotencyStore();
  const key = store.computeKey({
    sessionId: "s1",
    tool: "t",
    canonicalArgs: "{}",
  });
  assert.equal(store.get(key), undefined);
  store.put(key, { value: 42 });
  const recalled = store.get(key);
  assert.deepEqual(recalled?.value, { value: 42 });
});

test("in-memory store expires entries past TTL", () => {
  let now = 1_000_000;
  const store = createInMemoryIdempotencyStore({ ttlMs: 1000, now: () => now });
  const key = store.computeKey({
    sessionId: "s1",
    tool: "t",
    canonicalArgs: "{}",
  });
  store.put(key, "ok");
  assert.notEqual(store.get(key), undefined);
  now += 2000;
  assert.equal(store.get(key), undefined);
});

test("in-memory store prunes oldest when over max-entries", () => {
  const store = createInMemoryIdempotencyStore({ maxEntries: 2 });
  store.put("k1", "v1");
  store.put("k2", "v2");
  store.put("k3", "v3");
  assert.ok(store.size() <= 2);
});
