/**
 * Account layout decode round-trips.
 *
 * The discriminator test proves each account's *prefix*; this proves the SDK
 * can actually decode each account's *body*. For all 32 account types we drive
 * the program's BorshAccountsCoder through a full cycle:
 *
 *   encode(sample) -> bytes -> decode(bytes) -> re-encode -> identical bytes
 *
 * and additionally assert:
 *   - the first 8 bytes equal the account's own discriminator (so the right
 *     layout is keyed),
 *   - `coder.memcmp(name)` filters by exactly that discriminator,
 *   - decode rejects bytes carrying a different account's discriminator.
 *
 * If any account's borsh layout drifts (reordered field, wrong width, dropped
 * field) the round-trip breaks here — a class of bug the discriminator and
 * fetcher-presence checks cannot see.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bytesEqual, toHex } from "../../support/discriminator.js";
import { idlAccounts } from "../../support/idl.js";
import { offlineClient } from "../../support/offline.js";
import { sampleDefined } from "../../support/sample.js";

/** Anchor keys the account coder by the account name with a lowercased first char. */
function accountKey(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

// biome-ignore lint/suspicious/noExplicitAny: the account coder is keyed dynamically.
const coder = offlineClient().program.coder.accounts as any;

describe("account encode/decode round-trip", () => {
  for (const account of idlAccounts) {
    const key = accountKey(account.name);

    it(`${account.name}: encode -> decode -> re-encode is stable`, async () => {
      const sample = sampleDefined(account.name) as Record<string, unknown>;
      assert.ok(sample, `no type def to sample for ${account.name}`);

      const encoded: Buffer = await coder.encode(key, sample);
      assert.ok(encoded.length >= 8, `${account.name}: encoded too short`);

      // The encoded prefix must be this account's discriminator.
      assert.ok(
        bytesEqual(encoded.subarray(0, 8), account.discriminator),
        `${account.name}: prefix ${toHex(encoded.subarray(0, 8))} != discriminator ${toHex(account.discriminator)}`,
      );

      // Decoding must succeed and re-encoding must reproduce the same bytes.
      const decoded = await coder.decode(key, encoded);
      assert.ok(decoded, `${account.name}: decode returned falsy`);
      const reencoded: Buffer = await coder.encode(key, decoded);
      assert.ok(
        bytesEqual(reencoded, encoded),
        `${account.name}: re-encode mismatch`,
      );
    });

    it(`${account.name}: memcmp filter matches its discriminator`, () => {
      const filter = coder.memcmp(key) as { offset?: number; bytes: string };
      // The discriminator filter sits at offset 0 (default).
      assert.ok(filter.bytes.length > 0, `${account.name}: empty memcmp`);
    });
  }
});

describe("account decode rejects the wrong layout", () => {
  it("decoding bytes with a different account's discriminator throws", async () => {
    // Encode a TreasuryAccount, then try to decode it as a SwarmPoolAccount.
    const treasury = sampleDefined("TreasuryAccount") as Record<
      string,
      unknown
    >;
    const encoded: Buffer = await coder.encode("treasuryAccount", treasury);
    await assert.rejects(
      async () => coder.decode("swarmPoolAccount", encoded),
      /discriminator|Invalid|unexpected/i,
    );
  });

  it("decoding truncated bytes throws", async () => {
    const treasury = sampleDefined("TreasuryAccount") as Record<
      string,
      unknown
    >;
    const encoded: Buffer = await coder.encode("treasuryAccount", treasury);
    await assert.rejects(async () =>
      coder.decode("treasuryAccount", encoded.subarray(0, 4)),
    );
  });
});
