/**
 * Devnet: dWallet registration (metadata only; no live Ika signing).
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { PublicKey } from "@solana/web3.js";
import { accounts, instructions } from "../../src/index.js";
import {
  createTreasuryArgs,
  DEVNET_AVAILABLE,
  devnetClient,
  getPayer,
  registerDwalletArgs,
  sendAndConfirm,
  uniqueAgentId,
} from "../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();
const agentId = uniqueAgentId("dwallet");

let owner: PublicKey;
let treasury: PublicKey;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  owner = getPayer().publicKey;
  const { treasury: pda, input } = accounts.createTreasuryInput({
    owner,
    args: createTreasuryArgs(owner, agentId),
  });
  treasury = pda;
  await sendAndConfirm([
    await instructions.treasury.createTreasury(client, input),
  ]);
});

test("registerDwallet stores a dWallet reference on-chain", {
  skip,
}, async () => {
  const dwalletId = `${agentId}-dw`;
  const ix = await instructions.dwallet.registerDwallet(client, {
    accounts: { owner, treasury },
    args: registerDwalletArgs(dwalletId),
  });
  await sendAndConfirm([ix]);

  const account = await accounts.fetchTreasuryAccount(client, treasury);
  assert.ok(account.dwallets.length > 0, "dwallets should be non-empty");
  const registered = account.dwallets.find((d) => d.dwalletId === dwalletId);
  assert.ok(registered, "registered dWallet should be present");
});
