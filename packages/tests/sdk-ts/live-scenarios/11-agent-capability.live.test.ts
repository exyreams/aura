/**
 * Live scenario 11: trust identity, agent capabilities, and tripwires.
 *
 * This exercises the agent-control surface against a funded treasury/dWallet
 * context. It does not sign a token transfer; every funded token balance must
 * remain unchanged.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveTrustIdentityAddress } from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import { readTokenBalance } from "../support/live/assets.js";
import { prepareLiveAuraScenario } from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

const CAPABILITY_LOOSEN_TIMELOCK_SECS = new BN(172_800);
const CHAIN_SOLANA = 2;
const TX_TYPE_TRANSFER = 0;
const TX_TYPE_DEFI_SWAP = 1;

test("agent capability tightening, loosen timelock, and tripwires", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-agent-capability",
  });
  const agent = Keypair.generate().publicKey;
  const [trustIdentity] = deriveTrustIdentityAddress(
    scenario.treasury,
    scenario.program.programId,
  );
  const registeredAt = nowBN();

  await sendLiveIxs(
    [
      await scenario.program.methods
        .initTrustIdentity(registeredAt)
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          trustIdentity,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "initTrustIdentity(live)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .registerAgent({
          key: agent,
          label: "live-worker-agent",
          allowedChains: Buffer.from([CHAIN_SOLANA]),
          allowedTxTypes: Buffer.from([TX_TYPE_TRANSFER, TX_TYPE_DEFI_SWAP]),
          dailyLimitUsd: scenario.allowedPerTxUsd.mul(new BN(4)),
          now: registeredAt,
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          trustIdentity,
        })
        .instruction(),
    ],
    "registerAgent(live)",
  );

  let identity =
    await scenario.program.account.trustIdentityAccount.fetch(trustIdentity);
  let record = identity.agents.find(
    (entry) => entry.key.toBase58() === agent.toBase58(),
  );
  assert.ok(record, "registered agent must be present");
  assert.equal(record.enabled, true);
  assert.equal(record.scope.allowedChains.length, 1);
  assert.equal(record.scope.allowedTxTypes.length, 2);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .setAgentCapability({
          key: agent,
          allowedChains: Buffer.from([CHAIN_SOLANA]),
          allowedTxTypes: Buffer.from([TX_TYPE_TRANSFER]),
          dailyLimitUsd: scenario.allowedPerTxUsd,
          allowedProtocols: new BN(0),
          allowedInstructions: 0,
          perTxLimitUsd: scenario.amountUsd,
          recipientList: null,
          allowedAssets: null,
          activeWindowStart: null,
          activeWindowEnd: null,
          now: registeredAt.add(new BN(1)),
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          trustIdentity,
        })
        .instruction(),
    ],
    "setAgentCapability(tighten live)",
  );

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .setAgentCapability({
            key: agent,
            allowedChains: Buffer.from([CHAIN_SOLANA]),
            allowedTxTypes: Buffer.from([TX_TYPE_TRANSFER, TX_TYPE_DEFI_SWAP]),
            dailyLimitUsd: scenario.allowedPerTxUsd.mul(new BN(2)),
            allowedProtocols: new BN(1),
            allowedInstructions: 1,
            perTxLimitUsd: scenario.allowedPerTxUsd,
            recipientList: null,
            allowedAssets: null,
            activeWindowStart: null,
            activeWindowEnd: null,
            now: registeredAt.add(new BN(2)),
          })
          .accountsPartial({
            owner: payer.publicKey,
            treasury: scenario.treasury,
            trustIdentity,
          })
          .instruction(),
      ],
      "setAgentCapability(loosen early live)",
    );
  }, /AgentManifestLoosenTimelock|0x17c9|simulation failed/i);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .armCapabilityLoosen(agent, registeredAt.add(new BN(3)))
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          trustIdentity,
        })
        .instruction(),
    ],
    "armCapabilityLoosen(live)",
  );

  identity =
    await scenario.program.account.trustIdentityAccount.fetch(trustIdentity);
  record = identity.agents.find(
    (entry) => entry.key.toBase58() === agent.toBase58(),
  );
  assert.equal(
    record?.loosenUnlockAt.toString(),
    registeredAt.add(new BN(3)).add(CAPABILITY_LOOSEN_TIMELOCK_SECS).toString(),
  );

  await sendLiveIxs(
    [
      await scenario.program.methods
        .setAgentCapability({
          key: agent,
          allowedChains: Buffer.from([CHAIN_SOLANA]),
          allowedTxTypes: Buffer.from([TX_TYPE_TRANSFER, TX_TYPE_DEFI_SWAP]),
          dailyLimitUsd: scenario.allowedPerTxUsd.mul(new BN(2)),
          allowedProtocols: new BN(1),
          allowedInstructions: 1,
          perTxLimitUsd: scenario.allowedPerTxUsd,
          recipientList: null,
          allowedAssets: null,
          activeWindowStart: registeredAt.add(new BN(4)),
          activeWindowEnd: registeredAt.add(new BN(7_200)),
          now: registeredAt.add(new BN(3)).add(CAPABILITY_LOOSEN_TIMELOCK_SECS),
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          trustIdentity,
        })
        .instruction(),
    ],
    "setAgentCapability(loosen after timelock live)",
  );

  await sendLiveIxs(
    [
      await scenario.program.methods
        .setAgentTripwires({
          policyDenialWeight: 111,
          anomalyWeight: 222,
          failOpenAbuseWeight: 333,
          approvalMissWeight: 44,
          now: nowBN(),
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          trustIdentity,
        })
        .instruction(),
    ],
    "setAgentTripwires(live)",
  );

  identity =
    await scenario.program.account.trustIdentityAccount.fetch(trustIdentity);
  record = identity.agents.find(
    (entry) => entry.key.toBase58() === agent.toBase58(),
  );
  assert.equal(record?.scope.allowedTxTypes.length, 2);
  assert.equal(record?.scope.allowedProtocols.toString(), "1");
  assert.equal(record?.scope.allowedInstructions, 1);
  assert.equal(
    record?.scope.perTxLimitUsd?.toString(),
    scenario.allowedPerTxUsd.toString(),
  );
  assert.equal(record?.loosenUnlockAt.toString(), "0");
  assert.equal(identity.tripwireConfig.policyDenialWeight, 111);
  assert.equal(identity.tripwireConfig.anomalyWeight, 222);
  assert.equal(identity.tripwireConfig.failOpenAbuseWeight, 333);
  assert.equal(identity.tripwireConfig.approvalMissWeight, 44);

  assert.equal(
    (await readTokenBalance(scenario.sourceAta, scenario.asset.tokenProgramId))
      .amount,
    scenario.beforeSource.amount,
  );
  assert.equal(
    (
      await readTokenBalance(
        scenario.destinationAta,
        scenario.asset.tokenProgramId,
      )
    ).amount,
    scenario.beforeDestination.amount,
  );
});
