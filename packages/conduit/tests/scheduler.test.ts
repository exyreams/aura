import { strict as assert } from "node:assert";
import { test } from "node:test";

import { openConduitDb } from "../src/core/control-plane/db.js";
import { DeviceCodesRepo } from "../src/core/control-plane/device-codes.js";
import { SignRequestsRepo } from "../src/core/control-plane/sign-requests.js";
import { startScheduler } from "../src/core/scheduler.js";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

test("scheduler expires stale device codes and sign requests", async () => {
  const db = openConduitDb({ inMemory: true });
  const codes = new DeviceCodesRepo(db);
  const signRequests = new SignRequestsRepo(db);

  const code = codes.create(
    {
      requestedScopes: ["read"],
      requestedCapsJson: "{}",
      requestedAgentId: "x",
      client: "test",
      expiresInSecs: 0,
      intervalSecs: 5,
    },
    1_000,
  );
  signRequests.create(
    {
      ownerPubkey: "11111111111111111111111111111111",
      instructionName: "ix",
      unsignedTxB64: "",
      decodedSummary: {},
      callerId: "test",
      ttlSecs: 0,
    },
    1_000,
  );

  const seen: string[] = [];
  const running = startScheduler({
    db,
    intervals: {
      expirySweepMs: 5_000,
      heartbeatSweepMs: 5_000,
      idempotencyPruneMs: 5_000,
    },
    onSweep: (job) => seen.push(job),
  });

  await sleep(50);
  await running.stop();

  assert.equal(codes.findByDeviceCode(code.deviceCode)?.status, "expired");
  assert.ok(seen.includes("expiry"));
});

test("scheduler prunes idempotency rows past TTL", async () => {
  const db = openConduitDb({ inMemory: true });
  db.prepare(
    `INSERT INTO idempotency (key, session_id, tool, value_json, created_at) VALUES (?,?,?,?,?)`,
  ).run("k1", "s", "t", "{}", 0);
  db.prepare(
    `INSERT INTO idempotency (key, session_id, tool, value_json, created_at) VALUES (?,?,?,?,?)`,
  ).run("k2", "s", "t", "{}", Date.now());

  const running = startScheduler({
    db,
    intervals: {
      expirySweepMs: 5_000,
      heartbeatSweepMs: 5_000,
      idempotencyPruneMs: 20,
    },
    idempotencyTtlMs: 1_000,
  });

  await sleep(60);
  await running.stop();

  const remaining = db
    .prepare(`SELECT COUNT(*) AS n FROM idempotency`)
    .get() as { n: number };
  assert.equal(remaining.n, 1);
});
