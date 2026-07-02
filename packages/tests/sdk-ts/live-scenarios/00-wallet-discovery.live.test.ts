/**
 * Live scenario 00: discover funded payer wallet assets without moving tokens.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { getPayer } from "../support/devnet.js";
import {
  discoverLiveTokenAssets,
  printTokenCandidateReport,
} from "../support/live/assets.js";
import { discoverySkip } from "../support/live/config.js";

test("discovers funded payer wallet token balances and compatibility", {
  skip: discoverySkip,
}, async () => {
  const payer = getPayer();
  const assets = await discoverLiveTokenAssets(payer.publicKey);
  printTokenCandidateReport(assets);

  assert.ok(
    assets.length > 0,
    `payer wallet ${payer.publicKey.toBase58()} should hold at least one funded SPL/Token-2022 asset`,
  );
  assert.ok(
    assets.some((asset) => asset.hookAwareTransferCompatible),
    "at least one funded asset should be compatible with live scenario transfers",
  );
});
