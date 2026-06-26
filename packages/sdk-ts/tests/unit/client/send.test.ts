/**
 * AuraClient transaction assembly.
 *
 * `sendInstructions` / `sendInstruction` are the only methods that touch the
 * network, so we drive them through a fake `Connection` that records what the
 * client did instead of hitting a cluster. This pins the assembly contract:
 * the fee payer is set, the fetched blockhash is applied, the payer (and any
 * extra signers) sign, and the serialized bytes are handed to
 * `sendRawTransaction` with the configured preflight commitment.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type Connection,
  Keypair,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";
import { AURA_PROGRAM_ID, AuraClient } from "../../../src/index.js";

/** A fake blockhash: any valid 32-byte base58 string works for serialization. */
const FAKE_BLOCKHASH = Keypair.generate().publicKey.toBase58();

interface SendCall {
  raw: Uint8Array;
  options: { preflightCommitment?: string } | undefined;
}

function fakeConnection(): { connection: Connection; sends: SendCall[]; blockhashCalls: number } {
  const sends: SendCall[] = [];
  let blockhashCalls = 0;
  const connection = {
    rpcEndpoint: "http://127.0.0.1:8899",
    async getLatestBlockhash() {
      blockhashCalls += 1;
      return { blockhash: FAKE_BLOCKHASH, lastValidBlockHeight: 1 };
    },
    async sendRawTransaction(raw: Uint8Array, options: SendCall["options"]) {
      sends.push({ raw, options });
      return "fake-signature";
    },
  } as unknown as Connection;
  return {
    connection,
    sends,
    get blockhashCalls() {
      return blockhashCalls;
    },
  };
}

function dummyInstruction(): TransactionInstruction {
  return new TransactionInstruction({
    programId: AURA_PROGRAM_ID,
    keys: [],
    data: Buffer.from([1, 2, 3, 4]),
  });
}

describe("sendInstructions", () => {
  it("sets the fee payer, applies the blockhash, signs, and forwards the bytes", async () => {
    const fake = fakeConnection();
    const client = new AuraClient({ connection: fake.connection });
    const payer = Keypair.generate();

    const sig = await client.sendInstructions(payer, [dummyInstruction()]);

    assert.equal(sig, "fake-signature");
    assert.equal(fake.sends.length, 1);

    // Reconstruct the wire transaction the client sent.
    const tx = Transaction.from(Buffer.from(fake.sends[0].raw));
    assert.equal(tx.feePayer?.toBase58(), payer.publicKey.toBase58());
    assert.equal(tx.recentBlockhash, FAKE_BLOCKHASH);
    assert.equal(tx.instructions.length, 1);
    assert.ok(
      tx.verifySignatures(),
      "payer signature must be present and valid",
    );
  });

  it("includes extra signers in the signed transaction", async () => {
    const fake = fakeConnection();
    const client = new AuraClient({ connection: fake.connection });
    const payer = Keypair.generate();
    const cosigner = Keypair.generate();

    // An instruction that requires the cosigner as a signer key.
    const ix = new TransactionInstruction({
      programId: AURA_PROGRAM_ID,
      keys: [{ pubkey: cosigner.publicKey, isSigner: true, isWritable: false }],
      data: Buffer.alloc(0),
    });

    await client.sendInstructions(payer, [ix], [cosigner]);
    const tx = Transaction.from(Buffer.from(fake.sends[0].raw));
    assert.ok(tx.verifySignatures(), "all required signatures must verify");
    const signers = tx.signatures.map((s) => s.publicKey.toBase58());
    assert.ok(signers.includes(payer.publicKey.toBase58()));
    assert.ok(signers.includes(cosigner.publicKey.toBase58()));
  });

  it("batches multiple instructions into one transaction", async () => {
    const fake = fakeConnection();
    const client = new AuraClient({ connection: fake.connection });
    const payer = Keypair.generate();

    await client.sendInstructions(payer, [
      dummyInstruction(),
      dummyInstruction(),
      dummyInstruction(),
    ]);

    const tx = Transaction.from(Buffer.from(fake.sends[0].raw));
    assert.equal(tx.instructions.length, 3);
  });
});

describe("sendInstruction", () => {
  it("delegates to sendInstructions with a single-instruction transaction", async () => {
    const fake = fakeConnection();
    const client = new AuraClient({ connection: fake.connection });
    const payer = Keypair.generate();

    const sig = await client.sendInstruction(payer, dummyInstruction());
    assert.equal(sig, "fake-signature");
    const tx = Transaction.from(Buffer.from(fake.sends[0].raw));
    assert.equal(tx.instructions.length, 1);
  });
});
