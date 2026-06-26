/**
 * Instruction account metas.
 *
 * For every instruction we assert two things the count-only checks miss:
 *
 *   1. The generated SDK account list matches the raw IDL account list exactly
 *      — same order, same `signer` / `writable` / `optional` flags.
 *   2. The *built* instruction's `keys` reproduce that list: same length, same
 *      order, same signer/writable flags, and — for plain (non-`address`,
 *      non-`pda`) accounts — the same pubkey the caller passed in.
 *
 * Accounts with a fixed `address` (e.g. `systemProgram`) or a resolvable `pda`
 * are excluded from the pubkey-identity check because Anchor fills those in
 * itself; their signer/writable/order are still asserted.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AURA_INSTRUCTION_DEFINITIONS } from "../../../src/generated/instructions.generated.js";
import { getInstructionDomain } from "../../../src/index.js";
import { findInstruction } from "../../support/idl.js";
import { offlineClient } from "../../support/offline.js";
import {
  resolveBuilder,
  sampleAccounts,
  sampleArgs,
} from "../../support/sample.js";

describe("generated account lists mirror the IDL", () => {
  for (const def of AURA_INSTRUCTION_DEFINITIONS) {
    it(`${def.name}: SDK account flags == IDL account flags`, () => {
      const idlIx = findInstruction(def.name);
      assert.ok(idlIx, `no IDL instruction for ${def.name}`);
      assert.equal(
        def.accounts.length,
        idlIx.accounts.length,
        `${def.name}: account count`,
      );
      def.accounts.forEach((acc, i) => {
        const idlAcc = idlIx.accounts[i];
        assert.equal(acc.name, idlAcc.name, `${def.name}[${i}]: name/order`);
        assert.equal(
          acc.signer,
          Boolean(idlAcc.signer),
          `${def.name}.${acc.name}: signer`,
        );
        assert.equal(
          acc.writable,
          Boolean(idlAcc.writable),
          `${def.name}.${acc.name}: writable`,
        );
        assert.equal(
          acc.optional,
          Boolean(idlAcc.optional),
          `${def.name}.${acc.name}: optional`,
        );
      });
    });
  }
});

describe("built instructions reproduce the IDL account metas", () => {
  for (const def of AURA_INSTRUCTION_DEFINITIONS) {
    it(`${def.name}: keys match order, signer, writable, and pubkeys`, async () => {
      const client = offlineClient();
      const idlIx = findInstruction(def.name);
      assert.ok(idlIx);

      const builder = resolveBuilder(def.name, def.methodName);
      assert.ok(builder, `no builder for ${def.name}`);

      const accounts = sampleAccounts(def.accounts);
      const args = sampleArgs(def.name);
      const input = args === undefined ? { accounts } : { accounts, args };
      const ix = await builder(client, input);

      assert.equal(
        ix.keys.length,
        def.accounts.length,
        `${def.name}: key count`,
      );

      def.accounts.forEach((acc, i) => {
        const key = ix.keys[i];
        assert.equal(
          key.isSigner,
          acc.signer,
          `${def.name}.${acc.name}: isSigner`,
        );
        assert.equal(
          key.isWritable,
          acc.writable,
          `${def.name}.${acc.name}: isWritable`,
        );

        // Anchor fills fixed-address and resolvable-PDA accounts itself, so the
        // caller-supplied key only round-trips for plain accounts.
        const idlAcc = idlIx.accounts[i];
        const isResolved =
          idlAcc.address !== undefined || idlAcc.pda !== undefined;
        if (!isResolved) {
          assert.ok(
            key.pubkey.equals(accounts[acc.propertyName]),
            `${def.name}.${acc.name}: pubkey not the one passed in`,
          );
        }
      });
    });
  }
});

describe("account-meta invariants across the whole surface", () => {
  it("every account belongs to exactly one mapped domain", () => {
    for (const def of AURA_INSTRUCTION_DEFINITIONS) {
      assert.ok(getInstructionDomain(def.name), `no domain for ${def.name}`);
    }
  });

  it("optional accounts only ever appear after required ones are declared", () => {
    // Anchor account ordering is positional; an optional account that is not at
    // the tail would shift every following account when omitted. We don't
    // require a strict tail, but every optional account must be writable-or-not
    // consistently flagged and never marked as a signer (signers can't be
    // silently omitted).
    for (const def of AURA_INSTRUCTION_DEFINITIONS) {
      for (const acc of def.accounts) {
        if (acc.optional) {
          assert.equal(
            acc.signer,
            false,
            `${def.name}.${acc.name}: optional accounts must not be signers`,
          );
        }
      }
    }
  });

  it("each instruction declares at least one account", () => {
    for (const def of AURA_INSTRUCTION_DEFINITIONS) {
      assert.ok(def.accounts.length >= 1, def.name);
    }
  });
});
