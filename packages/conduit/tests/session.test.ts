import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ConduitError, isConduitError } from "../src/core/errors.js";
import { createStubSessionResolver } from "../src/core/session.js";

const VALID_PUBKEY = "11111111111111111111111111111111";

test("stub resolver returns the configured session when no credential provided", async () => {
  const resolver = createStubSessionResolver({
    agentId: "claude-code-laptop",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
  });
  const session = await resolver.resolve(undefined);
  assert.equal(session.agentId, "claude-code-laptop");
  assert.equal(session.ownerPubkey.toBase58(), VALID_PUBKEY);
  assert.equal(session.treasuryPubkey.toBase58(), VALID_PUBKEY);
  assert.equal(session.sessionPubkey, null);
  assert.deepEqual(session.scopes, ["read"]);
});

test("stub resolver accepts a credential with the aurak_ prefix", async () => {
  const resolver = createStubSessionResolver({
    agentId: "agent",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
  });
  const session = await resolver.resolve("aurak_live_abc123");
  assert.equal(session.agentId, "agent");
});

test("stub resolver rejects a credential without the aurak_ prefix", async () => {
  const resolver = createStubSessionResolver({
    agentId: "agent",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
  });
  await assert.rejects(
    () => resolver.resolve("not-a-real-token"),
    (err: unknown) => {
      assert.equal(isConduitError(err), true);
      if (isConduitError(err)) {
        assert.equal(err.code, "unauthenticated");
      }
      return true;
    },
  );
});

test("stub resolver propagates custom scopes and metadata", async () => {
  const resolver = createStubSessionResolver({
    agentId: "agent",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
    scopes: ["read", "propose"],
    metadata: { host: "laptop" },
  });
  const session = await resolver.resolve(undefined);
  assert.deepEqual([...session.scopes], ["read", "propose"]);
  assert.equal(session.metadata.host, "laptop");
});

test("ConduitError is the rejection type used by the resolver", async () => {
  // Sanity: keep the contract explicit.
  assert.equal(ConduitError.name, "ConduitError");
});
