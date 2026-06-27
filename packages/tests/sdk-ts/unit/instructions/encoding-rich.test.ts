/**
 * Instruction argument encoding — rich values.
 *
 * The baseline encoding test feeds all-zero / empty / null args, so Borsh's
 * `Some(...)` and non-empty-vec branches are never taken. This test rebuilds
 * every instruction with "rich" args — options populated, vecs holding an
 * element, scalars non-zero — and runs the same decode -> re-encode round-trip.
 * It exercises the encode/decode paths real callers hit and would catch a layout
 * that only works when a field happens to be empty/zero.
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
  richArgs,
  sampleAccounts,
} from "../../support/sample.js";

// biome-ignore lint/suspicious/noExplicitAny: Anchor's coder takes the runtime IDL object.
const coder = new BorshInstructionCoder(AURA_IDL as any);

describe("instruction argument encoding round-trips (rich values)", () => {
  for (const def of AURA_INSTRUCTION_DEFINITIONS) {
    it(`${def.name}: rich args decode and re-encode identically`, async () => {
      const client = offlineClient();
      const builder = resolveBuilder(def.name, def.methodName);
      assert.ok(builder, `no builder for ${def.name}`);

      const accounts = sampleAccounts(def.accounts);
      const args = richArgs(def.name);
      const input = args === undefined ? { accounts } : { accounts, args };
      const ix = await builder(client, input);

      const data = Buffer.from(ix.data);
      const decoded = coder.decode(data);
      assert.ok(decoded, `${def.name}: decode returned null`);
      assert.equal(decoded.name, def.name);

      const reencoded = coder.encode(decoded.name, decoded.data);
      assert.ok(
        bytesEqual(reencoded, data),
        `${def.name}: rich re-encode mismatch\n  built:     ${toHex(data)}\n  reencoded: ${toHex(reencoded)}`,
      );
    });
  }
});
