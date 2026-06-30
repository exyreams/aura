/**
 * Devnet: remaining external-CPI-bound instruction builders.
 *
 * These instructions require live Ika dWallet or Encrypt ciphertext/request
 * accounts for happy paths. The suite still drives the exported SDK builders
 * against the deployed devnet program and asserts the expected rejection at the
 * missing external-state boundary, after satisfying local treasury preconditions
 * where practical.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import { test } from "node:test";
import {
  AURA_PROGRAM_ID,
  DWALLET_DEVNET_PROGRAM_ID,
  ENCRYPT_DEVNET_PROGRAM_ID,
  accounts,
  deriveBatchProposalAddress,
  deriveConfidentialGuardrailsAddress,
  deriveDwalletCpiAuthorityAddress,
  deriveEncryptCpiAuthorityAddress,
  deriveEncryptEventAuthorityAddress,
  derivePolicyCanaryAddress,
  derivePolicyHistoryAddress,
  deriveTrustIdentityAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEVNET_AVAILABLE,
  createTreasuryArgs,
  devnetClient,
  expectSendToFail,
  nowBN,
  proposeTransactionArgs,
  type ProvisionedTreasury,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

const CHAIN_ETHEREUM = 1;
const TX_TYPE_TRANSFER = 0;
const EVM_DEAD = "0x000000000000000000000000000000000000dead";

function externalKeys() {
  return {
    ciphertextA: Keypair.generate().publicKey,
    ciphertextB: Keypair.generate().publicKey,
    ciphertextC: Keypair.generate().publicKey,
    ciphertextD: Keypair.generate().publicKey,
    request: Keypair.generate().publicKey,
    config: Keypair.generate().publicKey,
    deposit: Keypair.generate().publicKey,
    networkEncryptionKey: Keypair.generate().publicKey,
  };
}

function confidentialProposalArgs(now = nowBN()) {
  const args = proposeTransactionArgs(now);
  return {
    amountUsd: args.amountUsd,
    targetChain: args.targetChain,
    txType: args.txType,
    protocolId: args.protocolId,
    currentTimestamp: args.currentTimestamp,
    expectedOutputUsd: args.expectedOutputUsd,
    actualOutputUsd: args.actualOutputUsd,
    quoteAgeSecs: args.quoteAgeSecs,
    counterpartyRiskScore: args.counterpartyRiskScore,
    recipientOrContract: args.recipientOrContract,
  };
}

function manageConfidentialAccounts(
  t: ProvisionedTreasury,
  guardrails: ReturnType<typeof deriveConfidentialGuardrailsAddress>[0],
) {
  return {
    owner: t.owner,
    treasury: t.treasury,
    guardrails,
    dailyLimitCiphertext: null,
    perTxLimitCiphertext: null,
    velocityLimitCiphertext: null,
    hourlyLimitCiphertext: null,
    weeklyLimitCiphertext: null,
    spentTodayCiphertext: null,
    weeklySpentCiphertext: null,
    hourlySpentCiphertext: null,
    velocityWindowCiphertext: null,
  };
}

async function provisionTrustIdentity(t: ProvisionedTreasury) {
  const [trustIdentity] = deriveTrustIdentityAddress(t.treasury);
  await sendAndConfirm(
    [
      await instructions.policy.initTrustIdentity(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          trustIdentity,
          systemProgram: SystemProgram.programId,
        },
        args: { now: nowBN() },
      }),
    ],
    [],
    "initTrustIdentity",
  );
  return trustIdentity;
}

test("confidential guardrail lifecycle rejects without Encrypt ciphertext accounts", {
  skip,
}, async () => {
  const t = await provisionTreasury({
    prefix: "conf-guard",
    activate: true,
  });
  const [guardrails] = deriveConfidentialGuardrailsAddress(t.treasury);
  const keys = externalKeys();

  const initIx = await instructions.confidential.initConfidentialGuardrails(
    client,
    {
      accounts: {
        owner: t.owner,
        treasury: t.treasury,
        guardrails,
        dailyLimitCiphertext: keys.ciphertextA,
        perTxLimitCiphertext: keys.ciphertextB,
        spentTodayCiphertext: keys.ciphertextC,
        systemProgram: SystemProgram.programId,
      },
      args: { epochId: new BN(1), now: nowBN() },
    },
  );
  await expectSendToFail(
    [initIx],
    "initConfidentialGuardrails invalid ciphertext accounts",
  );

  const configureIx =
    await instructions.confidential.configureConfidentialGuardrails(client, {
      accounts: {
        owner: t.owner,
        treasury: t.treasury,
        dailyLimitCiphertext: keys.ciphertextA,
        perTxLimitCiphertext: keys.ciphertextB,
        spentTodayCiphertext: keys.ciphertextC,
      },
      args: { now: nowBN() },
    });
  await expectSendToFail(
    [configureIx],
    "configureConfidentialGuardrails invalid ciphertext accounts",
  );

  await expectSendToFail(
    [
      await instructions.confidential.updateConfidentialGuardrails(client, {
        accounts: manageConfidentialAccounts(t, guardrails),
        args: { now: nowBN() },
      }),
    ],
    "updateConfidentialGuardrails missing sidecar",
  );
  await expectSendToFail(
    [
      await instructions.confidential.rotateConfidentialGuardrails(client, {
        accounts: manageConfidentialAccounts(t, guardrails),
        args: { newEpochId: new BN(2), now: nowBN() },
      }),
    ],
    "rotateConfidentialGuardrails missing sidecar",
  );
  await expectSendToFail(
    [
      await instructions.confidential.resetConfidentialCounters(client, {
        accounts: manageConfidentialAccounts(t, guardrails),
        args: { now: nowBN() },
      }),
    ],
    "resetConfidentialCounters missing sidecar",
  );
  await expectSendToFail(
    [
      await instructions.confidential.disableConfidentialGuardrails(client, {
        accounts: { owner: t.owner, treasury: t.treasury, guardrails },
        args: { now: nowBN() },
      }),
    ],
    "disableConfidentialGuardrails missing sidecar",
  );
  await expectSendToFail(
    [
      await instructions.confidential.closeConfidentialGuardrails(client, {
        accounts: { owner: t.owner, treasury: t.treasury, guardrails },
      }),
    ],
    "closeConfidentialGuardrails missing sidecar",
  );
});

test("confidential proposal/decryption/batch builders reject at Encrypt boundary", {
  skip,
}, async () => {
  const t = await provisionTreasury({
    prefix: "conf-cpi",
    activate: true,
  });
  const keys = externalKeys();
  const [cpiAuthority] = deriveEncryptCpiAuthorityAddress();
  const [eventAuthority] = deriveEncryptEventAuthorityAddress(
    ENCRYPT_DEVNET_PROGRAM_ID,
  );

  await expectSendToFail(
    [
      await instructions.confidential.proposeConfidentialTransaction(client, {
        accounts: {
          aiAuthority: t.owner,
          treasury: t.treasury,
          dailyLimitCiphertext: keys.ciphertextA,
          perTxLimitCiphertext: keys.ciphertextB,
          spentTodayCiphertext: keys.ciphertextC,
          amountCiphertext: keys.ciphertextD,
          policyOutputCiphertext: Keypair.generate().publicKey,
          encryptProgram: ENCRYPT_DEVNET_PROGRAM_ID,
          config: keys.config,
          deposit: keys.deposit,
          callerProgram: AURA_PROGRAM_ID,
          cpiAuthority,
          networkEncryptionKey: keys.networkEncryptionKey,
          eventAuthority,
          externalLiveness: null,
          weeklyLimitCiphertext: null,
          weeklySpentCiphertext: null,
          confidentialGuardrails: null,
          systemProgram: SystemProgram.programId,
        },
        args: confidentialProposalArgs(),
      }),
    ],
    "proposeConfidentialTransaction guardrails/ciphertext missing",
  );

  await expectSendToFail(
    [
      await instructions.confidential.requestPolicyDecryption(client, {
        accounts: {
          operator: t.owner,
          treasury: t.treasury,
          requestAccount: keys.request,
          ciphertext: keys.ciphertextA,
          encryptProgram: ENCRYPT_DEVNET_PROGRAM_ID,
          config: keys.config,
          deposit: keys.deposit,
          callerProgram: AURA_PROGRAM_ID,
          cpiAuthority,
          networkEncryptionKey: keys.networkEncryptionKey,
          eventAuthority,
          confidentialGuardrails: null,
          systemProgram: SystemProgram.programId,
        },
        args: { now: nowBN(), currentEpochId: new BN(1) },
      }),
    ],
    "requestPolicyDecryption no pending confidential proposal",
  );

  await expectSendToFail(
    [
      await instructions.confidential.confirmPolicyDecryption(client, {
        accounts: {
          operator: t.owner,
          treasury: t.treasury,
          requestAccount: keys.request,
          confidentialGuardrails: null,
        },
        args: { now: nowBN(), currentEpochId: new BN(1) },
      }),
    ],
    "confirmPolicyDecryption no pending confidential proposal",
  );

  const batchId = Date.now();
  const [batch] = deriveBatchProposalAddress(t.treasury, batchId);
  await expectSendToFail(
    [
      await instructions.batch.proposeConfidentialBatch(client, {
        accounts: {
          payer: t.owner,
          treasury: t.treasury,
          batch,
          amountVectorCiphertext: keys.ciphertextA,
          perItemLimitVectorCiphertext: keys.ciphertextB,
          itemViolationVectorCiphertext: keys.ciphertextC,
          encryptProgram: ENCRYPT_DEVNET_PROGRAM_ID,
          config: keys.config,
          deposit: keys.deposit,
          callerProgram: AURA_PROGRAM_ID,
          cpiAuthority,
          networkEncryptionKey: keys.networkEncryptionKey,
          eventAuthority,
          systemProgram: SystemProgram.programId,
        },
        args: {
          batchId: new BN(batchId),
          now: nowBN(),
          itemCount: 1,
        },
      }),
    ],
    "proposeConfidentialBatch invalid ciphertext accounts",
  );
});

test("dWallet authority transfer builders reach the CPI boundary", {
  skip,
}, async () => {
  const t = await provisionTreasury({
    prefix: "dwallet-cpi",
    activate: true,
  });
  const [cpiAuthority] = deriveDwalletCpiAuthorityAddress();
  const dwallet = Keypair.generate().publicKey;
  const shutdownAt = nowBN();
  const recovery = Keypair.generate().publicKey;

  await sendAndConfirm(
    [
      await instructions.governance.emergencyShutdown(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { recoveryPubkey: recovery, now: shutdownAt },
      }),
    ],
    [],
    "emergencyShutdown",
  );
  await expectSendToFail(
    [
      await instructions.governance.breakGlassTransferAuthority(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          dwallet,
          callerProgram: AURA_PROGRAM_ID,
          cpiAuthority,
          dwalletProgram: DWALLET_DEVNET_PROGRAM_ID,
        },
        args: {
          chain: CHAIN_ETHEREUM,
          newAuthority: Keypair.generate().publicKey,
          now: shutdownAt.add(new BN(3_601)),
        },
      }),
    ],
    "breakGlassTransferAuthority missing dWallet account",
  );

  const handoverTreasury = await provisionTreasury({
    prefix: "handover-cpi",
    activate: true,
  });
  const trustIdentity = await provisionTrustIdentity(handoverTreasury);
  const successor = Keypair.generate().publicKey;
  const nominatedAt = nowBN();
  await sendAndConfirm(
    [
      await instructions.lifecycle.nominateSuccessorOwner(client, {
        accounts: {
          caller: handoverTreasury.owner,
          treasury: handoverTreasury.treasury,
          trustIdentity,
        },
        args: {
          newOwner: successor,
          now: nominatedAt,
        },
      }),
    ],
    [],
    "nominateSuccessorOwner",
  );
  await expectSendToFail(
    [
      await instructions.lifecycle.executeOwnershipHandover(client, {
        accounts: {
          caller: handoverTreasury.owner,
          treasury: handoverTreasury.treasury,
          trustIdentity,
          dwallet,
          callerProgram: AURA_PROGRAM_ID,
          cpiAuthority,
          dwalletProgram: DWALLET_DEVNET_PROGRAM_ID,
        },
        args: {
          chain: CHAIN_ETHEREUM,
          finalize: false,
          now: nominatedAt.add(new BN(172_801)),
        },
      }),
    ],
    "executeOwnershipHandover missing dWallet account",
  );
});

test("promote_canary rejects until the sample floor is met", { skip }, async () => {
  const t = await provisionTreasury({
    prefix: "canary-promote",
    activate: true,
  });
  const [policyHistory] = derivePolicyHistoryAddress(t.treasury);
  const [policyCanary] = derivePolicyCanaryAddress(t.treasury);

  await sendAndConfirm(
    [
      await instructions.policy.initPolicyHistory(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          policyHistory,
          systemProgram: SystemProgram.programId,
        },
      }),
    ],
    [],
    "initPolicyHistory",
  );
  await sendAndConfirm(
    [
      await instructions.policy.startCanary(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          policyCanary,
          systemProgram: SystemProgram.programId,
        },
        args: {
          candidate: createTreasuryArgs(t.owner, t.agentId).policyConfig,
          sampleCap: 10,
          now: nowBN(),
        },
      }),
    ],
    [],
    "startCanary",
  );
  const canary = await accounts.fetchPolicyCanaryAccount(client, policyCanary);
  if (canary.samples >= canary.sampleCap) {
    throw new Error("fresh canary unexpectedly already met sample floor");
  }

  await expectSendToFail(
    [
      await instructions.policy.promoteCanary(client, {
        accounts: {
          owner: t.owner,
          treasury: t.treasury,
          policyHistory,
          policyCanary,
        },
        args: { now: nowBN() },
      }),
    ],
    "promoteCanary sample floor unmet",
  );
});
