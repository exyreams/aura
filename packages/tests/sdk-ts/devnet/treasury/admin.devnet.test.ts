/**
 * Devnet: owner-gated treasury administration.
 *
 * Covers the per-recipient exposure limits, treasury metadata/settings updates,
 * and the analytics sidecar close path that the lifecycle suite doesn't reach:
 *   - set_recipient_limit / remove_recipient_limit (+ not-found revert)
 *   - update_treasury_metadata (partial, option-based field updates)
 *   - init_treasury_analytics -> close_treasury_analytics
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveTreasuryAnalyticsAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { SystemProgram } from "@solana/web3.js";
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

const CHAIN_ETHEREUM = 1;
const EVM_DEAD = "0x000000000000000000000000000000000000dead";

let t: ProvisionedTreasury;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "tre-admin" });
});

test("set_recipient_limit then remove_recipient_limit round-trips", {
  skip,
}, async () => {
  await sendAndConfirm(
    [
      await instructions.treasury.setRecipientLimit(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: {
          chain: CHAIN_ETHEREUM,
          address: EVM_DEAD,
          dailyLimitUsd: new BN(5_000),
          perTxLimitUsd: new BN(1_000),
          now: nowBN(),
        },
      }),
    ],
    [],
    "setRecipientLimit",
  );
  let account = await accounts.fetchTreasuryAccount(client, t.treasury);
  let limit = account.policyConfig.recipientLimits.find(
    (r) => r.chain === CHAIN_ETHEREUM && r.address === EVM_DEAD,
  );
  assert.ok(limit, "recipient limit should be recorded");
  assert.equal(limit.dailyLimitUsd.toString(), "5000");
  assert.equal(limit.perTxLimitUsd?.toString(), "1000");

  await sendAndConfirm(
    [
      await instructions.treasury.removeRecipientLimit(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { chain: CHAIN_ETHEREUM, address: EVM_DEAD, now: nowBN() },
      }),
    ],
    [],
    "removeRecipientLimit",
  );
  account = await accounts.fetchTreasuryAccount(client, t.treasury);
  limit = account.policyConfig.recipientLimits.find(
    (r) => r.chain === CHAIN_ETHEREUM && r.address === EVM_DEAD,
  );
  assert.equal(limit, undefined, "recipient limit should be removed");
});

test("remove_recipient_limit reverts when the entry is absent", {
  skip,
}, async () => {
  const ix = await instructions.treasury.removeRecipientLimit(client, {
    accounts: { owner: t.owner, treasury: t.treasury },
    args: { chain: CHAIN_ETHEREUM, address: "0xabsent", now: nowBN() },
  });
  await expectSendToFail([ix], "remove absent recipient limit");
});

test("update_treasury_metadata applies the supplied fields", {
  skip,
}, async () => {
  await sendAndConfirm(
    [
      await instructions.treasury.updateTreasuryMetadata(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: {
          pendingTransactionTtlSecs: new BN(1_800),
          highRiskThreshold: 70,
          highRiskRequireGuardian: null,
          sanctionsCheckEnabled: true,
          now: nowBN(),
        },
      }),
    ],
    [],
    "updateTreasuryMetadata",
  );
  const account = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(account.pendingTransactionTtlSecs.toString(), "1800");
  assert.equal(account.highRiskThreshold, 70);
  assert.equal(account.sanctionsCheckEnabled, true);
});

test("init then close the treasury analytics sidecar", { skip }, async () => {
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
  assert.ok(
    await accounts.fetchTreasuryAnalyticsAccount(client, analytics),
    "analytics account should exist",
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
    "closed analytics account should be gone",
  );
});
