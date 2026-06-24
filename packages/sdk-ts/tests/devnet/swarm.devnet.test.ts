/**
 * Devnet: swarm configuration.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import type { PublicKey } from "@solana/web3.js";
import { accounts, instructions } from "../../src/index.js";
import {
  configureSwarmArgs,
  createTreasuryArgs,
  DEVNET_AVAILABLE,
  devnetClient,
  getPayer,
  sendAndConfirm,
  uniqueAgentId,
} from "../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();
const agentId = uniqueAgentId("swarm");

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

test("configureSwarm stores the swarm config on-chain", { skip }, async () => {
  const swarmId = `${agentId}-pool`;
  const ix = await instructions.swarm.configureSwarm(client, {
    accounts: { owner, treasury },
    args: configureSwarmArgs(swarmId, [agentId, `${agentId}-peer`]),
  });
  await sendAndConfirm([ix]);

  const account = await accounts.fetchTreasuryAccount(client, treasury);
  assert.ok(account.swarm, "swarm should be set");
  assert.equal(account.swarm?.swarmId, swarmId);
});
