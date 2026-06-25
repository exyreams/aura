/** Output primitives: JSON serialization, panels, key/value rendering. */

import assert from "node:assert/strict";
import test from "node:test";

import { PublicKey, TransactionInstruction } from "@solana/web3.js";
import BN from "bn.js";

import {
  keyValueLines,
  renderPanel,
  serializeForJson,
  serializeInstruction,
} from "../../src/ui/output.js";
import { setColorEnabled } from "../../src/ui/theme.js";

// Deterministic, color-free strings for assertions.
setColorEnabled(false);

const PK = new PublicKey("11111111111111111111111111111111");

test("serializeForJson converts PublicKey, BN, Buffer, and nested structures", () => {
  const out = serializeForJson({
    key: PK,
    amount: new BN(42),
    blob: Buffer.from([1, 2, 3]),
    list: [new BN(1), PK],
    nested: { inner: new BN(2) },
  }) as Record<string, unknown>;

  assert.equal(out.key, PK.toBase58());
  assert.equal(out.amount, "42");
  assert.equal(out.blob, Buffer.from([1, 2, 3]).toString("base64"));
  assert.deepEqual(out.list, ["1", PK.toBase58()]);
  assert.deepEqual(out.nested, { inner: "2" });
});

test("keyValueLines aligns labels", () => {
  const lines = keyValueLines([
    ["a", "1"],
    ["longer", "2"],
  ]);
  assert.equal(lines.length, 2);
  assert.match(lines[0], /a\s+1/);
  assert.match(lines[1], /longer\s+2/);
});

test("renderPanel includes the title and every body line", () => {
  const panel = renderPanel(
    "Create treasury",
    ["network devnet", "payer 7Vap…"],
    "primary",
  );
  assert.match(panel, /Create treasury/);
  assert.match(panel, /network devnet/);
  assert.match(panel, /payer 7Vap…/);
});

test("serializeInstruction produces a portable shape", () => {
  const ix = new TransactionInstruction({
    programId: PK,
    keys: [{ pubkey: PK, isSigner: true, isWritable: false }],
    data: Buffer.from([7, 8, 9]),
  });
  const serialized = serializeInstruction(ix);
  assert.equal(serialized.programId, PK.toBase58());
  assert.equal(serialized.accounts.length, 1);
  assert.equal(serialized.accounts[0].isSigner, true);
  assert.equal(serialized.accounts[0].isWritable, false);
  assert.equal(
    serialized.dataBase64,
    Buffer.from([7, 8, 9]).toString("base64"),
  );
});
