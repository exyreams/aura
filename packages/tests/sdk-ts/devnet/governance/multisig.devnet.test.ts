/**
 * Devnet: governance (multisig).
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import { accounts, instructions } from "@aura-protocol/sdk-ts";
import { Keypair, type PublicKey } from "@solana/web3.js";
import {
  configureMultisigArgs,
  createTreasuryArgs,
  DEVNET_AVAILABLE,
  devnetClient,
  getPayer,
  sendAndConfirm,
  uniqueAgentId,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();
const agentId = uniqueAgentId("gov");

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
  await sendAndConfirm(
    [await instructions.treasury.createTreasury(client, input)],
    [],
    "createTreasury",
  );
});

test("configureMultisig registers guardians on-chain", { skip }, async () => {
  const guardians = [
    Keypair.generate().publicKey,
    Keypair.generate().publicKey,
  ];
  const ix = await instructions.governance.configureMultisig(client, {
    accounts: { owner, treasury },
    args: configureMultisigArgs(guardians),
  });
  await sendAndConfirm([ix], [], "configureMultisig");

  const account = await accounts.fetchTreasuryAccount(client, treasury);
  assert.ok(account.multisig, "multisig should be set");
  assert.equal(account.multisig?.guardians.length, 2);
  const registered = new Set(
    account.multisig?.guardians.map((g) => g.key.toBase58()) ?? [],
  );
  for (const guardian of guardians) {
    assert.ok(registered.has(guardian.toBase58()), guardian.toBase58());
  }
});
