/** Terminal theme: color blocks, style passthrough, symbols, maturity mapping. */

import assert from "node:assert/strict";
import test from "node:test";

import {
  block,
  isColorEnabled,
  maturityKind,
  setColorEnabled,
  style,
  symbol,
} from "../../src/ui/theme.js";

test("block falls back to [LABEL] when color is disabled", () => {
  const prev = isColorEnabled();
  setColorEnabled(false);
  try {
    assert.equal(block("AURA", "primary"), "[AURA]");
    assert.equal(block("WARNING", "warn"), "[WARNING]");
  } finally {
    setColorEnabled(prev);
  }
});

test("block contains the label when color is enabled", () => {
  const prev = isColorEnabled();
  setColorEnabled(true);
  try {
    assert.match(block("AURA", "danger"), /AURA/);
  } finally {
    setColorEnabled(prev);
  }
});

test("style functions pass text through unchanged when color is disabled", () => {
  const prev = isColorEnabled();
  setColorEnabled(false);
  try {
    assert.equal(style.bold("hi"), "hi");
    assert.equal(style.danger("err"), "err");
    assert.equal(style.muted("x"), "x");
  } finally {
    setColorEnabled(prev);
  }
});

test("symbols are stable", () => {
  assert.equal(symbol.success, "✓");
  assert.equal(symbol.error, "✗");
  assert.equal(symbol.warn, "⚠");
});

test("maturityKind maps program maturities to block kinds", () => {
  assert.equal(maturityKind("wallet"), "primary");
  assert.equal(maturityKind("backend"), "info");
  assert.equal(maturityKind("external_cpi"), "accent");
  assert.equal(maturityKind("read_only"), "muted");
  assert.equal(maturityKind("unknown-thing"), "muted");
});
