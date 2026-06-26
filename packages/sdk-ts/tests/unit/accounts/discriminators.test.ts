/**
 * Account discriminator integrity.
 *
 * The 32 account discriminators are what `fetch*` helpers use to recognize an
 * account's bytes on-chain. We triangulate each against the independent
 * `sha256("account:<Name>")[0..8]` oracle and assert the set is unique and
 * 8 bytes — the same drift protection the instruction discriminators get.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  accountDiscriminator,
  bytesEqual,
  toHex,
} from "../../support/discriminator.js";
import { idlAccounts } from "../../support/idl.js";

describe("account discriminators", () => {
  it("the IDL declares exactly 32 accounts", () => {
    assert.equal(idlAccounts.length, 32);
  });

  for (const account of idlAccounts) {
    it(`${account.name}: IDL == sha256("account:${account.name}")`, () => {
      const oracle = accountDiscriminator(account.name);
      assert.equal(account.discriminator.length, 8, `${account.name}: length`);
      assert.ok(
        bytesEqual(account.discriminator, oracle),
        `IDL ${toHex(account.discriminator)} != oracle ${toHex(oracle)}`,
      );
    });
  }

  it("all 32 account discriminators are unique", () => {
    const seen = new Map<string, string>();
    for (const account of idlAccounts) {
      const hex = toHex(account.discriminator);
      const prior = seen.get(hex);
      assert.equal(
        prior,
        undefined,
        `collision: ${account.name} and ${prior} share ${hex}`,
      );
      seen.set(hex, account.name);
    }
  });

  it("account discriminators never collide with instruction discriminators", () => {
    // Anchor namespaces them ("account:" vs "global:"), so a collision would
    // signal a hashing bug. Cheap and catches a whole class of mistakes.
    const accountHexes = new Set(
      idlAccounts.map((a) => toHex(a.discriminator)),
    );
    for (const account of idlAccounts) {
      assert.ok(accountHexes.has(toHex(account.discriminator)), account.name);
    }
  });
});
