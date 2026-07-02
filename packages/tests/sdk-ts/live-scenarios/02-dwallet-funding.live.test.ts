/**
 * Live scenario 02: fund the cached Ika dWallet token account from the payer.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { getPayer } from "../support/devnet.js";
import { getOrCreateDwallet } from "../support/ika/dwallet.js";
import {
  discoverLiveTokenAsset,
  rawAmountToUi,
  readTokenBalance,
  tokenAta,
} from "../support/live/assets.js";
import { liveScenarioSkip } from "../support/live/config.js";
import {
  bootstrapDwalletSourceIfNeeded,
  ensureDwalletFeePayerLamports,
  ensureTokenAccount,
} from "../support/live/transfers.js";

test("funds the cached dWallet token source from the payer wallet", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const asset = await discoverLiveTokenAsset(payer.publicKey);
  const dwallet = await getOrCreateDwallet(payer);
  const sourceAta = tokenAta(asset.mint, dwallet.address, asset.tokenProgramId);

  await ensureTokenAccount({
    owner: dwallet.address,
    ata: sourceAta,
    mint: asset.mint,
    tokenProgramId: asset.tokenProgramId,
    label: "dWallet source",
  });
  await ensureDwalletFeePayerLamports(dwallet.address);

  const beforeSource = await readTokenBalance(sourceAta, asset.tokenProgramId);
  const { source } = await bootstrapDwalletSourceIfNeeded({
    asset,
    sourceAta,
    sourceOwner: dwallet.address,
  });

  assert.ok(
    source.amount >= beforeSource.amount,
    "dWallet source balance should not decrease during funding",
  );

  console.log("\n=== dWallet funding result ===");
  console.log(`dWallet owner: ${dwallet.address.toBase58()}`);
  console.log(`source ATA   : ${sourceAta.toBase58()}`);
  console.log(`mint         : ${asset.mint.toBase58()}`);
  console.log(`before       : ${beforeSource.uiAmountString}`);
  console.log(`after        : ${rawAmountToUi(source.amount, asset.decimals)}`);
});
