/**
 * Error code table + parsing helpers.
 */

import assert from "node:assert/strict";
import test from "node:test";
import {
  AURA_ERROR_DEFINITIONS,
  AURA_IDL,
  AuraErrorCode,
  getAuraErrorCode,
  isAuraError,
  parseAuraError,
} from "../../src/index.js";

test("error definitions mirror the IDL error set", () => {
  assert.equal(AURA_ERROR_DEFINITIONS.length, AURA_IDL.errors.length);
  assert.equal(AURA_ERROR_DEFINITIONS.length, 140);
  assert.equal(
    Object.keys(AuraErrorCode).length,
    AURA_ERROR_DEFINITIONS.length,
  );
  for (const definition of AURA_ERROR_DEFINITIONS) {
    assert.equal(
      AuraErrorCode[definition.name as keyof typeof AuraErrorCode],
      definition.code,
      definition.name,
    );
  }
});

test("getAuraErrorCode handles common Anchor error shapes", () => {
  assert.equal(
    getAuraErrorCode({ code: AuraErrorCode.ExecutionPaused }),
    AuraErrorCode.ExecutionPaused,
  );
  assert.equal(
    getAuraErrorCode({
      error: { errorCode: { number: AuraErrorCode.NoPendingTransaction } },
    }),
    AuraErrorCode.NoPendingTransaction,
  );
  assert.equal(
    getAuraErrorCode(new Error("custom program error: 0x1770")),
    6000,
  );
  assert.equal(getAuraErrorCode("nothing here"), null);
  assert.equal(getAuraErrorCode(undefined), null);
});

test("parseAuraError resolves known codes and ignores unknown ones", () => {
  const parsed = parseAuraError({ code: AuraErrorCode.ExecutionPaused });
  assert.equal(parsed?.name, "ExecutionPaused");
  assert.equal(parsed?.code, AuraErrorCode.ExecutionPaused);
  assert.equal(typeof parsed?.message, "string");
  assert.equal(parseAuraError({ code: 999999 }), null);
  assert.equal(parseAuraError("not an error"), null);
});

test("isAuraError matches with and without a specific code", () => {
  const err = { code: AuraErrorCode.ExecutionPaused };
  assert.ok(isAuraError(err));
  assert.ok(isAuraError(err, AuraErrorCode.ExecutionPaused));
  assert.ok(!isAuraError(err, AuraErrorCode.UnauthorizedAi));
  assert.ok(!isAuraError("plain string"));
});
