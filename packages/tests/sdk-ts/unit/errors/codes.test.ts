/**
 * Program error code table.
 *
 * The SDK ships a hand-free generated copy of the program's `#[error_code]`
 * enum. These tests pin it to the IDL error set the program actually declares:
 * same count, same codes, same names, same messages — and the `AuraErrorCode`
 * name→code map agrees with the definition list. A drift in any single error
 * (renamed, renumbered, message edited, added, removed) fails here.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AURA_ERROR_DEFINITIONS,
  AuraErrorCode,
} from "../../../../sdk-ts/src/errors/codes.js";
import { idlErrors } from "../../support/idl.js";

describe("error definition table", () => {
  it("declares exactly 140 errors (codes 6000..6139)", () => {
    assert.equal(AURA_ERROR_DEFINITIONS.length, 140);
  });

  it("covers the same set as the IDL", () => {
    assert.equal(AURA_ERROR_DEFINITIONS.length, idlErrors.length);
  });

  it("codes are contiguous starting at 6000", () => {
    AURA_ERROR_DEFINITIONS.forEach((def, i) => {
      assert.equal(def.code, 6000 + i, `index ${i}`);
    });
  });

  it("codes are unique", () => {
    const codes = new Set(AURA_ERROR_DEFINITIONS.map((d) => d.code));
    assert.equal(codes.size, AURA_ERROR_DEFINITIONS.length);
  });

  it("names are unique", () => {
    const names = new Set(AURA_ERROR_DEFINITIONS.map((d) => d.name));
    assert.equal(names.size, AURA_ERROR_DEFINITIONS.length);
  });
});

describe("SDK error table mirrors the IDL", () => {
  const idlByCode = new Map(idlErrors.map((e) => [e.code, e]));

  for (const def of AURA_ERROR_DEFINITIONS) {
    it(`${def.code} ${def.name}: code, name, message match the IDL`, () => {
      const idlError = idlByCode.get(def.code);
      assert.ok(idlError, `IDL is missing code ${def.code}`);
      assert.equal(def.name, idlError.name, `${def.code}: name`);
      if (idlError.msg !== undefined) {
        assert.equal(def.message, idlError.msg, `${def.code}: message`);
      }
    });
  }
});

describe("AuraErrorCode map", () => {
  it("has one entry per definition", () => {
    assert.equal(
      Object.keys(AuraErrorCode).length,
      AURA_ERROR_DEFINITIONS.length,
    );
  });

  it("every definition name maps to its code", () => {
    for (const def of AURA_ERROR_DEFINITIONS) {
      assert.equal(
        AuraErrorCode[def.name as keyof typeof AuraErrorCode],
        def.code,
        def.name,
      );
    }
  });

  it("pins a few well-known codes by hand", () => {
    assert.equal(AuraErrorCode.UnauthorizedAi, 6000);
    assert.equal(AuraErrorCode.ExecutionPaused, 6018);
    assert.equal(AuraErrorCode.GuardrailRotationRequired, 6139);
  });
});
