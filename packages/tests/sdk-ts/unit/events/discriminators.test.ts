/**
 * Event discriminator integrity.
 *
 * Same triangulation as instructions, for the 4 program events: SDK bytes ==
 * IDL bytes == independent `sha256("event:<Name>")[0..8]`. The SDK keys events
 * by camelCase name; the IDL uses PascalCase, so we map between them and assert
 * the full set lines up with no extras or omissions.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  EVENT_DISCRIMINATORS,
  EventDiscriminator,
} from "../../../../sdk-ts/src/events/discriminators.js";
import {
  bytesEqual,
  eventDiscriminator,
  toHex,
} from "../../support/discriminator.js";
import { idlEvents } from "../../support/idl.js";

/** PascalCase IDL event name -> SDK camelCase key. */
function camelKey(pascalName: string): string {
  return pascalName.charAt(0).toLowerCase() + pascalName.slice(1);
}

describe("event discriminators", () => {
  it("the IDL declares exactly 4 events", () => {
    assert.equal(idlEvents.length, 4);
  });

  it("EVENT_DISCRIMINATORS is the same object as EventDiscriminator", () => {
    assert.equal(EVENT_DISCRIMINATORS, EventDiscriminator);
  });

  it("SDK keys cover exactly the IDL event set", () => {
    const sdkKeys = new Set(Object.keys(EventDiscriminator));
    const idlKeys = new Set(idlEvents.map((e) => camelKey(e.name)));
    assert.equal(sdkKeys.size, idlKeys.size);
    for (const key of idlKeys) {
      assert.ok(sdkKeys.has(key), `SDK is missing event ${key}`);
    }
  });

  for (const event of idlEvents) {
    const key = camelKey(event.name);
    it(`${event.name}: SDK == IDL == sha256("event:${event.name}")`, () => {
      const sdkBytes =
        EventDiscriminator[key as keyof typeof EventDiscriminator];
      assert.ok(sdkBytes, `no SDK discriminator for ${key}`);
      assert.equal(sdkBytes.length, 8, `${key}: length`);

      const oracle = eventDiscriminator(event.name);
      assert.ok(
        bytesEqual(sdkBytes, oracle),
        `SDK ${toHex(sdkBytes)} != oracle ${toHex(oracle)}`,
      );
      assert.ok(
        bytesEqual(event.discriminator, oracle),
        `IDL ${toHex(event.discriminator)} != oracle ${toHex(oracle)}`,
      );
    });
  }

  it("all event discriminators are unique", () => {
    const seen = new Set<string>();
    for (const bytes of Object.values(EventDiscriminator)) {
      const hex = toHex(bytes);
      assert.ok(!seen.has(hex), `collision on ${hex}`);
      seen.add(hex);
    }
  });
});
