/**
 * Account fetcher coverage.
 *
 * Verifies that every IDL account has both a `fetch<Name>` and a
 * `fetch<Name>Nullable` helper exported from the accounts namespace, and that
 * the treasury helpers are present.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { AURA_IDL, accounts } from "../../src/index.js";

const ns = accounts as unknown as Record<string, unknown>;

test("every IDL account exposes fetch + fetchNullable helpers", () => {
  for (const account of AURA_IDL.accounts) {
    const fetchName = `fetch${account.name}`;
    assert.equal(typeof ns[fetchName], "function", `missing ${fetchName}`);
    assert.equal(
      typeof ns[`${fetchName}Nullable`],
      "function",
      `missing ${fetchName}Nullable`,
    );
  }
});

test("accounts namespace count covers all 32 IDL accounts", () => {
  assert.equal(AURA_IDL.accounts.length, 32);
  const fetchers = Object.keys(ns).filter(
    (key) => key.startsWith("fetch") && !key.endsWith("Nullable"),
  );
  assert.ok(
    fetchers.length >= AURA_IDL.accounts.length,
    `expected >= ${AURA_IDL.accounts.length} fetchers, found ${fetchers.length}`,
  );
});

test("treasury input + derive helpers are exported", () => {
  assert.equal(typeof accounts.createTreasuryInput, "function");
  assert.equal(typeof accounts.derive, "function");
});
