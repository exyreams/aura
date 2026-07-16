import { strict as assert } from "node:assert";
import { test } from "node:test";
import { z } from "zod";
import {
  AgentIdString,
  IdempotencyKey,
  PubkeyString,
  strictObject,
} from "../src/core/schemas.js";

test("PubkeyString accepts a valid base58 pubkey", () => {
  const result = PubkeyString.safeParse("11111111111111111111111111111111");
  assert.equal(result.success, true);
});

test("PubkeyString rejects gibberish", () => {
  const result = PubkeyString.safeParse("not-a-pubkey");
  assert.equal(result.success, false);
});

test("PubkeyString trims whitespace", () => {
  const result = PubkeyString.safeParse("  11111111111111111111111111111111  ");
  assert.equal(result.success, true);
  if (result.success) {
    assert.equal(result.data, "11111111111111111111111111111111");
  }
});

test("AgentIdString allows alphanumeric, underscore, dash, dot", () => {
  for (const id of ["claude-code", "codex_prod.v1", "my-agent-1"]) {
    assert.equal(AgentIdString.safeParse(id).success, true, id);
  }
});

test("AgentIdString rejects special characters", () => {
  for (const id of ["spaces in id", "slash/here", "ampersand&", ""]) {
    assert.equal(AgentIdString.safeParse(id).success, false, id);
  }
});

test("IdempotencyKey enforces length and url-safe charset", () => {
  assert.equal(IdempotencyKey.safeParse("abcdefgh").success, true);
  assert.equal(IdempotencyKey.safeParse("too-short").success, true);
  assert.equal(IdempotencyKey.safeParse("a").success, false);
  assert.equal(IdempotencyKey.safeParse("has spaces inside").success, false);
});

test("strictObject rejects extra fields, not ignores them", () => {
  const schema = strictObject({ x: z.string() });
  const parsed = schema.safeParse({ x: "ok", extra: "should fail" });
  assert.equal(parsed.success, false);
});
