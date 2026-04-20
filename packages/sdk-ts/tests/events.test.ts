import assert from "node:assert/strict";
import test from "node:test";

import { EventDiscriminator, matchesEventDiscriminator } from "../src/index.js";

// EventDiscriminator values

test("EventDiscriminator: has all three event types", () => {
  assert.ok(Buffer.isBuffer(EventDiscriminator.treasuryAuditEvent));
  assert.ok(Buffer.isBuffer(EventDiscriminator.proposalLifecycleEvent));
  assert.ok(Buffer.isBuffer(EventDiscriminator.executionLifecycleEvent));
});

test("EventDiscriminator: each discriminator is 8 bytes", () => {
  assert.equal(EventDiscriminator.treasuryAuditEvent.length, 8);
  assert.equal(EventDiscriminator.proposalLifecycleEvent.length, 8);
  assert.equal(EventDiscriminator.executionLifecycleEvent.length, 8);
});

test("EventDiscriminator: all three are distinct", () => {
  assert.notDeepEqual(
    EventDiscriminator.treasuryAuditEvent,
    EventDiscriminator.proposalLifecycleEvent,
  );
  assert.notDeepEqual(
    EventDiscriminator.proposalLifecycleEvent,
    EventDiscriminator.executionLifecycleEvent,
  );
  assert.notDeepEqual(
    EventDiscriminator.treasuryAuditEvent,
    EventDiscriminator.executionLifecycleEvent,
  );
});

test("EventDiscriminator: treasuryAuditEvent matches expected bytes", () => {
  const expected = Buffer.from([209, 27, 57, 147, 169, 125, 166, 58]);
  assert.deepEqual(EventDiscriminator.treasuryAuditEvent, expected);
});

test("EventDiscriminator: proposalLifecycleEvent matches expected bytes", () => {
  const expected = Buffer.from([198, 23, 28, 210, 232, 47, 7, 199]);
  assert.deepEqual(EventDiscriminator.proposalLifecycleEvent, expected);
});

test("EventDiscriminator: executionLifecycleEvent matches expected bytes", () => {
  const expected = Buffer.from([170, 155, 187, 106, 242, 102, 71, 103]);
  assert.deepEqual(EventDiscriminator.executionLifecycleEvent, expected);
});

// matchesEventDiscriminator

test("matchesEventDiscriminator: returns true when prefix matches", () => {
  const disc = EventDiscriminator.treasuryAuditEvent;
  const data = Buffer.concat([disc, Buffer.from([1, 2, 3, 4])]);
  assert.ok(matchesEventDiscriminator(data, disc));
});

test("matchesEventDiscriminator: returns false when prefix differs", () => {
  const disc = EventDiscriminator.treasuryAuditEvent;
  const data = Buffer.concat([
    EventDiscriminator.proposalLifecycleEvent,
    Buffer.from([1, 2, 3, 4]),
  ]);
  assert.ok(!matchesEventDiscriminator(data, disc));
});

test("matchesEventDiscriminator: returns false for data shorter than 8 bytes", () => {
  const disc = EventDiscriminator.treasuryAuditEvent;
  assert.ok(!matchesEventDiscriminator(Buffer.from([1, 2, 3]), disc));
  assert.ok(!matchesEventDiscriminator(Buffer.alloc(0), disc));
});

test("matchesEventDiscriminator: returns true for exact 8-byte match", () => {
  const disc = EventDiscriminator.executionLifecycleEvent;
  assert.ok(matchesEventDiscriminator(disc, disc));
});
