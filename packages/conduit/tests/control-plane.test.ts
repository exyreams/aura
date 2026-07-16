import { strict as assert } from "node:assert";
import { test } from "node:test";
import { HashChainedAuditLog } from "../src/core/control-plane/audit-log.js";
import { openConduitDb } from "../src/core/control-plane/db.js";
import { DeviceCodesRepo } from "../src/core/control-plane/device-codes.js";
import { createSqliteIdempotencyStore } from "../src/core/control-plane/idempotency-sqlite.js";
import { SessionsRepo } from "../src/core/control-plane/sessions.js";
import { SignRequestsRepo } from "../src/core/control-plane/sign-requests.js";

const VALID_PUBKEY = "11111111111111111111111111111111";

test("sessions repo round-trips a row + finds by token", () => {
  const db = openConduitDb({ inMemory: true });
  const sessions = new SessionsRepo(db);
  const created = sessions.create({
    agentId: "claude-code-laptop",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
    sessionPubkey: null,
    sessionSkWrapped: null,
    scopes: ["read", "propose"],
    autoApprove: "never",
    capsJson: "{}",
    metadata: { host: "laptop" },
    protocolVersion: 1,
    expiresAt: Date.now() + 90 * 86400000,
  });
  assert.ok(created.token.startsWith("aurak_live_"));
  const byToken = sessions.findByToken(created.token);
  assert.notEqual(byToken, null);
  assert.equal(byToken?.id, created.id);
  assert.equal(byToken?.agentId, "claude-code-laptop");
});

test("sessions repo rejects tokens with the wrong prefix", () => {
  const db = openConduitDb({ inMemory: true });
  const sessions = new SessionsRepo(db);
  assert.equal(sessions.findByToken("not_a_real_token"), null);
});

test("sessions repo revoke + heartbeat update the row", () => {
  const db = openConduitDb({ inMemory: true });
  const sessions = new SessionsRepo(db);
  const c = sessions.create({
    agentId: "a",
    ownerPubkey: VALID_PUBKEY,
    treasuryPubkey: VALID_PUBKEY,
    scopes: ["read"],
    autoApprove: "never",
    capsJson: "{}",
    metadata: {},
    protocolVersion: 1,
    expiresAt: Date.now() + 1000,
  });
  sessions.recordHeartbeat(c.id, 12345);
  sessions.revoke(c.id, 67890);
  const row = sessions.findById(c.id);
  assert.equal(row?.lastSeenAt, 12345);
  assert.equal(row?.revokedAt, 67890);
});

test("device-code repo mints a user_code and authorizes", () => {
  const db = openConduitDb({ inMemory: true });
  const repo = new DeviceCodesRepo(db);
  const created = repo.create({
    requestedScopes: ["read"],
    requestedCapsJson: "{}",
    requestedAgentId: "x",
    client: "aura-cli/test",
  });
  assert.match(created.userCode, /^[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  assert.equal(created.status, "pending");
  repo.authorize(created.deviceCode, "ses_abc");
  const updated = repo.findByDeviceCode(created.deviceCode);
  assert.equal(updated?.status, "authorized");
  assert.equal(updated?.approvedSessionId, "ses_abc");
});

test("sign-request repo lifecycle: create → signed → submitted", () => {
  const db = openConduitDb({ inMemory: true });
  const repo = new SignRequestsRepo(db);
  const sr = repo.create({
    ownerPubkey: VALID_PUBKEY,
    instructionName: "issue_session_key",
    unsignedTxB64: "AAAA",
    decodedSummary: { foo: "bar" },
    callerId: "cli",
  });
  assert.equal(sr.status, "pending");
  assert.ok(sr.nonce.length > 0);
  repo.markSigned(sr.id, "BBBB");
  repo.markSubmitted(sr.id, "sig123");
  const final = repo.findById(sr.id);
  assert.equal(final?.status, "submitted");
  assert.equal(final?.signature, "sig123");
});

test("audit log chains entries by hash and detects tampering", () => {
  const db = openConduitDb({ inMemory: true });
  const log = new HashChainedAuditLog(db);
  log.append({
    recordedAt: 1,
    sessionId: "s1",
    tool: "aura.whoami",
    argsHash: "h1",
    outcome: "ok",
  });
  const second = log.append({
    recordedAt: 2,
    sessionId: "s1",
    tool: "aura.whoami",
    argsHash: "h2",
    outcome: "ok",
  });
  assert.equal(log.verify().ok, true);
  // Corrupt one row's hash and verify detection.
  db.prepare(`UPDATE audit_log SET hash='deadbeef' WHERE seq=?`).run(
    second.seq,
  );
  const v = log.verify();
  assert.equal(v.ok, false);
  if (v.ok) return;
  assert.equal(v.brokenAt, second.seq);
});

test("sqlite idempotency store dedups under the configured TTL", () => {
  const db = openConduitDb({ inMemory: true });
  let now = 1_000_000;
  const store = createSqliteIdempotencyStore({
    db,
    ttlMs: 5000,
    now: () => now,
  });
  const key = store.computeKey({
    sessionId: "s",
    tool: "t",
    canonicalArgs: "{}",
  });
  assert.equal(store.get(key), undefined);
  store.put(key, { x: 1 });
  assert.deepEqual(store.get(key)?.value, { x: 1 });
  now += 10_000;
  assert.equal(store.get(key), undefined);
});
