/**
 * Instruction discriminator integrity.
 *
 * Triangulates three independent sources for every one of the 161 instruction
 * discriminators so a drift in any single one is caught:
 *
 *   1. the generated IDL bytes (`aura_core.json`)
 *   2. the generated SDK definitions (`AURA_INSTRUCTION_DEFINITIONS`)
 *   3. an independent `sha256("global:<name>")[0..8]` oracle that shares no
 *      code with the SDK or the IDL generator
 *
 * If the SDK and IDL ever agree with each other but both diverge from Anchor's
 * actual hashing rule, the oracle column catches it.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AURA_INSTRUCTION_DEFINITIONS } from "../../../src/generated/instructions.generated.js";
import {
  bytesEqual,
  instructionDiscriminator,
  toHex,
} from "../../support/discriminator.js";
import { findInstruction, idlInstructions } from "../../support/idl.js";

const definitionByName = new Map(
  AURA_INSTRUCTION_DEFINITIONS.map((def) => [def.name, def]),
);

describe("instruction discriminators", () => {
  it("the IDL declares exactly 161 instructions", () => {
    assert.equal(idlInstructions.length, 161);
  });

  it("SDK definitions and IDL cover the same instruction set", () => {
    const idlNames = new Set(idlInstructions.map((ix) => ix.name));
    const sdkNames = new Set(AURA_INSTRUCTION_DEFINITIONS.map((d) => d.name));
    assert.equal(sdkNames.size, idlNames.size);
    for (const name of idlNames) {
      assert.ok(sdkNames.has(name), `SDK is missing instruction ${name}`);
    }
  });

  for (const ix of idlInstructions) {
    it(`${ix.name}: IDL == SDK == sha256("global:${ix.name}")`, () => {
      const oracle = instructionDiscriminator(ix.name);

      // 1. IDL bytes vs the oracle.
      assert.ok(
        bytesEqual(ix.discriminator, oracle),
        `IDL ${toHex(ix.discriminator)} != oracle ${toHex(oracle)}`,
      );

      // 2. SDK definition bytes vs the oracle.
      const def = definitionByName.get(ix.name);
      assert.ok(def, `no SDK definition for ${ix.name}`);
      assert.ok(
        bytesEqual(def.discriminator, oracle),
        `SDK ${toHex(def.discriminator)} != oracle ${toHex(oracle)}`,
      );
    });
  }

  it("all 161 discriminators are unique", () => {
    const seen = new Map<string, string>();
    for (const ix of idlInstructions) {
      const hex = toHex(ix.discriminator);
      const prior = seen.get(hex);
      assert.equal(
        prior,
        undefined,
        `collision: ${ix.name} and ${prior} share ${hex}`,
      );
      seen.set(hex, ix.name);
    }
  });

  it("every discriminator is exactly 8 bytes", () => {
    for (const ix of idlInstructions) {
      assert.equal(ix.discriminator.length, 8, ix.name);
      assert.ok(findInstruction(ix.name), ix.name);
    }
  });
});
