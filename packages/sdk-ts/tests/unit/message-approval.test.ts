/**
 * `deriveMessageApprovalAddress` coverage.
 *
 * This PDA is derived on the external Ika dWallet program and mirrors
 * `aura-core::find_message_approval_pda`. The test reconstructs the seed layout
 * independently and checks determinism, sensitivity, the metadata-digest rule,
 * and input validation.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  DWALLET_SEED,
  deriveMessageApprovalAddress,
  MESSAGE_APPROVAL_SEED,
} from "../../src/index.js";

function u16Le(value: number): Buffer {
  const b = Buffer.alloc(2);
  b.writeUInt16LE(value);
  return b;
}

function manual(
  program: PublicKey,
  curveCode: number,
  publicKey: Uint8Array,
  schemeCode: number,
  digest: Uint8Array,
  metadataDigest?: Uint8Array,
): [PublicKey, number] {
  const payload = Buffer.concat([u16Le(curveCode), Buffer.from(publicKey)]);
  const seeds: Buffer[] = [DWALLET_SEED];
  for (let offset = 0; offset < payload.length; offset += 32) {
    seeds.push(payload.subarray(offset, offset + 32));
  }
  seeds.push(MESSAGE_APPROVAL_SEED, u16Le(schemeCode), Buffer.from(digest));
  if (metadataDigest?.some((b) => b !== 0)) {
    seeds.push(Buffer.from(metadataDigest));
  }
  return PublicKey.findProgramAddressSync(seeds, program);
}

test("matches the canonical dWallet seed layout (multi-chunk key + metadata)", () => {
  const program = Keypair.generate().publicKey;
  const publicKey = new Uint8Array(64).fill(0x44);
  const digest = new Uint8Array(32).fill(0xab);
  const metadataDigest = new Uint8Array(32).fill(0x55);

  const actual = deriveMessageApprovalAddress(
    program,
    2,
    publicKey,
    5,
    digest,
    metadataDigest,
  );
  const expected = manual(program, 2, publicKey, 5, digest, metadataDigest);
  assert.equal(actual[0].toBase58(), expected[0].toBase58());
  assert.equal(actual[1], expected[1]);
  assert.equal(PublicKey.isOnCurve(actual[0].toBytes()), false);
});

test("is deterministic and sensitive to publicKey and digest", () => {
  const program = Keypair.generate().publicKey;
  const key = new Uint8Array(32).fill(0x44);
  const digest = new Uint8Array(32).fill(0x01);
  assert.equal(
    deriveMessageApprovalAddress(program, 2, key, 5, digest)[0].toBase58(),
    deriveMessageApprovalAddress(program, 2, key, 5, digest)[0].toBase58(),
  );
  assert.notEqual(
    deriveMessageApprovalAddress(program, 2, key, 5, digest)[0].toBase58(),
    deriveMessageApprovalAddress(
      program,
      2,
      new Uint8Array(32).fill(0x45),
      5,
      digest,
    )[0].toBase58(),
  );
  assert.notEqual(
    deriveMessageApprovalAddress(program, 2, key, 5, digest)[0].toBase58(),
    deriveMessageApprovalAddress(
      program,
      2,
      key,
      5,
      new Uint8Array(32).fill(0x02),
    )[0].toBase58(),
  );
});

test("excludes an all-zero / omitted metadata digest, includes a non-zero one", () => {
  const program = Keypair.generate().publicKey;
  const key = new Uint8Array(32).fill(0x44);
  const digest = new Uint8Array(32).fill(0x01);
  const omitted = deriveMessageApprovalAddress(program, 2, key, 5, digest);
  const zero = deriveMessageApprovalAddress(
    program,
    2,
    key,
    5,
    digest,
    new Uint8Array(32),
  );
  const nonZero = deriveMessageApprovalAddress(
    program,
    2,
    key,
    5,
    digest,
    new Uint8Array(32).fill(0x55),
  );
  assert.equal(omitted[0].toBase58(), zero[0].toBase58());
  assert.notEqual(omitted[0].toBase58(), nonZero[0].toBase58());
});

test("rejects malformed seed inputs", () => {
  const program = Keypair.generate().publicKey;
  const key = new Uint8Array(32).fill(0x44);
  const digest = new Uint8Array(32).fill(0x01);
  assert.throws(
    () => deriveMessageApprovalAddress(program, 2, key, 5, new Uint8Array(16)),
    /32 bytes/,
  );
  assert.throws(
    () => deriveMessageApprovalAddress(program, -1, key, 5, digest),
    /u16/,
  );
  assert.throws(
    () =>
      deriveMessageApprovalAddress(program, 2, new Uint8Array(0), 5, digest),
    /publicKey/,
  );
  assert.throws(
    () =>
      deriveMessageApprovalAddress(
        program,
        2,
        key,
        5,
        digest,
        new Uint8Array(31),
      ),
    /32 bytes/,
  );
});
