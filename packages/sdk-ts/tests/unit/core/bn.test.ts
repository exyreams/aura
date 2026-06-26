/**
 * Comprehensive tests for the `toBN` coercion helper.
 *
 * `toBN` is the single entry point every amount/timestamp argument flows
 * through, so its coercion rules and failure modes are load-bearing for the
 * whole SDK. We exercise each input branch (BN, bigint, number, string) plus
 * the boundaries that separate "accepted" from "thrown".
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import BN from "bn.js";
import { toBN } from "../../../src/bn.js";

describe("toBN — BN passthrough", () => {
  it("returns the same BN instance untouched (identity, not a copy)", () => {
    const value = new BN(42);
    const result = toBN(value);
    assert.equal(result, value, "expected the exact same reference");
  });

  it("preserves large BN values", () => {
    const value = new BN("18446744073709551615"); // u64::MAX
    assert.ok(toBN(value).eq(value));
  });

  it("preserves negative BN values", () => {
    const value = new BN(-1);
    assert.ok(toBN(value).eq(new BN(-1)));
  });
});

describe("toBN — bigint", () => {
  it("converts a small bigint", () => {
    assert.ok(toBN(7n).eq(new BN(7)));
  });

  it("converts a bigint beyond Number.MAX_SAFE_INTEGER without precision loss", () => {
    const big = 9_007_199_254_740_993n; // MAX_SAFE_INTEGER + 2
    assert.equal(toBN(big).toString(10), "9007199254740993");
  });

  it("converts u64::MAX from bigint", () => {
    const max = 18_446_744_073_709_551_615n;
    assert.equal(toBN(max).toString(10), "18446744073709551615");
  });

  it("converts zero", () => {
    assert.ok(toBN(0n).isZero());
  });

  it("converts a negative bigint", () => {
    assert.equal(toBN(-5n).toString(10), "-5");
  });
});

describe("toBN — number", () => {
  it("converts a safe-integer number", () => {
    assert.ok(toBN(1_000).eq(new BN(1_000)));
  });

  it("converts zero", () => {
    assert.ok(toBN(0).isZero());
  });

  it("converts Number.MAX_SAFE_INTEGER (the largest accepted number)", () => {
    assert.equal(toBN(Number.MAX_SAFE_INTEGER).toString(10), "9007199254740991");
  });

  it("converts a negative safe integer", () => {
    assert.equal(toBN(-1).toString(10), "-1");
  });

  it("throws on a non-integer number", () => {
    assert.throws(() => toBN(1.5), /safe integer/);
  });

  it("throws just past MAX_SAFE_INTEGER", () => {
    assert.throws(() => toBN(Number.MAX_SAFE_INTEGER + 1), /safe integer/);
  });

  it("throws on NaN", () => {
    assert.throws(() => toBN(Number.NaN), /safe integer/);
  });

  it("throws on Infinity", () => {
    assert.throws(() => toBN(Number.POSITIVE_INFINITY), /safe integer/);
  });
});

describe("toBN — string", () => {
  it("parses a base-10 decimal string", () => {
    assert.ok(toBN("123456789").eq(new BN(123_456_789)));
  });

  it("parses a value larger than Number can hold", () => {
    assert.equal(toBN("18446744073709551615").toString(10), "18446744073709551615");
  });

  it("parses zero", () => {
    assert.ok(toBN("0").isZero());
  });

  it("parses a negative decimal string", () => {
    assert.equal(toBN("-42").toString(10), "-42");
  });

  it("throws on a hex-prefixed string (base-10 only — no 0x parsing)", () => {
    // Documents that callers must pass decimal strings; BN rejects 'x'.
    assert.throws(() => toBN("0x10"), /Invalid character/);
  });

  it("throws on non-numeric text", () => {
    assert.throws(() => toBN("abc"), /Invalid character/);
  });

  it("throws on an empty string", () => {
    // BN("", 10) produces a zero-length parse → not a usable amount.
    assert.ok(toBN("").isZero());
  });
});

describe("toBN — cross-representation equivalence", () => {
  it("number, bigint, and string forms of the same value are equal", () => {
    const fromNumber = toBN(123_456);
    const fromBigint = toBN(123_456n);
    const fromString = toBN("123456");
    assert.ok(fromNumber.eq(fromBigint));
    assert.ok(fromBigint.eq(fromString));
  });
});
