/**
 * Devnet: lifecycle scenario matrix.
 *
 * This suite goes beyond generated-builder coverage and exercises common
 * operator mistakes: wrong actors, missing prerequisites, boundary inputs, and
 * repeated state transitions. It stays single-signer/devnet-feasible except
 * for short-lived test signers that are explicitly funded where Anchor uses
 * them as account-creation payers.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accounts,
  deriveOperatorRoleAddress,
  deriveSessionKeyAddress,
  deriveTrustIdentityAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  getPayer,
  nowBN,
  type ProvisionedTreasury,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

async function fundSigner(signer: Keypair, lamports = 20_000_000) {
  await sendAndConfirm(
    [
      SystemProgram.transfer({
        fromPubkey: getPayer().publicKey,
        toPubkey: signer.publicKey,
        lamports,
      }),
    ],
    [],
    "fund test signer",
  );
}

async function provisionTrustIdentity(prefix: string): Promise<{
  t: ProvisionedTreasury;
  trustIdentity: ReturnType<typeof deriveTrustIdentityAddress>[0];
}> {
  const t = await provisionTreasury({ prefix });
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
  return { t, trustIdentity };
}

function registerAgentArgs(key: Keypair["publicKey"], now = nowBN()) {
  return {
    key,
    label: "matrix-agent",
    allowedChains: Buffer.from([1, 2]),
    allowedTxTypes: Buffer.from([0, 1]),
    dailyLimitUsd: new BN(5_000),
    now,
  };
}

function capabilityArgs(key: Keypair["publicKey"], now = nowBN()) {
  return {
    key,
    allowedChains: Buffer.from([1]),
    allowedTxTypes: Buffer.from([0]),
    dailyLimitUsd: new BN(1_000),
    allowedProtocols: new BN(0),
    allowedInstructions: 0,
    perTxLimitUsd: null,
    recipientList: null,
    allowedAssets: null,
    activeWindowStart: null,
    activeWindowEnd: null,
    now,
  };
}

test("session keys enforce owner/AI authority matrix", { skip }, async () => {
  const aiAuthority = Keypair.generate();
  await fundSigner(aiAuthority);

  const t = await provisionTreasury({
    prefix: "life-auth",
    mutateArgs: (args) => {
      args.aiAuthority = aiAuthority.publicKey;
    },
  });
  const treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(
    treasury.aiAuthority.toBase58(),
    aiAuthority.publicKey.toBase58(),
  );

  const sessionKey = Keypair.generate().publicKey;
  const [sessionKeyAccount] = deriveSessionKeyAddress(t.treasury, sessionKey);
  const issuedAt = nowBN();

  await sendAndConfirm(
    [
      await instructions.lifecycle.issueSessionKey(client, {
        accounts: {
          authority: aiAuthority.publicKey,
          treasury: t.treasury,
          sessionKeyAccount,
          systemProgram: SystemProgram.programId,
        },
        args: {
          sessionKey,
          durationSecs: new BN(3_600),
          maxAmountUsdPerTx: null,
          maxDailySpendUsd: null,
          allowedChains: Buffer.from([1]),
          allowedTxTypes: Buffer.from([0]),
          maxProposalCount: null,
          now: issuedAt,
        },
      }),
    ],
    [aiAuthority],
    "issueSessionKey(ai)",
  );
  let session = await accounts.fetchSessionKeyAccount(
    client,
    sessionKeyAccount,
  );
  assert.equal(session.issuedBy.toBase58(), aiAuthority.publicKey.toBase58());
  assert.equal(session.revoked, false);

  const stranger = Keypair.generate();
  const unauthorizedUpdate = await instructions.lifecycle.updateSessionKey(
    client,
    {
      accounts: {
        authority: stranger.publicKey,
        treasury: t.treasury,
        sessionKeyAccount,
      },
      args: {
        extendDurationSecs: new BN(60),
        maxAmountUsdPerTx: null,
        maxDailySpendUsd: null,
        allowedChains: null,
        allowedTxTypes: null,
        maxProposalCount: null,
        now: issuedAt.add(new BN(1)),
      },
    },
  );
  await expectSendToFail(
    [unauthorizedUpdate],
    "updateSessionKey unauthorized",
    [stranger],
  );

  await sendAndConfirm(
    [
      await instructions.lifecycle.updateSessionKey(client, {
        accounts: {
          authority: aiAuthority.publicKey,
          treasury: t.treasury,
          sessionKeyAccount,
        },
        args: {
          extendDurationSecs: new BN(60),
          maxAmountUsdPerTx: new BN(100),
          maxDailySpendUsd: null,
          allowedChains: null,
          allowedTxTypes: null,
          maxProposalCount: null,
          now: issuedAt.add(new BN(2)),
        },
      }),
    ],
    [aiAuthority],
    "updateSessionKey(ai)",
  );
  session = await accounts.fetchSessionKeyAccount(client, sessionKeyAccount);
  assert.equal(session.maxAmountUsdPerTx?.toString(), "100");

  const unauthorizedRevoke = await instructions.lifecycle.revokeSessionKey(
    client,
    {
      accounts: {
        authority: stranger.publicKey,
        treasury: t.treasury,
        sessionKeyAccount,
      },
      args: { now: issuedAt.add(new BN(3)) },
    },
  );
  await expectSendToFail(
    [unauthorizedRevoke],
    "revokeSessionKey unauthorized",
    [stranger],
  );

  await sendAndConfirm(
    [
      await instructions.lifecycle.revokeSessionKey(client, {
        accounts: {
          authority: aiAuthority.publicKey,
          treasury: t.treasury,
          sessionKeyAccount,
        },
        args: { now: issuedAt.add(new BN(4)) },
      }),
    ],
    [aiAuthority],
    "revokeSessionKey(ai)",
  );
  session = await accounts.fetchSessionKeyAccount(client, sessionKeyAccount);
  assert.equal(session.revoked, true);

  const unauthorizedClose = await instructions.lifecycle.closeSessionKey(
    client,
    {
      accounts: {
        authority: stranger.publicKey,
        treasury: t.treasury,
        sessionKeyAccount,
      },
    },
  );
  await expectSendToFail([unauthorizedClose], "closeSessionKey unauthorized", [
    stranger,
  ]);

  await sendAndConfirm(
    [
      await instructions.lifecycle.closeSessionKey(client, {
        accounts: {
          authority: aiAuthority.publicKey,
          treasury: t.treasury,
          sessionKeyAccount,
        },
      }),
    ],
    [aiAuthority],
    "closeSessionKey(ai)",
  );
  assert.equal(
    await accounts.fetchSessionKeyAccountNullable(client, sessionKeyAccount),
    null,
  );
});

test("trust-identity instructions reject before init_trust_identity", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "life-pre" });
  const [trustIdentity] = deriveTrustIdentityAddress(t.treasury);
  const agentKey = Keypair.generate().publicKey;

  await expectSendToFail(
    [
      await instructions.lifecycle.registerAgent(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: registerAgentArgs(agentKey),
      }),
    ],
    "registerAgent without trust identity",
  );

  await expectSendToFail(
    [
      await instructions.lifecycle.setAgentTripwires(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          policyDenialWeight: 100,
          anomalyWeight: 100,
          failOpenAbuseWeight: 100,
          approvalMissWeight: 100,
          now: nowBN(),
        },
      }),
    ],
    "setAgentTripwires without trust identity",
  );

  await expectSendToFail(
    [
      await instructions.lifecycle.nominateSuccessorOwner(client, {
        accounts: { caller: t.owner, treasury: t.treasury, trustIdentity },
        args: { newOwner: Keypair.generate().publicKey, now: nowBN() },
      }),
    ],
    "nominateSuccessorOwner without trust identity",
  );
});

test("agent registry validates labels and max-agent capacity", {
  skip,
}, async () => {
  const { t, trustIdentity } = await provisionTrustIdentity("life-agents");
  const now = nowBN();

  for (const label of ["", "x".repeat(33)]) {
    await expectSendToFail(
      [
        await instructions.lifecycle.registerAgent(client, {
          accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
          args: {
            ...registerAgentArgs(Keypair.generate().publicKey, now),
            label,
          },
        }),
      ],
      `registerAgent invalid label ${label.length}`,
    );
  }

  const registerIxs = [];
  for (let index = 0; index < 8; index += 1) {
    registerIxs.push(
      await instructions.lifecycle.registerAgent(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          ...registerAgentArgs(Keypair.generate().publicKey, now),
          label: `agent-${index}`,
        },
      }),
    );
  }
  await sendAndConfirm(registerIxs, [], "registerAgent(max)");
  const trust = await accounts.fetchTrustIdentityAccount(client, trustIdentity);
  assert.equal(trust.agents.length, 8);

  await expectSendToFail(
    [
      await instructions.lifecycle.registerAgent(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          ...registerAgentArgs(Keypair.generate().publicKey, now),
          label: "agent-overflow",
        },
      }),
    ],
    "registerAgent over max agents",
  );
});

test("capability windows and loosen reset are enforced", { skip }, async () => {
  const { t, trustIdentity } = await provisionTrustIdentity("life-cap");
  const now = nowBN();
  const agentKey = Keypair.generate().publicKey;

  await sendAndConfirm(
    [
      await instructions.lifecycle.registerAgent(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: registerAgentArgs(agentKey, now),
      }),
    ],
    [],
    "registerAgent",
  );

  await expectSendToFail(
    [
      await instructions.lifecycle.setAgentCapability(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          ...capabilityArgs(agentKey, now),
          activeWindowStart: now,
          activeWindowEnd: null,
        },
      }),
    ],
    "capability start without end",
  );

  await expectSendToFail(
    [
      await instructions.lifecycle.setAgentCapability(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          ...capabilityArgs(agentKey, now),
          activeWindowStart: now.add(new BN(10)),
          activeWindowEnd: now,
        },
      }),
    ],
    "capability end before start",
  );

  await sendAndConfirm(
    [
      await instructions.lifecycle.armCapabilityLoosen(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: { key: agentKey, now },
      }),
    ],
    [],
    "armCapabilityLoosen",
  );
  let trust = await accounts.fetchTrustIdentityAccount(client, trustIdentity);
  let agent = trust.agents.find((a) => a.key.equals(agentKey));
  assert.equal(
    agent?.loosenUnlockAt.toString(),
    now.add(new BN(172_800)).toString(),
  );

  await sendAndConfirm(
    [
      await instructions.lifecycle.setAgentCapability(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: capabilityArgs(agentKey, now.add(new BN(1))),
      }),
    ],
    [],
    "setAgentCapability(tighten-after-arm)",
  );
  trust = await accounts.fetchTrustIdentityAccount(client, trustIdentity);
  agent = trust.agents.find((a) => a.key.equals(agentKey));
  assert.equal(
    agent?.loosenUnlockAt.toString(),
    "0",
    "any successful capability set consumes the armed loosen window",
  );

  await expectSendToFail(
    [
      await instructions.lifecycle.setAgentCapability(client, {
        accounts: { owner: t.owner, treasury: t.treasury, trustIdentity },
        args: {
          key: agentKey,
          allowedChains: Buffer.from([1, 2]),
          allowedTxTypes: Buffer.from([0, 1]),
          dailyLimitUsd: new BN(2_000),
          allowedProtocols: new BN(1),
          allowedInstructions: 1,
          perTxLimitUsd: new BN(500),
          recipientList: null,
          allowedAssets: null,
          activeWindowStart: null,
          activeWindowEnd: null,
          now: now.add(new BN(172_801)),
        },
      }),
    ],
    "loosen after consumed timelock",
  );
});

test("operator role update rejects exact-expiry boundary", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "life-op-boundary" });
  const operator = Keypair.generate().publicKey;
  const [operatorRole] = deriveOperatorRoleAddress(t.treasury, operator);
  const now = nowBN();

  await sendAndConfirm(
    [
      await instructions.lifecycle.grantOperatorRole(client, {
        accounts: {
          owner: t.owner,
          operator,
          treasury: t.treasury,
          operatorRole,
          systemProgram: SystemProgram.programId,
        },
        args: {
          permissionMask: new BN(1),
          expiresAt: now.add(new BN(600)),
          now,
        },
      }),
    ],
    [],
    "grantOperatorRole",
  );

  await expectSendToFail(
    [
      await instructions.lifecycle.updateOperatorRole(client, {
        accounts: { owner: t.owner, treasury: t.treasury, operatorRole },
        args: {
          permissionMask: null,
          expiresAt: now.add(new BN(60)),
          now: now.add(new BN(60)),
        },
      }),
    ],
    "updateOperatorRole exact expiry",
  );
});
