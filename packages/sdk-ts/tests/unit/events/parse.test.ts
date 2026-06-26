/**
 * Event parsing helpers (offline portions).
 *
 * `matchesEventDiscriminator` is pure byte logic and is covered exhaustively
 * here. `parseAuraEvents` runs Anchor's `EventParser` over program logs; the
 * offline guarantees we can pin without a live transaction are that empty and
 * event-free logs yield no events and never throw. Real emission round-trips
 * (logs produced by an actual transaction) live in the devnet suite.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { EventDiscriminator } from "../../../src/events/discriminators.js";
import {
  matchesEventDiscriminator,
  parseAuraEvents,
} from "../../../src/events/parse.js";
import { offlineClient } from "../../support/offline.js";

describe("matchesEventDiscriminator", () => {
  const disc = EventDiscriminator.treasuryAuditEvent;

  it("true when the data begins with the discriminator", () => {
    const data = Buffer.concat([disc, Buffer.from([1, 2, 3, 4])]);
    assert.equal(matchesEventDiscriminator(data, disc), true);
  });

  it("true when the data is exactly the discriminator", () => {
    assert.equal(matchesEventDiscriminator(Buffer.from(disc), disc), true);
  });

  it("false when the prefix differs", () => {
    const data = Buffer.concat([
      EventDiscriminator.proposalLifecycleEvent,
      Buffer.from([0, 0]),
    ]);
    assert.equal(matchesEventDiscriminator(data, disc), false);
  });

  it("false when the data is shorter than the discriminator", () => {
    assert.equal(
      matchesEventDiscriminator(Buffer.from([1, 2, 3]), disc),
      false,
    );
    assert.equal(matchesEventDiscriminator(Buffer.alloc(0), disc), false);
  });
});

describe("parseAuraEvents (offline)", () => {
  it("returns an empty array for empty logs", () => {
    const client = offlineClient();
    assert.deepEqual(parseAuraEvents(client, []), []);
  });

  it("returns an empty array when no log carries program event data", () => {
    const client = offlineClient();
    const logs = [
      "Program auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce invoke [1]",
      "Program log: just a normal log line",
      "Program auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce success",
    ];
    assert.deepEqual(parseAuraEvents(client, logs), []);
  });
});
