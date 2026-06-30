/**
 * Devnet: treasury scenario matrix.
 *
 * Covers admin behaviors that are easy to regress but not expensive to drive:
 * owner-only rejects, duplicate sidecar initialization, close/null fetch, no-op
 * option updates, and repeated pause/state transitions.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveTreasuryAnalyticsAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  nowBN,
  type ProvisionedTreasury,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

let t: ProvisionedTreasury;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "tre-matrix" });
});

test("owner-only admin instructions reject a wrong signer", { skip }, async () => {
  const stranger = Keypair.generate();

  const updateIx = await instructions.treasury.updateTreasuryMetadata(client, {
    accounts: { owner: stranger.publicKey, treasury: t.treasury },
    args: {
      pendingTransactionTtlSecs: new BN(1_200),
      highRiskThreshold: null,
      highRiskRequireGuardian: null,
      sanctionsCheckEnabled: null,
      now: nowBN(),
    },
  });
  await expectSendToFail(
    [updateIx],
    "updateTreasuryMetadata unauthorized",
    [stranger],
  );

  const pauseIx = await instructions.execution.pauseExecution(client, {
    accounts: { owner: stranger.publicKey, treasury: t.treasury },
    args: { paused: true, now: nowBN() },
  });
  await expectSendToFail([pauseIx], "pauseExecution unauthorized", [stranger]);

  const transitionIx = await instructions.lifecycle.transitionAgentState(
    client,
    {
      accounts: { owner: stranger.publicKey, treasury: t.treasury },
      args: { targetState: 1, now: nowBN() },
    },
  );
  await expectSendToFail(
    [transitionIx],
    "transitionAgentState unauthorized",
    [stranger],
  );
});

test("treasury metadata null fields are no-ops", { skip }, async () => {
  const before = await accounts.fetchTreasuryAccount(client, t.treasury);

  await sendAndConfirm(
    [
      await instructions.treasury.updateTreasuryMetadata(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: {
          pendingTransactionTtlSecs: null,
          highRiskThreshold: null,
          highRiskRequireGuardian: null,
          sanctionsCheckEnabled: null,
          now: nowBN(),
        },
      }),
    ],
    [],
    "updateTreasuryMetadata(no-op)",
  );
  const after = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(
    after.pendingTransactionTtlSecs.toString(),
    before.pendingTransactionTtlSecs.toString(),
  );
  assert.equal(after.highRiskThreshold, before.highRiskThreshold);
  assert.equal(after.highRiskRequireGuardian, before.highRiskRequireGuardian);
  assert.equal(after.sanctionsCheckEnabled, before.sanctionsCheckEnabled);
});

test("treasury analytics duplicate init rejects, close clears, double-close rejects", {
  skip,
}, async () => {
  const [analytics] = deriveTreasuryAnalyticsAddress(t.treasury);

  await sendAndConfirm(
    [
      await instructions.treasury.initTreasuryAnalytics(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          analytics,
          systemProgram: SystemProgram.programId,
        },
        args: { now: nowBN() },
      }),
    ],
    [],
    "initTreasuryAnalytics",
  );
  assert.ok(await accounts.fetchTreasuryAnalyticsAccount(client, analytics));

  await expectSendToFail(
    [
      await instructions.treasury.initTreasuryAnalytics(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          analytics,
          systemProgram: SystemProgram.programId,
        },
        args: { now: nowBN() },
      }),
    ],
    "initTreasuryAnalytics duplicate",
  );

  await sendAndConfirm(
    [
      await instructions.treasury.closeTreasuryAnalytics(client, {
        accounts: { owner: t.owner, treasury: t.treasury, analytics },
      }),
    ],
    [],
    "closeTreasuryAnalytics",
  );
  assert.equal(
    await accounts.fetchTreasuryAnalyticsAccountNullable(client, analytics),
    null,
  );

  await expectSendToFail(
    [
      await instructions.treasury.closeTreasuryAnalytics(client, {
        accounts: { owner: t.owner, treasury: t.treasury, analytics },
      }),
    ],
    "closeTreasuryAnalytics after close",
  );
});

test("pause is idempotent, repeated agent-state transition rejects", {
  skip,
}, async () => {
  await sendAndConfirm(
    [
      await instructions.execution.pauseExecution(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { paused: true, now: nowBN() },
      }),
    ],
    [],
    "pauseExecution(true)",
  );
  await sendAndConfirm(
    [
      await instructions.execution.pauseExecution(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { paused: true, now: nowBN() },
      }),
    ],
    [],
    "pauseExecution(true again)",
  );
  let account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.executionPaused, true);

  await sendAndConfirm(
    [
      await instructions.execution.pauseExecution(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { paused: false, now: nowBN() },
      }),
    ],
    [],
    "pauseExecution(false)",
  );
  account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.executionPaused, false);
  assert.equal(
    account.agentState,
    1,
    "resuming execution moves the treasury back to Active",
  );

  await expectSendToFail(
    [
      await instructions.lifecycle.transitionAgentState(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { targetState: 1, now: nowBN() },
      }),
    ],
    "transitionAgentState(active after resume)",
  );
  await expectSendToFail(
    [
      await instructions.lifecycle.transitionAgentState(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { targetState: 1, now: nowBN() },
      }),
    ],
    "transitionAgentState(active again)",
  );
  account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.agentState, 1);
});
