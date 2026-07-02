/**
 * Live scenario 01: transfer a discovered token directly from the payer wallet.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { getPayer } from "../support/devnet.js";
import {
  discoverLiveTokenAsset,
  pickTransferAmountRaw,
  rawAmountToUi,
} from "../support/live/assets.js";
import {
  DEFAULT_RECIPIENT_OWNER,
  DEFAULT_TRANSFER_UI,
  liveScenarioSkip,
  MAX_TRANSFER_UI,
} from "../support/live/config.js";
import { transferFromPayer } from "../support/live/transfers.js";

test("moves a discovered payer-wallet token to the live recipient", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const asset = await discoverLiveTokenAsset(payer.publicKey);
  const amountRaw = pickTransferAmountRaw(
    asset.amount,
    asset.decimals,
    DEFAULT_TRANSFER_UI,
    MAX_TRANSFER_UI,
  );

  console.log("\n=== direct wallet transfer plan ===");
  console.log(`payer          : ${payer.publicKey.toBase58()}`);
  console.log(`recipient owner: ${DEFAULT_RECIPIENT_OWNER.toBase58()}`);
  console.log(`mint           : ${asset.mint.toBase58()}`);
  console.log(`token program  : ${asset.tokenProgramId.toBase58()}`);
  console.log(`amount         : ${rawAmountToUi(amountRaw, asset.decimals)}`);

  const result = await transferFromPayer({
    asset,
    destinationOwner: DEFAULT_RECIPIENT_OWNER,
    amountRaw,
    label: "direct wallet token transfer",
  });

  assert.equal(
    result.beforeSource - result.afterSource,
    amountRaw,
    "payer source account must decrease by the transfer amount",
  );
  assert.equal(
    result.afterDestination - result.beforeDestination,
    amountRaw,
    "recipient account must increase by the transfer amount",
  );

  console.log("\n=== direct wallet transfer result ===");
  console.log(`signature      : ${result.signature}`);
  console.log(`recipient ATA  : ${result.destinationAta.toBase58()}`);
});
