import { strict as assert } from "node:assert";
import { test } from "node:test";

import { Keypair, SystemProgram, Transaction } from "@solana/web3.js";
import { isConduitError } from "../src/core/errors.js";
import { InMemorySigningService } from "../src/core/signing/in-memory.js";
import { KmsSigningServiceStub } from "../src/core/signing/kms-stub.js";

test("in-memory signing service signs a transaction with the registered keypair", async () => {
  const kp = Keypair.generate();
  const svc = new InMemorySigningService();
  svc.register("ses_x", kp);

  const tx = new Transaction({
    feePayer: kp.publicKey,
    recentBlockhash: "11111111111111111111111111111111",
  });
  tx.add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: kp.publicKey,
      lamports: 0,
    }),
  );

  const result = await svc.sign({ sessionId: "ses_x", transaction: tx });
  assert.equal(result.publicKey.toBase58(), kp.publicKey.toBase58());
});

test("in-memory signing throws unauthenticated for unregistered sessions", async () => {
  const svc = new InMemorySigningService();
  await assert.rejects(svc.publicKeyFor("unknown"), (err: unknown) => {
    assert.equal(isConduitError(err), true);
    if (isConduitError(err)) assert.equal(err.code, "unauthenticated");
    return true;
  });
});

test("in-memory signing enforces a per-second rate limit", async () => {
  const kp = Keypair.generate();
  const now = 0;
  const svc = new InMemorySigningService({
    maxSignsPerSecond: 1,
    now: () => now,
  });
  svc.register("ses_x", kp);
  const tx1 = new Transaction({
    feePayer: kp.publicKey,
    recentBlockhash: "11111111111111111111111111111111",
  });
  tx1.add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: kp.publicKey,
      lamports: 0,
    }),
  );
  const tx2 = new Transaction({
    feePayer: kp.publicKey,
    recentBlockhash: "11111111111111111111111111111111",
  });
  tx2.add(
    SystemProgram.transfer({
      fromPubkey: kp.publicKey,
      toPubkey: kp.publicKey,
      lamports: 0,
    }),
  );
  await svc.sign({ sessionId: "ses_x", transaction: tx1 });
  await assert.rejects(
    svc.sign({ sessionId: "ses_x", transaction: tx2 }),
    (err: unknown) => {
      assert.equal(isConduitError(err), true);
      if (isConduitError(err)) assert.equal(err.code, "rate_limited");
      return true;
    },
  );
});

test("KMS stub refuses every call until real impl lands", async () => {
  const stub = new KmsSigningServiceStub({
    endpoint: "https://kms.example",
    kmsKey: "arn",
  });
  await assert.rejects(stub.publicKeyFor("ses_x"), (err: unknown) => {
    assert.equal(isConduitError(err), true);
    if (isConduitError(err)) assert.equal(err.code, "upstream_unavailable");
    return true;
  });
});
