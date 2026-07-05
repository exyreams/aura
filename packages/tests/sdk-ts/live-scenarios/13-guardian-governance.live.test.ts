/**
 * Live scenario 13: guardian governance over a funded treasury.
 *
 * This covers the non-owner guardian path against a real funded treasury/dWallet
 * context. It does not execute ownership handover or move tokens; the handover
 * path is intentionally stopped at the timelock guard before any dWallet CPI.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DWALLET_DEVNET_PROGRAM_ID,
  deriveDwalletCpiAuthorityAddress,
  deriveTrustIdentityAddress,
} from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import { readTokenBalance } from "../support/live/assets.js";
import {
  CHAIN_SOLANA,
  prepareLiveAuraScenario,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

test("guardian can emergency-revoke and nominate handover without moving funds", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const guardian = Keypair.generate();
  const successor = Keypair.generate().publicKey;
  const agent = Keypair.generate().publicKey;
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-guardian",
  });
  const [trustIdentity] = deriveTrustIdentityAddress(
    scenario.treasury,
    scenario.program.programId,
  );
  const [cpiAuthority] = deriveDwalletCpiAuthorityAddress(
    scenario.program.programId,
  );
  const configuredAt = nowBN();

  await sendLiveIxs(
    [
      await scenario.program.methods
        .configureMultisig({
          requiredSignatures: 1,
          guardians: [guardian.publicKey],
          guardianWeights: [1],
          requiredApprovalWeight: 1,
          timestamp: configuredAt,
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
        })
        .instruction(),
    ],
    "configureMultisig(live guardian)",
  );

  const treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  assert.equal(treasury.multisig?.guardians.length, 1);
  assert.equal(
    treasury.multisig?.guardians[0]?.key.toBase58(),
    guardian.publicKey.toBase58(),
  );

  await sendLiveIxs(
    [
      await scenario.program.methods
        .initTrustIdentity(configuredAt.add(new BN(1)))
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          trustIdentity,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "initTrustIdentity(live guardian)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .registerAgent({
          key: agent,
          label: "guardian-agent",
          allowedChains: Buffer.from([CHAIN_SOLANA]),
          allowedTxTypes: Buffer.from([0]),
          dailyLimitUsd: scenario.allowedPerTxUsd,
          now: configuredAt.add(new BN(2)),
        })
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          trustIdentity,
        })
        .instruction(),
    ],
    "registerAgent(live guardian)",
  );

  await sendLiveIxs(
    [
      await scenario.program.methods
        .emergencyRevokeAgent(agent, configuredAt.add(new BN(3)))
        .accountsPartial({
          caller: guardian.publicKey,
          treasury: scenario.treasury,
          trustIdentity,
        })
        .instruction(),
    ],
    "emergencyRevokeAgent(guardian live)",
    [guardian],
  );

  let identity =
    await scenario.program.account.trustIdentityAccount.fetch(trustIdentity);
  const revokedAgent = identity.agents.find(
    (entry) => entry.key.toBase58() === agent.toBase58(),
  );
  assert.equal(revokedAgent?.enabled, false);

  const nominatedAt = configuredAt.add(new BN(4));
  await sendLiveIxs(
    [
      await scenario.program.methods
        .nominateSuccessorOwner({
          newOwner: successor,
          now: nominatedAt,
        })
        .accountsPartial({
          caller: guardian.publicKey,
          treasury: scenario.treasury,
          trustIdentity,
        })
        .instruction(),
    ],
    "nominateSuccessorOwner(guardian live)",
    [guardian],
  );

  identity =
    await scenario.program.account.trustIdentityAccount.fetch(trustIdentity);
  assert.equal(
    identity.pendingOwnershipHandover?.successorOwner.toBase58(),
    successor.toBase58(),
  );

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .executeOwnershipHandover({
            chain: CHAIN_SOLANA,
            finalize: false,
            now: nominatedAt.add(new BN(1)),
          })
          .accountsPartial({
            caller: guardian.publicKey,
            treasury: scenario.treasury,
            trustIdentity,
            dwallet: scenario.dwalletPda,
            callerProgram: scenario.program.programId,
            cpiAuthority,
            dwalletProgram: DWALLET_DEVNET_PROGRAM_ID,
          })
          .instruction(),
      ],
      "executeOwnershipHandover(timelock live)",
      [guardian],
    );
  }, /OwnershipHandoverTimelockActive|0x17d5|simulation failed/i);

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
