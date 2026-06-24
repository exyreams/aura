/**
 * Devnet: public proposal lifecycle (no Ika signing).
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
  nowBN,
  proposeTransactionArgs,
  sendAndConfirm,
  uniqueAgentId,
} from "../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();
const agentId = uniqueAgentId("exec");

let owner: PublicKey;
let treasury: PublicKey;

// The optional accounts proposeTransaction may consult, all unused here.
function proposeAccounts(aiAuthority: PublicKey, treasuryPda: PublicKey) {
  return {
    aiAuthority,
    treasury: treasuryPda,
    sessionKeyAccount: null,
    swarmPool: null,
    addressList: null,
    complianceOracle: null,
    parentTreasury: null,
    budgetEnvelope: null,
    exposureGroup: null,
    dwalletState: null,
    chainProfile: null,
    trustIdentity: null,
    policyCanary: null,
  };
}

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
  await sendAndConfirm([
    await instructions.lifecycle.transitionAgentState(client, {
      accounts: { owner, treasury },
      args: { targetState: 1, now: nowBN() },
    }),
  ]);
});

test("proposeTransaction records a pending proposal", { skip }, async () => {
  const ix = await instructions.execution.proposeTransaction(client, {
    accounts: proposeAccounts(owner, treasury),
    args: proposeTransactionArgs(),
  });
  await sendAndConfirm([ix]);
  const account = await accounts.fetchTreasuryAccount(client, treasury);
  assert.ok(account.pendingQueue.length > 0, "expected a pending proposal");
});

test("cancelPending clears the pending proposal", { skip }, async () => {
  const ix = await instructions.execution.cancelPending(client, {
    accounts: { owner, treasury, dwalletState: null },
    args: { now: nowBN() },
  });
  await sendAndConfirm([ix]);
  const account = await accounts.fetchTreasuryAccount(client, treasury);
  assert.equal(account.pendingQueue.length, 0);
});

test("pauseExecution toggles the paused flag", { skip }, async () => {
  await sendAndConfirm([
    await instructions.execution.pauseExecution(client, {
      accounts: { owner, treasury },
      args: { paused: true, now: nowBN() },
    }),
  ]);
  let account = await accounts.fetchTreasuryAccount(client, treasury);
  assert.ok(account.executionPaused);

  await sendAndConfirm([
    await instructions.execution.pauseExecution(client, {
      accounts: { owner, treasury },
      args: { paused: false, now: nowBN() },
    }),
  ]);
  account = await accounts.fetchTreasuryAccount(client, treasury);
  assert.ok(!account.executionPaused);
});
