/**
 * Devnet: scoped budget envelopes and shared exposure groups.
 *
 *   - configure_budget_envelope (happy + scope/limit reject paths) +
 *     remove_budget_envelope
 *   - init_exposure_group → join → update → (close-while-member reject) →
 *     leave → close
 *
 * Exposure-group PDAs are (authority, groupId)-scoped and the authority (payer)
 * is constant across runs, so we use a random 16-byte group id. Skips when no
 * funded payer.
 */

import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { before, test } from "node:test";
import {
  accounts,
  deriveBudgetEnvelopeAddress,
  deriveExposureGroupAddress,
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
const SCOPE_CHAIN = 0;

let t: ProvisionedTreasury;

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "budget" });
});

test("configure_budget_envelope (chain scope) then remove", {
  skip,
}, async () => {
  const envelopeId = Date.now();
  const [budgetEnvelope] = deriveBudgetEnvelopeAddress(t.treasury, envelopeId);

  const before = await accounts.fetchTreasuryAccount(client, t.treasury);
  await sendAndConfirm(
    [
      await instructions.budget.configureBudgetEnvelope(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          budgetEnvelope,
          systemProgram: SystemProgram.programId,
        },
        args: {
          envelopeId: new BN(envelopeId),
          scopeKind: SCOPE_CHAIN,
          chain: CHAIN_ETHEREUM,
          txType: null,
          protocolId: null,
          dailyLimitUsd: new BN(5_000),
          weeklyLimitUsd: new BN(20_000),
          now: nowBN(),
        },
      }),
    ],
    [],
    "configureBudgetEnvelope",
  );
  const envelope = await accounts.fetchBudgetEnvelopeAccount(
    client,
    budgetEnvelope,
  );
  assert.equal(envelope.scopeKind, SCOPE_CHAIN);
  assert.equal(envelope.chain, CHAIN_ETHEREUM);
  assert.equal(envelope.dailyLimitUsd.toString(), "5000");
  assert.equal(envelope.weeklyLimitUsd.toString(), "20000");
  const mid = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(
    mid.currentPolicyVersion,
    before.currentPolicyVersion + 1,
    "policy version bumped on configure",
  );

  await sendAndConfirm(
    [
      await instructions.budget.removeBudgetEnvelope(client, {
        accounts: { owner: t.owner, treasury: t.treasury, budgetEnvelope },
        args: { envelopeId: new BN(envelopeId), now: nowBN() },
      }),
    ],
    [],
    "removeBudgetEnvelope",
  );
  assert.equal(
    await accounts.fetchBudgetEnvelopeAccountNullable(client, budgetEnvelope),
    null,
    "removed envelope account should be gone",
  );
});

test("configure_budget_envelope rejects bad scope and zero limit", {
  skip,
}, async () => {
  // chain scope with chain=null -> InvalidChain
  const missingChain = await instructions.budget.configureBudgetEnvelope(
    client,
    {
      accounts: {
        owner: t.owner,
        treasury: t.treasury,
        budgetEnvelope: deriveBudgetEnvelopeAddress(
          t.treasury,
          Date.now() + 1,
        )[0],
        systemProgram: SystemProgram.programId,
      },
      args: {
        envelopeId: new BN(Date.now() + 1),
        scopeKind: SCOPE_CHAIN,
        chain: null,
        txType: null,
        protocolId: null,
        dailyLimitUsd: new BN(5_000),
        weeklyLimitUsd: new BN(0),
        now: nowBN(),
      },
    },
  );
  await expectSendToFail([missingChain], "chain scope without chain");

  // dailyLimitUsd = 0 -> InvalidExternalAccountData
  const zeroLimit = await instructions.budget.configureBudgetEnvelope(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      budgetEnvelope: deriveBudgetEnvelopeAddress(
        t.treasury,
        Date.now() + 2,
      )[0],
      systemProgram: SystemProgram.programId,
    },
    args: {
      envelopeId: new BN(Date.now() + 2),
      scopeKind: SCOPE_CHAIN,
      chain: CHAIN_ETHEREUM,
      txType: null,
      protocolId: null,
      dailyLimitUsd: new BN(0),
      weeklyLimitUsd: new BN(0),
      now: nowBN(),
    },
  });
  await expectSendToFail([zeroLimit], "zero daily limit");

  // scopeKind 3 (out of range) -> InvalidExternalAccountData
  const badScope = await instructions.budget.configureBudgetEnvelope(client, {
    accounts: {
      owner: t.owner,
      treasury: t.treasury,
      budgetEnvelope: deriveBudgetEnvelopeAddress(
        t.treasury,
        Date.now() + 3,
      )[0],
      systemProgram: SystemProgram.programId,
    },
    args: {
      envelopeId: new BN(Date.now() + 3),
      scopeKind: 3,
      chain: CHAIN_ETHEREUM,
      txType: null,
      protocolId: null,
      dailyLimitUsd: new BN(5_000),
      weeklyLimitUsd: new BN(0),
      now: nowBN(),
    },
  });
  await expectSendToFail([badScope], "scope kind out of range");
});

test("exposure group: init, join, update, close-guard, leave, close", {
  skip,
}, async () => {
  const groupId = new Uint8Array(randomBytes(16));
  const [exposureGroup] = deriveExposureGroupAddress(t.owner, groupId);

  await sendAndConfirm(
    [
      await instructions.budget.initExposureGroup(client, {
        accounts: {
          authority: t.owner,
          exposureGroup,
          systemProgram: SystemProgram.programId,
        },
        args: {
          groupId: Array.from(groupId),
          dailyLimitUsd: new BN(100_000),
          nowDay: nowBN(),
        },
      }),
    ],
    [],
    "initExposureGroup",
  );
  let group = await accounts.fetchExposureGroupAccount(client, exposureGroup);
  assert.equal(group.authority.toBase58(), t.owner.toBase58());
  assert.equal(group.memberCount, 0);

  // join
  await sendAndConfirm(
    [
      await instructions.budget.joinExposureGroup(client, {
        accounts: {
          authority: t.owner,
          exposureGroup,
          treasury: t.treasury,
        },
      }),
    ],
    [],
    "joinExposureGroup",
  );
  group = await accounts.fetchExposureGroupAccount(client, exposureGroup);
  assert.equal(group.memberCount, 1);
  assert.ok(
    group.members.some((m) => m.toBase58() === t.treasury.toBase58()),
    "treasury is a member",
  );

  // update happy + zero reject
  await sendAndConfirm(
    [
      await instructions.budget.updateExposureGroup(client, {
        accounts: {
          authority: t.owner,
          exposureGroup,
          treasury: t.treasury,
        },
        args: { dailyLimitUsd: new BN(250_000) },
      }),
    ],
    [],
    "updateExposureGroup",
  );
  group = await accounts.fetchExposureGroupAccount(client, exposureGroup);
  assert.equal(group.dailyLimitUsd.toString(), "250000");

  const zeroUpdate = await instructions.budget.updateExposureGroup(client, {
    accounts: { authority: t.owner, exposureGroup, treasury: t.treasury },
    args: { dailyLimitUsd: new BN(0) },
  });
  await expectSendToFail([zeroUpdate], "update to zero limit");

  // close while a member is present -> ExposureGroupNotEmpty
  const closeBusy = await instructions.budget.closeExposureGroup(client, {
    accounts: { authority: t.owner, exposureGroup },
  });
  await expectSendToFail([closeBusy], "close non-empty group");

  // leave then close
  await sendAndConfirm(
    [
      await instructions.budget.leaveExposureGroup(client, {
        accounts: {
          authority: t.owner,
          exposureGroup,
          treasury: t.treasury,
        },
      }),
    ],
    [],
    "leaveExposureGroup",
  );
  group = await accounts.fetchExposureGroupAccount(client, exposureGroup);
  assert.equal(group.memberCount, 0);

  await sendAndConfirm(
    [
      await instructions.budget.closeExposureGroup(client, {
        accounts: { authority: t.owner, exposureGroup },
      }),
    ],
    [],
    "closeExposureGroup",
  );
  assert.equal(
    await accounts.fetchExposureGroupAccountNullable(client, exposureGroup),
    null,
    "closed exposure group should be gone",
  );
});
