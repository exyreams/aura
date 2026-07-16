import { strict as assert } from "node:assert";
import { test } from "node:test";

import { openConduitDb } from "../src/core/control-plane/db.js";
import { SessionsRepo } from "../src/core/control-plane/sessions.js";
import { isConduitError } from "../src/core/errors.js";
import { AnomalyHeuristics } from "../src/core/safety/anomaly.js";
import { CircuitBreaker } from "../src/core/safety/circuit-breaker.js";
import { HeartbeatMonitor } from "../src/core/safety/heartbeat.js";
import { RateLimiter } from "../src/core/safety/rate-limit.js";

const VALID_PUBKEY = "11111111111111111111111111111111";

test("rate limiter throws once the per-second budget is exhausted", () => {
  let now = 1_000_000;
  const db = openConduitDb({ inMemory: true });
  const limiter = new RateLimiter({
    db,
    defaults: {
      readPerSecond: 2,
      readPerMinute: 100,
      readPerDay: 1000,
      writePerSecond: 1,
      writePerMinute: 10,
      writePerDay: 100,
    },
    now: () => now,
  });
  limiter.consume("ses_x", "read");
  limiter.consume("ses_x", "read");
  assert.throws(
    () => limiter.consume("ses_x", "read"),
    (err: unknown) => {
      assert.equal(isConduitError(err), true);
      if (isConduitError(err)) assert.equal(err.code, "rate_limited");
      return true;
    },
  );
  now += 1500;
  // window crossed — fresh budget
  limiter.consume("ses_x", "read");
});

test("circuit breaker pauses after N rejections in M seconds", () => {
  const now = 5_000_000;
  const db = openConduitDb({ inMemory: true });
  const breaker = new CircuitBreaker({
    db,
    thresholdN: 3,
    thresholdWindowSecs: 60,
    pauseDurationSecs: 600,
    now: () => now,
  });
  // not paused initially
  breaker.assertNotPaused(VALID_PUBKEY);
  for (let i = 0; i < 3; i += 1) breaker.recordRejection(VALID_PUBKEY, "boom");
  assert.throws(
    () => breaker.assertNotPaused(VALID_PUBKEY),
    (err: unknown) => {
      assert.equal(isConduitError(err), true);
      if (isConduitError(err)) assert.equal(err.code, "forbidden");
      return true;
    },
  );
  breaker.reset(VALID_PUBKEY);
  breaker.assertNotPaused(VALID_PUBKEY);
});

test("heartbeat sweep downgrades silent sessions to auto_approve=never", () => {
  let now = 9_000_000_000;
  const db = openConduitDb({ inMemory: true });
  const sessions = new SessionsRepo(db);
  const created = sessions.create({
    agentId: "a",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
    scopes: ["read"],
    autoApprove: "within_encrypted_limits",
    capsJson: "{}",
    metadata: {},
    protocolVersion: 1,
    expiresAt: now + 86_400_000 * 365,
  });
  // mark as recently active first
  sessions.recordHeartbeat(created.id, now);
  const heartbeat = new HeartbeatMonitor({
    db,
    silenceWindowDays: 7,
    now: () => now,
  });
  assert.deepEqual(heartbeat.sweepAndDowngrade(), []);
  // advance time past the window and sweep again
  now += 86_400_000 * 8;
  const downgraded = heartbeat.sweepAndDowngrade();
  assert.deepEqual(downgraded, [created.id]);
  const after = sessions.findById(created.id);
  assert.equal(after?.autoApprove, "never");
});

test("anomaly heuristics flag a brand-new destination", () => {
  const db = openConduitDb({ inMemory: true });
  const a = new AnomalyHeuristics({ db });
  const evaluation = a.evaluate(VALID_PUBKEY, "newDestination", 100n);
  assert.equal(evaluation.noveltyFlagged, true);
  a.observeDestination(VALID_PUBKEY, "newDestination");
  const again = a.evaluate(VALID_PUBKEY, "newDestination", 100n);
  assert.equal(again.noveltyFlagged, false);
});
