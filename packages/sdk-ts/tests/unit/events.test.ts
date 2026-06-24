/**
 * Event discriminators + parsing helpers.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  AURA_IDL,
  EVENT_DISCRIMINATORS,
  EventDiscriminator,
  matchesEventDiscriminator,
  parseAuraEvents,
} from "../../src/index.js";
import { offlineClient } from "../support/offline.js";

function camel(name: string): string {
  return name.charAt(0).toLowerCase() + name.slice(1);
}

const discriminators = EventDiscriminator as unknown as Record<string, Buffer>;

test("EventDiscriminator mirrors the IDL event discriminator bytes", () => {
  assert.equal(Object.keys(EventDiscriminator).length, AURA_IDL.events.length);
  for (const event of AURA_IDL.events) {
    assert.deepEqual(
      discriminators[camel(event.name)],
      Buffer.from(event.discriminator),
    );
  }
  assert.strictEqual(EVENT_DISCRIMINATORS, EventDiscriminator);
});

test("matchesEventDiscriminator checks exact 8-byte prefixes", () => {
  const disc = EventDiscriminator.treasuryAuditEvent;
  assert.ok(
    matchesEventDiscriminator(Buffer.concat([disc, Buffer.from([1, 2])]), disc),
  );
  assert.ok(matchesEventDiscriminator(disc, disc));
  assert.ok(!matchesEventDiscriminator(Buffer.from([1, 2, 3]), disc));
  assert.ok(
    !matchesEventDiscriminator(EventDiscriminator.proposalLifecycleEvent, disc),
  );
});

test("parseAuraEvents returns an empty list when there are no program logs", () => {
  const client = offlineClient();
  assert.deepEqual(parseAuraEvents(client, []), []);
});
