/**
 * Devnet: billing templates and the org-profile composition.
 *
 *   - create_billing_template (happy + name-too-long + no-config reject)
 *   - update_billing_template (version bump)
 *   - apply_billing_template (writes the template schedule onto the treasury
 *     fee-schedule sidecar; bumps applied_count)
 *   - apply_org_profile (policy template + billing template applied together)
 *   - close_billing_template
 *
 * Billing/policy templates are OWNER-scoped, so we use time-based ids. Skips
 * when no funded payer.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";
import {
  accounts,
  deriveBillingTemplateAddress,
  deriveFeeScheduleAddress,
  derivePolicyTemplateAddress,
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

function feeSchedule(baseBps: number) {
  return {
    baseBps: new BN(baseBps),
    perTypeBps: [],
    tiers: [],
    minFeeUsd: new BN(0),
    maxFeeUsd: null,
    creationFeeUsd: new BN(0),
    subscriptionUsdPerPeriod: new BN(0),
    subscriptionPeriodSecs: new BN(0),
    aumBpsPerPeriod: new BN(0),
    fheSubsidyBps: new BN(0),
    reputationDiscountBps: new BN(0),
    referralDiscountBps: new BN(0),
    discountCapBps: new BN(0),
    integratorBps: new BN(0),
    ownerSurchargeBps: new BN(0),
  };
}

let t: ProvisionedTreasury;
const templateId = Date.now();
let billingTemplate: ReturnType<typeof deriveBillingTemplateAddress>[0];
let feeScheduleAddr: ReturnType<typeof deriveFeeScheduleAddress>[0];

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "fee-bill" });
  [billingTemplate] = deriveBillingTemplateAddress(t.owner, templateId);
  [feeScheduleAddr] = deriveFeeScheduleAddress(t.treasury);
  // applyBillingTemplate / applyOrgProfile need the fee-schedule sidecar.
  await sendAndConfirm(
    [
      await instructions.fees.initFeeSchedule(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          feeSchedule: feeScheduleAddr,
          protocolConfig: null,
          systemProgram: SystemProgram.programId,
        },
        args: { schedule: feeSchedule(50), now: nowBN() },
      }),
    ],
    [],
    "initFeeSchedule",
  );
});

test("create_billing_template stores a forked schedule", { skip }, async () => {
  await sendAndConfirm(
    [
      await instructions.fees.createBillingTemplate(client, {
        accounts: {
          owner: t.owner,
          billingTemplate,
          systemProgram: SystemProgram.programId,
        },
        args: {
          templateId: new BN(templateId),
          name: "standard-billing",
          description: "explicit schedule",
          shared: false,
          sourceKind: null,
          schedule: feeSchedule(60),
          now: nowBN(),
        },
      }),
    ],
    [],
    "createBillingTemplate",
  );
  const tmpl = await accounts.fetchBillingTemplate(client, billingTemplate);
  assert.equal(tmpl.version, 1);
  assert.equal(tmpl.appliedCount.toString(), "0");
  assert.equal(tmpl.schedule.baseBps.toString(), "60");
});

test("create_billing_template rejects bad input", { skip }, async () => {
  const longName = await instructions.fees.createBillingTemplate(client, {
    accounts: {
      owner: t.owner,
      billingTemplate: deriveBillingTemplateAddress(t.owner, templateId + 1)[0],
      systemProgram: SystemProgram.programId,
    },
    args: {
      templateId: new BN(templateId + 1),
      name: "x".repeat(49), // > 48 bytes
      description: "",
      shared: false,
      sourceKind: null,
      schedule: feeSchedule(60),
      now: nowBN(),
    },
  });
  await expectSendToFail([longName], "billing template name too long");

  const noConfig = await instructions.fees.createBillingTemplate(client, {
    accounts: {
      owner: t.owner,
      billingTemplate: deriveBillingTemplateAddress(t.owner, templateId + 2)[0],
      systemProgram: SystemProgram.programId,
    },
    args: {
      templateId: new BN(templateId + 2),
      name: "no-config",
      description: "",
      shared: false,
      sourceKind: null,
      schedule: null, // neither sourceKind nor schedule -> InvalidBillingTemplate
      now: nowBN(),
    },
  });
  await expectSendToFail([noConfig], "billing template without config");
});

test("update_billing_template bumps the version", { skip }, async () => {
  await sendAndConfirm(
    [
      await instructions.fees.updateBillingTemplate(client, {
        accounts: { owner: t.owner, billingTemplate },
        args: {
          name: "standard-billing-v2",
          description: "tuned",
          shared: true,
          schedule: feeSchedule(88),
          now: nowBN(),
        },
      }),
    ],
    [],
    "updateBillingTemplate",
  );
  const tmpl = await accounts.fetchBillingTemplate(client, billingTemplate);
  assert.equal(tmpl.version, 2);
  assert.equal(tmpl.schedule.baseBps.toString(), "88");
});

test("apply_billing_template writes the schedule onto the treasury", {
  skip,
}, async () => {
  await sendAndConfirm(
    [
      await instructions.fees.applyBillingTemplate(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          billingTemplate,
          feeSchedule: feeScheduleAddr,
          protocolConfig: null,
        },
        args: { now: nowBN() },
      }),
    ],
    [],
    "applyBillingTemplate",
  );
  const schedule = await accounts.fetchFeeScheduleAccount(
    client,
    feeScheduleAddr,
  );
  assert.equal(schedule.schedule.baseBps.toString(), "88", "schedule applied");
  const tmpl = await accounts.fetchBillingTemplate(client, billingTemplate);
  assert.equal(tmpl.appliedCount.toString(), "1");
});

test("apply_org_profile applies a policy + billing template together", {
  skip,
}, async () => {
  const policyTemplateId = templateId + 100;
  const [policyTemplate] = derivePolicyTemplateAddress(
    t.owner,
    policyTemplateId,
  );
  await sendAndConfirm(
    [
      await instructions.policy.createPolicyTemplate(client, {
        accounts: {
          owner: t.owner,
          policyTemplate,
          systemProgram: SystemProgram.programId,
        },
        args: {
          templateId: new BN(policyTemplateId),
          name: "org-policy",
          description: "forked preset",
          shared: false,
          sourcePreset: 1,
          config: null,
          now: nowBN(),
        },
      }),
    ],
    [],
    "createPolicyTemplate",
  );

  const before = await accounts.fetchTreasuryAccount(client, t.treasury);
  await sendAndConfirm(
    [
      await instructions.fees.applyOrgProfile(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          policyTemplate,
          billingTemplate,
          feeSchedule: feeScheduleAddr,
          protocolConfig: null,
        },
        args: { now: nowBN() },
      }),
    ],
    [],
    "applyOrgProfile",
  );
  const after = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(
    after.currentPolicyVersion,
    before.currentPolicyVersion + 1,
    "policy version bumped by org profile",
  );
  const tmpl = await accounts.fetchBillingTemplate(client, billingTemplate);
  assert.equal(tmpl.appliedCount.toString(), "2", "billing applied again");
});

test("close_billing_template closes the account", { skip }, async () => {
  await sendAndConfirm(
    [
      await instructions.fees.closeBillingTemplate(client, {
        accounts: { owner: t.owner, billingTemplate },
      }),
    ],
    [],
    "closeBillingTemplate",
  );
  assert.equal(
    await accounts.fetchBillingTemplateNullable(client, billingTemplate),
    null,
    "closed billing template should be gone",
  );
});
