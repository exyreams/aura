/**
 * Devnet: treasury lifecycle.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  Keypair,
  LAMPORTS_PER_SOL,
  type PublicKey,
  SystemProgram,
} from "@solana/web3.js";
import {
  AURA_PROGRAM_ID,
  accounts,
  deriveTreasuryAddress,
  deriveTreasuryAnalyticsAddress,
  instructions,
} from "../../src/index.js";
import {
  createTreasuryArgs,
  DEVNET_AVAILABLE,
  devnetClient,
  getPayer,
  nowBN,
  sendAndConfirm,
  uniqueAgentId,
} from "../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();
const agentId = uniqueAgentId("treasury");

let owner: PublicKey;
let treasury: PublicKey;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  owner = getPayer().publicKey;
  const balance = await client.connection.getBalance(owner);
  assert.ok(
    balance >= 0.05 * LAMPORTS_PER_SOL,
    `payer ${owner.toBase58()} underfunded (${balance / LAMPORTS_PER_SOL} SOL)`,
  );
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

test("createTreasury lands and is owned by the program", { skip }, async () => {
  const info = await client.connection.getAccountInfo(treasury);
  assert.ok(info, "treasury account should exist");
  assert.equal(info.owner.toBase58(), AURA_PROGRAM_ID.toBase58());
});

test("fetchTreasuryAccount round-trips on-chain state", { skip }, async () => {
  const account = await accounts.fetchTreasuryAccount(client, treasury);
  assert.equal(account.owner.toBase58(), owner.toBase58());
  assert.equal(account.agentId, agentId);
  assert.equal(account.aiAuthority.toBase58(), owner.toBase58());
});

test("fetchTreasuryAccountNullable returns null for a ghost PDA", {
  skip,
}, async () => {
  const result = await accounts.fetchTreasuryAccountNullable(
    client,
    Keypair.generate().publicKey,
  );
  assert.equal(result, null);
});

test("transitionAgentState activates the treasury", { skip }, async () => {
  const ix = await instructions.lifecycle.transitionAgentState(client, {
    accounts: { owner, treasury },
    args: { targetState: 1, now: nowBN() },
  });
  await sendAndConfirm([ix], [], "transitionAgentState");
  const account = await accounts.fetchTreasuryAccount(client, treasury);
  assert.equal(account.agentState, 1);
});

test("initTreasuryAnalytics creates the analytics sidecar", {
  skip,
}, async () => {
  const [analytics] = deriveTreasuryAnalyticsAddress(treasury);
  const ix = await instructions.treasury.initTreasuryAnalytics(client, {
    accounts: {
      owner,
      treasury,
      analytics,
      systemProgram: SystemProgram.programId,
    },
    args: { now: nowBN() },
  });
  await sendAndConfirm([ix], [], "initTreasuryAnalytics");
  assert.ok(await accounts.fetchTreasuryAnalyticsAccount(client, analytics));
});

test("deriveTreasuryAddress matches the created PDA", { skip }, () => {
  const [derived] = deriveTreasuryAddress(owner, agentId);
  assert.equal(derived.toBase58(), treasury.toBase58());
});
