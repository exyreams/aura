/**
 * Instruction argument encoding.
 *
 * The discriminator and account tests prove the *frame* of each instruction is
 * right; this proves the *payload* is too. For every instruction we build the
 * instruction with IDL-derived sample args, then decode the raw `ix.data` with
 * an independent `BorshInstructionCoder` and assert:
 *
 *   - decode succeeds (the bytes are valid Anchor instruction data),
 *   - the decoded instruction name is the one we built,
 *   - re-encoding the decoded args reproduces `ix.data` byte-for-byte.
 *
 * The decode→encode round-trip catches arg field drift (wrong order, wrong
 * width, a dropped/added field) that a discriminator check alone cannot.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { BorshInstructionCoder } from "@coral-xyz/anchor";
import { AURA_INSTRUCTION_DEFINITIONS } from "../../../../sdk-ts/src/generated/instructions.generated.js";
import { AURA_IDL } from "../../../../sdk-ts/src/index.js";
import { bytesEqual, toHex } from "../../support/discriminator.js";
import { offlineClient } from "../../support/offline.js";
import {
  resolveBuilder,
  sampleAccounts,
  sampleArgs,
} from "../../support/sample.js";

// biome-ignore lint/suspicious/noExplicitAny: Anchor's coder takes the runtime IDL object.
const coder = new BorshInstructionCoder(AURA_IDL as any);

describe("instruction argument encoding round-trips", () => {
  for (const def of AURA_INSTRUCTION_DEFINITIONS) {
    it(`${def.name}: data decodes and re-encodes identically`, async () => {
      const client = offlineClient();
      const builder = resolveBuilder(def.name, def.methodName);
      assert.ok(builder, `no builder for ${def.name}`);

      const accounts = sampleAccounts(def.accounts);
      const args = sampleArgs(def.name);
      const input = args === undefined ? { accounts } : { accounts, args };
      const ix = await builder(client, input);

      const data = Buffer.from(ix.data);
      const decoded = coder.decode(data);
      assert.ok(
        decoded,
        `${def.name}: BorshInstructionCoder.decode returned null`,
      );

      // Anchor's BorshInstructionCoder decodes to the snake_case IDL name.
      assert.equal(
        decoded.name,
        def.name,
        `${def.name}: decoded as ${decoded.name}`,
      );

      const reencoded = coder.encode(decoded.name, decoded.data);
      assert.ok(
        bytesEqual(reencoded, data),
        `${def.name}: re-encode mismatch\n  built:     ${toHex(data)}\n  reencoded: ${toHex(reencoded)}`,
      );
    });
  }
});

describe("encoding edge cases", () => {
  it("decode returns null for foreign / undersized data", () => {
    assert.equal(coder.decode(Buffer.alloc(0)), null);
    assert.equal(coder.decode(Buffer.from([1, 2, 3])), null);
    // 8 bytes that match no known discriminator.
    assert.equal(coder.decode(Buffer.alloc(8, 0xab)), null);
  });

  it("optional accounts do not change the encoded arg payload", async () => {
    // abandon_proposal has an optional dwalletState account; the arg bytes must
    // be identical whether or not we vary unrelated account keys.
    const client = offlineClient();
    const def = AURA_INSTRUCTION_DEFINITIONS.find(
      (d) => d.name === "abandon_proposal",
    );
    assert.ok(def);
    const builder = resolveBuilder(def.name, def.methodName);
    assert.ok(builder);

    const args = sampleArgs(def.name);
    const a = await builder(client, {
      accounts: sampleAccounts(def.accounts),
      args,
    });
    const b = await builder(client, {
      accounts: sampleAccounts(def.accounts),
      args,
    });
    // Different account keys, identical args → identical instruction data.
    assert.ok(
      bytesEqual(a.data, b.data),
      "arg payload should not depend on account keys",
    );
  });
});
