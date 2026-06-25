/** UI value formatters. */

import assert from "node:assert/strict";
import test from "node:test";

import { PublicKey } from "@solana/web3.js";
import BN from "bn.js";

import {
  formatNullable,
  formatPercentBps,
  formatPubkey,
  formatRelativeSeconds,
  formatTimestamp,
  formatUsd,
} from "../../src/ui/format.js";

test("formatUsd renders BN, number, and null", () => {
  assert.equal(formatUsd(new BN(1000)), "$1,000.00");
  assert.equal(formatUsd(0), "$0.00");
  assert.equal(formatUsd(null), "—");
  assert.equal(formatUsd(undefined), "—");
});

test("formatPercentBps converts basis points to a percentage", () => {
  assert.equal(formatPercentBps(100), "1.00%");
  assert.equal(formatPercentBps(new BN(250)), "2.50%");
  assert.equal(formatPercentBps(null), "—");
});

test("formatPubkey shortens by default and respects shorten:false", () => {
  const pk = new PublicKey("11111111111111111111111111111111");
  assert.match(formatPubkey(pk), /…/);
  assert.equal(formatPubkey(pk, { shorten: false }), pk.toBase58());
  assert.equal(formatPubkey(null), "—");
});

test("formatTimestamp and formatRelativeSeconds handle null + direction", () => {
  assert.equal(formatTimestamp(null), "—");
  assert.equal(formatRelativeSeconds(null), "—");
  const nowSec = Math.floor(Date.now() / 1000);
  assert.match(formatRelativeSeconds(nowSec + 3600), /^in /);
  assert.match(formatRelativeSeconds(nowSec - 3600), / ago$/);
});

test("formatNullable maps booleans and empties", () => {
  assert.equal(formatNullable(null), "—");
  assert.equal(formatNullable(""), "—");
  assert.equal(formatNullable(true), "Yes");
  assert.equal(formatNullable(false), "No");
  assert.equal(formatNullable("ok"), "ok");
});
