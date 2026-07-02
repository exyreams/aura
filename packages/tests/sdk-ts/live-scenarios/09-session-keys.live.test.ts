/**
 * Live scenario 09: session-key controls with funded treasury context.
 *
 * The session key signs a real proposal against the funded dWallet treasury.
 * The approved proposal is cancelled instead of executed, then a second
 * proposal is rejected by session quota before any funds can move.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveSessionKeyAddress } from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import { readTokenBalance } from "../support/live/assets.js";
import {
  baseTransferProposalArgs,
  prepareLiveAuraScenario,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

test("session key quota gates funded-context proposals", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-session-key",
    policyOverrides: ({ defaultLargeLimitUsd, allowedPerTxUsd }) => ({
      perTxLimitUsd: allowedPerTxUsd,
      dailyLimitUsd: defaultLargeLimitUsd,
      daytimeHourlyLimitUsd: defaultLargeLimitUsd,
      nighttimeHourlyLimitUsd: defaultLargeLimitUsd,
      velocityLimitUsd: defaultLargeLimitUsd,
      recipientDailyLimitUsd: defaultLargeLimitUsd,
      recipientPerTxLimitUsd: allowedPerTxUsd,
    }),
  });

  const sessionSigner = Keypair.generate();
  const [sessionKeyAccount] = deriveSessionKeyAddress(
    scenario.treasury,
    sessionSigner.publicKey,
    scenario.program.programId,
  );
  const issuedAt = nowBN();

  await sendLiveIxs(
    [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: sessionSigner.publicKey,
        lamports: 20_000_000,
      }),
    ],
    "fund live session signer",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .issueSessionKey({
          sessionKey: sessionSigner.publicKey,
          durationSecs: new BN(3_600),
          maxAmountUsdPerTx: scenario.allowedPerTxUsd,
          maxDailySpendUsd: scenario.allowedPerTxUsd.mul(new BN(2)),
          allowedChains: Buffer.from([2]),
          allowedTxTypes: Buffer.from([0]),
          maxProposalCount: 1,
          now: issuedAt,
        })
        .accountsPartial({
          authority: payer.publicKey,
          treasury: scenario.treasury,
          sessionKeyAccount,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "issueSessionKey(live)",
  );

  const first = baseTransferProposalArgs(scenario);
  first.currentTimestamp = issuedAt.add(new BN(1));
  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeTransaction(first)
        .accountsPartial({
          aiAuthority: sessionSigner.publicKey,
          treasury: scenario.treasury,
          sessionKeyAccount,
          swarmPool: null,
          addressList: null,
          complianceOracle: null,
          parentTreasury: null,
          budgetEnvelope: null,
          exposureGroup: null,
          dwalletState: null,
          chainProfile: null,
          trustIdentity: null,
          policyCanary: null,
        })
        .instruction(),
    ],
    "proposeTransaction(session-key first)",
    [sessionSigner],
  );

  let session =
    await scenario.program.account.sessionKeyAccount.fetch(sessionKeyAccount);
  assert.equal(session.proposalsSubmitted, 1);
  assert.equal(
    session.sessionSpentTodayUsd.toString(),
    scenario.amountUsd.toString(),
  );

  await sendLiveIxs(
    [
      await scenario.program.methods
        .cancelPending(nowBN())
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          dwalletState: null,
        })
        .instruction(),
    ],
    "cancelPending(session-key first)",
  );

  const beforeSource = await readTokenBalance(
    scenario.sourceAta,
    scenario.asset.tokenProgramId,
  );
  const beforeDestination = await readTokenBalance(
    scenario.destinationAta,
    scenario.asset.tokenProgramId,
  );

  const second = baseTransferProposalArgs(scenario);
  second.currentTimestamp = issuedAt.add(new BN(2));
  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .proposeTransaction(second)
          .accountsPartial({
            aiAuthority: sessionSigner.publicKey,
            treasury: scenario.treasury,
            sessionKeyAccount,
            swarmPool: null,
            addressList: null,
            complianceOracle: null,
            parentTreasury: null,
            budgetEnvelope: null,
            exposureGroup: null,
            dwalletState: null,
            chainProfile: null,
            trustIdentity: null,
            policyCanary: null,
          })
          .instruction(),
      ],
      "proposeTransaction(session-key quota)",
      [sessionSigner],
    );
  }, /SessionKeyScopeViolation|0x17bc|simulation failed/i);

  session =
    await scenario.program.account.sessionKeyAccount.fetch(sessionKeyAccount);
  assert.equal(session.proposalsSubmitted, 1);
  assert.equal(
    session.sessionSpentTodayUsd.toString(),
    scenario.amountUsd.toString(),
  );
  assert.equal(
    (await readTokenBalance(scenario.sourceAta, scenario.asset.tokenProgramId))
      .amount,
    beforeSource.amount,
  );
  assert.equal(
    (
      await readTokenBalance(
        scenario.destinationAta,
        scenario.asset.tokenProgramId,
      )
    ).amount,
    beforeDestination.amount,
  );
});
