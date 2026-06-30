/**
 * Devnet: governance timelock and idempotency scenarios.
 *
 * Existing governance tests cover early rejects and post-timelock success. This
 * file tightens the boundary cases: exact executable timestamps, mismatched
 * change identifiers, and operations with no pending state.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { accounts, instructions } from "@aura-protocol/sdk-ts";
import { Keypair } from "@solana/web3.js";
import BN from "bn.js";
import {
  createTreasuryArgs,
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  nowBN,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

test("ai rotation executes exactly at executable_after", { skip }, async () => {
  const t = await provisionTreasury({ prefix: "gov-bound-ai" });
  const newAi = Keypair.generate().publicKey;

  await sendAndConfirm(
    [
      await instructions.governance.proposeAiRotation(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { newAiAuthority: newAi, now: nowBN() },
      }),
    ],
    [],
    "proposeAiRotation",
  );
  let account = await accounts.fetchTreasuryAccount(client, t.treasury);
  const executableAfter = new BN(
    account.pendingAiRotation?.executableAfter.toString() ?? "0",
  );

  await sendAndConfirm(
    [
      await instructions.governance.executeAiRotation(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { now: executableAfter },
      }),
    ],
    [],
    "executeAiRotation(boundary)",
  );
  account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingAiRotation, null);
  assert.equal(account.aiAuthority.toBase58(), newAi.toBase58());
});

test("ai rotation cancel without pending state is an idempotent no-op", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-bound-ai-empty" });
  await sendAndConfirm(
    [
      await instructions.governance.cancelAiRotation(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { now: nowBN() },
      }),
    ],
    [],
    "cancelAiRotation(no-op)",
  );
  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingAiRotation, null);
});

test("config change executes exactly at executable_after", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-bound-cfg" });
  const changeId = new BN(Date.now());
  const newPolicy = createTreasuryArgs(t.owner, t.agentId).policyConfig;
  newPolicy.dailyLimitUsd = new BN(31_000);

  await sendAndConfirm(
    [
      await instructions.governance.proposeConfigChange(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { changeId, newPolicyConfig: newPolicy, now: nowBN() },
      }),
    ],
    [],
    "proposeConfigChange",
  );
  let account = await accounts.fetchTreasuryAccount(client, t.treasury);
  const executableAfter = new BN(
    account.pendingConfigChange?.executableAfter.toString() ?? "0",
  );

  await sendAndConfirm(
    [
      await instructions.governance.executeConfigChange(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { changeId, now: executableAfter },
      }),
    ],
    [],
    "executeConfigChange(boundary)",
  );
  account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingConfigChange, null);
  assert.equal(account.policyConfig.dailyLimitUsd.toString(), "31000");
});

test("config change rejects mismatched change id after timelock", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "gov-bound-cfg-id" });
  const changeId = new BN(Date.now() + 1);
  const newPolicy = createTreasuryArgs(t.owner, t.agentId).policyConfig;
  newPolicy.dailyLimitUsd = new BN(32_000);

  await sendAndConfirm(
    [
      await instructions.governance.proposeConfigChange(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { changeId, newPolicyConfig: newPolicy, now: nowBN() },
      }),
    ],
    [],
    "proposeConfigChange",
  );
  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  const executableAfter = new BN(
    account.pendingConfigChange?.executableAfter.toString() ?? "0",
  );

  const ix = await instructions.governance.executeConfigChange(client, {
    accounts: { owner: t.owner, treasury: t.treasury },
    args: { changeId: changeId.add(new BN(1)), now: executableAfter },
  });
  await expectSendToFail([ix], "executeConfigChange wrong change id");
});
