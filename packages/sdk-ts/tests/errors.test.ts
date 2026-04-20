import assert from "node:assert/strict";
import test from "node:test";

import {
  AuraErrorCode,
  getAuraErrorCode,
  isAuraError,
} from "../src/index.js";

// AuraErrorCode values

test("AuraErrorCode: all codes start at 6000", () => {
  assert.equal(AuraErrorCode.UnauthorizedAi, 6000);
  assert.equal(AuraErrorCode.UnauthorizedOwner, 6001);
  assert.equal(AuraErrorCode.InvalidGuardianConfiguration, 6026);
});

test("AuraErrorCode: has 27 entries", () => {
  assert.equal(Object.keys(AuraErrorCode).length, 27);
});

// isAuraError

test("isAuraError: matches on correct code", () => {
  const err = { code: 6017 };
  assert.ok(isAuraError(err, AuraErrorCode.ExecutionPaused));
});

test("isAuraError: returns false for wrong code", () => {
  const err = { code: 6017 };
  assert.ok(!isAuraError(err, AuraErrorCode.UnauthorizedAi));
});

test("isAuraError: returns false for null", () => {
  assert.ok(!isAuraError(null, AuraErrorCode.ExecutionPaused));
});

test("isAuraError: returns false for non-object", () => {
  assert.ok(!isAuraError("error string", AuraErrorCode.ExecutionPaused));
  assert.ok(!isAuraError(42, AuraErrorCode.ExecutionPaused));
});

test("isAuraError: returns false when code field is missing", () => {
  assert.ok(!isAuraError({}, AuraErrorCode.ExecutionPaused));
});

// getAuraErrorCode

test("getAuraErrorCode: extracts code from error object", () => {
  assert.equal(getAuraErrorCode({ code: 6004 }), 6004);
});

test("getAuraErrorCode: returns null for null", () => {
  assert.equal(getAuraErrorCode(null), null);
});

test("getAuraErrorCode: returns null for non-object", () => {
  assert.equal(getAuraErrorCode("string"), null);
});

test("getAuraErrorCode: returns null when code is missing", () => {
  assert.equal(getAuraErrorCode({}), null);
});

test("getAuraErrorCode: returns null when code is not a number", () => {
  assert.equal(getAuraErrorCode({ code: "6000" }), null);
});
