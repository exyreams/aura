/**
 * Program error parsing.
 *
 * `getAuraErrorCode` / `parseAuraError` / `isAuraError` are what callers use to
 * turn the many shapes a failed Solana transaction can take into a stable AURA
 * error. We cover every recognized shape, the boundary between hex and decimal
 * parsing, and the cases that must return null/false so callers don't
 * mis-attribute an unrelated failure to AURA.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AuraErrorCode } from "../../../src/errors/codes.js";
import {
  getAuraErrorCode,
  isAuraError,
  parseAuraError,
} from "../../../src/errors/parse.js";

describe("getAuraErrorCode — recognized shapes", () => {
  it("reads a numeric `code` field", () => {
    assert.equal(getAuraErrorCode({ code: 6018 }), 6018);
  });

  it("reads an Anchor `error.errorCode.number` field", () => {
    assert.equal(
      getAuraErrorCode({ error: { errorCode: { number: 6044 } } }),
      6044,
    );
  });

  it("parses the hex `custom program error` form from an Error message", () => {
    // 6018 = 0x1782
    const err = new Error("Transaction failed: custom program error: 0x1782");
    assert.equal(getAuraErrorCode(err), 6018);
  });

  it("parses the hex form from a plain string", () => {
    assert.equal(getAuraErrorCode("custom program error: 0x1770"), 6000);
  });

  it("hex parsing is case-insensitive", () => {
    assert.equal(getAuraErrorCode("custom program error: 0x1A"), 26);
  });

  it("prefers a numeric code field over a message", () => {
    const candidate = {
      code: 6005,
      message: "custom program error: 0x1782",
    };
    assert.equal(getAuraErrorCode(candidate), 6005);
  });
});

describe("getAuraErrorCode — unrecognized inputs return null", () => {
  it("plain message with no custom-error fragment", () => {
    assert.equal(getAuraErrorCode(new Error("blockhash not found")), null);
  });

  it("non-error primitives", () => {
    assert.equal(getAuraErrorCode(undefined), null);
    assert.equal(getAuraErrorCode(null), null);
    assert.equal(getAuraErrorCode(42), null);
    assert.equal(getAuraErrorCode("just a string"), null);
  });

  it("object without a code or message fragment", () => {
    assert.equal(getAuraErrorCode({ foo: "bar" }), null);
  });
});

describe("parseAuraError", () => {
  it("resolves a known code to its definition and preserves the cause", () => {
    const cause = { code: AuraErrorCode.ExecutionPaused };
    const parsed = parseAuraError(cause);
    assert.ok(parsed);
    assert.equal(parsed.code, 6018);
    assert.equal(parsed.name, "ExecutionPaused");
    assert.equal(parsed.message, "execution is paused");
    assert.equal(parsed.cause, cause);
  });

  it("returns null for a code outside the AURA range", () => {
    assert.equal(parseAuraError({ code: 9999 }), null);
  });

  it("returns null for an unrecognized error", () => {
    assert.equal(parseAuraError(new Error("network down")), null);
  });

  it("resolves the hex form end to end", () => {
    const parsed = parseAuraError("custom program error: 0x1770");
    assert.ok(parsed);
    assert.equal(parsed.name, "UnauthorizedAi");
  });
});

describe("isAuraError", () => {
  it("true for any AURA error when no code is given", () => {
    assert.equal(isAuraError({ code: 6021 }), true);
  });

  it("true only for the matching code when a code is given", () => {
    assert.equal(isAuraError({ code: 6021 }, AuraErrorCode.InvalidChain), true);
    assert.equal(
      isAuraError({ code: 6021 }, AuraErrorCode.ExecutionPaused),
      false,
    );
  });

  it("false for non-AURA errors", () => {
    assert.equal(isAuraError(new Error("oops")), false);
    assert.equal(isAuraError(null), false);
  });
});
