import assert from "node:assert/strict";
import test from "node:test";

import BN from "bn.js";

import { toBN } from "../src/index.js";

test("toBN: passthrough for BN instance", () => {
  const bn = new BN(42);
  assert.strictEqual(toBN(bn), bn);
});

test("toBN: converts number", () => {
  assert.equal(toBN(100).toString(), "100");
  assert.equal(toBN(0).toString(), "0");
  assert.equal(toBN(-1).toString(), "-1");
});

test("toBN: converts bigint", () => {
  assert.equal(toBN(BigInt("9007199254740993")).toString(), "9007199254740993");
  assert.equal(toBN(0n).toString(), "0");
});

test("toBN: converts decimal string", () => {
  assert.equal(toBN("12345678901234567890").toString(), "12345678901234567890");
  assert.equal(toBN("0").toString(), "0");
});

test("toBN: throws for unsafe integer", () => {
  assert.throws(() => toBN(Number.MAX_SAFE_INTEGER + 1), /safe integer/);
});

test("toBN: large bigint round-trips correctly", () => {
  const big = BigInt("999999999999999999999999");
  assert.equal(toBN(big).toString(), big.toString());
});
