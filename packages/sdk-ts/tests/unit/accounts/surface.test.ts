/**
 * Account fetcher surface.
 *
 * Every IDL account must expose `fetch<Name>` and `fetch<Name>Nullable`, and —
 * crucially — each of those must map to a real entry on the Anchor program's
 * account coder (`program.account.<camelName>`). That second check is what
 * proves a fetcher will actually decode rather than throw "unknown account" at
 * runtime. The treasury input/derive convenience helpers are pinned too.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { accounts } from "../../../src/index.js";
import { idlAccounts } from "../../support/idl.js";
import { offlineClient } from "../../support/offline.js";

const ns = accounts as unknown as Record<string, unknown>;

/** Anchor keys account clients by the account name with a lowercased first char. */
function accountKey(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

describe("fetcher exports", () => {
  it("every IDL account exposes fetch + fetchNullable", () => {
    for (const account of idlAccounts) {
      const fetchName = `fetch${account.name}`;
      assert.equal(typeof ns[fetchName], "function", `missing ${fetchName}`);
      assert.equal(
        typeof ns[`${fetchName}Nullable`],
        "function",
        `missing ${fetchName}Nullable`,
      );
    }
  });

  it("there are at least as many fetchers as IDL accounts", () => {
    const fetchers = Object.keys(ns).filter(
      (k) => k.startsWith("fetch") && !k.endsWith("Nullable"),
    );
    assert.ok(
      fetchers.length >= idlAccounts.length,
      `expected >= ${idlAccounts.length} fetchers, found ${fetchers.length}`,
    );
  });
});

describe("fetchers map to real program-coder entries", () => {
  const client = offlineClient();
  // biome-ignore lint/suspicious/noExplicitAny: account namespace is keyed dynamically.
  const accountCoder = client.program.account as unknown as Record<string, any>;

  for (const account of idlAccounts) {
    it(`${account.name}: program.account.${accountKey(account.name)} exists`, () => {
      const key = accountKey(account.name);
      assert.ok(
        accountCoder[key],
        `program coder has no account client for ${key}`,
      );
      assert.equal(
        typeof accountCoder[key].fetch,
        "function",
        `${key}.fetch missing`,
      );
      assert.equal(
        typeof accountCoder[key].fetchNullable,
        "function",
        `${key}.fetchNullable missing`,
      );
    });
  }
});

describe("treasury convenience helpers", () => {
  it("exports createTreasuryInput and derive", () => {
    assert.equal(typeof accounts.createTreasuryInput, "function");
    assert.equal(typeof accounts.derive, "function");
  });
});
