/** Typed CLI errors and the tip-aware renderer. */

import assert from "node:assert/strict";
import test from "node:test";

import { CliError, renderError, toMessage } from "../../src/core/errors.js";
import { setColorEnabled } from "../../src/ui/theme.js";

setColorEnabled(false);

function captureStderr(fn: () => void): string {
  let captured = "";
  const original = process.stderr.write.bind(process.stderr);
  // biome-ignore lint/suspicious/noExplicitAny: stream writer override
  process.stderr.write = ((chunk: any) => {
    captured += String(chunk);
    return true;
  }) as typeof process.stderr.write;
  try {
    fn();
  } finally {
    process.stderr.write = original;
  }
  return captured;
}

test("CliError carries code, tip, examples, and details", () => {
  const error = new CliError("boom", {
    code: "X_CODE",
    tip: "do the thing",
    examples: ["aura foo --bar"],
    details: "line of detail",
  });
  assert.equal(error.message, "boom");
  assert.equal(error.code, "X_CODE");
  assert.equal(error.tip, "do the thing");
  assert.deepEqual(error.examples, ["aura foo --bar"]);
  assert.equal(error.details, "line of detail");
});

test("CliError.invalidInput builds a helpful message", () => {
  const error = CliError.invalidInput(
    "--amount",
    "positive number",
    "aura treasury propose --amount 5",
  );
  assert.equal(error.code, "INVALID_INPUT");
  assert.match(error.message, /--amount/);
  assert.deepEqual(error.examples, ["aura treasury propose --amount 5"]);
});

test("toMessage extracts a string from Error and non-Error values", () => {
  assert.equal(toMessage(new Error("hi")), "hi");
  assert.equal(toMessage("plain string"), "plain string");
});

test("renderError prints the message, tip, examples, and code", () => {
  const out = captureStderr(() =>
    renderError(
      new CliError("nope", { code: "C1", tip: "try X", examples: ["aura y"] }),
    ),
  );
  assert.match(out, /nope/);
  assert.match(out, /try X/);
  assert.match(out, /aura y/);
  assert.match(out, /C1/);
});

test("renderError derives guidance for common low-level failures", () => {
  const rateLimited = captureStderr(() =>
    renderError(new Error("server responded with 429 Too Many Requests")),
  );
  assert.match(rateLimited.toLowerCase(), /rate limit/);

  const noWallet = captureStderr(() =>
    renderError(new Error("Could not load wallet keypair from /x/id.json")),
  );
  assert.match(noWallet.toLowerCase(), /wallet/);
});
