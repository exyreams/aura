import { strict as assert } from "node:assert";
import { test } from "node:test";

import { ConduitError, isConduitError } from "../src/core/errors.js";

test("ConduitError carries code, message, and optional detail", () => {
  const err = new ConduitError("forbidden", "denied", { who: "alice" });
  assert.equal(err.code, "forbidden");
  assert.equal(err.message, "denied");
  assert.deepEqual(err.detail, { who: "alice" });
  assert.equal(err.name, "ConduitError");
});

test("ConduitError.toJSON omits detail when absent", () => {
  const err = new ConduitError("not_found", "nope");
  assert.deepEqual(err.toJSON(), { code: "not_found", message: "nope" });
});

test("ConduitError.toJSON includes detail when present", () => {
  const err = new ConduitError("invalid_input", "bad", { field: "x" });
  assert.deepEqual(err.toJSON(), {
    code: "invalid_input",
    message: "bad",
    detail: { field: "x" },
  });
});

test("isConduitError discriminates instances", () => {
  assert.equal(isConduitError(new ConduitError("internal", "x")), true);
  assert.equal(isConduitError(new Error("x")), false);
  assert.equal(isConduitError("not an error"), false);
  assert.equal(isConduitError(null), false);
});
