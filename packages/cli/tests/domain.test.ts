import assert from "node:assert/strict";
import test from "node:test";

import {
  formatChain,
  formatProposalStatus,
  formatTransactionType,
  formatViolation,
  parseChain,
  parseTransactionType,
} from "../src/domain.js";

test("parseChain accepts names and numeric codes", () => {
  assert.equal(parseChain("ethereum"), 1);
  assert.equal(parseChain("2"), 2);
  assert.equal(parseChain(5), 5);
});

test("parseTransactionType accepts names and numeric codes", () => {
  assert.equal(parseTransactionType("transfer"), 0);
  assert.equal(parseTransactionType("4"), 4);
  assert.equal(parseTransactionType(1), 1);
});

test("format helpers produce readable labels", () => {
  assert.equal(formatChain(2), "Solana");
  assert.equal(formatTransactionType(3), "NFT Purchase");
  assert.equal(formatProposalStatus(2), "Awaiting Signature");
  assert.equal(formatViolation(7), "slippage exceeded");
});
