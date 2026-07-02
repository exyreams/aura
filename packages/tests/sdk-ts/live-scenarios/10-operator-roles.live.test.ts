/**
 * Live scenario 10: delegated operator controls with funded treasury context.
 *
 * A generated operator receives a scoped-pause role, mutates a live policy
 * control on the funded dWallet treasury, then loses that ability after revoke.
 * No token transfer is signed or broadcast in this scenario.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { deriveOperatorRoleAddress } from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import { readTokenBalance } from "../support/live/assets.js";
import {
  assertDeniedProposal,
  baseTransferProposalArgs,
  prepareLiveAuraScenario,
  VIOLATION_EXECUTION_SCOPE_PAUSED,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

const MANAGE_SCOPED_PAUSE = new BN(1 << 5);

test("operator role delegates scoped pause and revoke removes it", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const operator = Keypair.generate();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-operator-role",
    policyOverrides: ({ defaultLargeLimitUsd }) => ({
      recipientDailyLimitUsd: defaultLargeLimitUsd,
      recipientPerTxLimitUsd: null,
    }),
  });
  const [operatorRole] = deriveOperatorRoleAddress(
    scenario.treasury,
    operator.publicKey,
    scenario.program.programId,
  );
  const grantedAt = nowBN();

  await sendLiveIxs(
    [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: operator.publicKey,
        lamports: 20_000_000,
      }),
    ],
    "fund live operator signer",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .grantOperatorRole({
          permissionMask: MANAGE_SCOPED_PAUSE,
          expiresAt: grantedAt.add(new BN(86_400)),
          now: grantedAt,
        })
        .accountsPartial({
          owner: payer.publicKey,
          operator: operator.publicKey,
          treasury: scenario.treasury,
          operatorRole,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "grantOperatorRole(live scoped pause)",
  );

  const role =
    await scenario.program.account.operatorRoleAccount.fetch(operatorRole);
  assert.equal(role.operator.toBase58(), operator.publicKey.toBase58());
  assert.equal(role.permissionMask.toString(), MANAGE_SCOPED_PAUSE.toString());
  assert.equal(role.revoked, false);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .setScopedPause({
          scopeKind: 1,
          chain: 2,
          txType: null,
          recipient: null,
          protocolId: null,
          paused: true,
          expiresAt: null,
          now: grantedAt.add(new BN(1)),
        })
        .accountsPartial({
          operator: operator.publicKey,
          treasury: scenario.treasury,
          operatorRole,
        })
        .instruction(),
    ],
    "setScopedPause(operator live)",
    [operator],
  );

  await assertDeniedProposal({
    scenario,
    label: "operator-scoped-pause",
    args: baseTransferProposalArgs(scenario),
    expectedViolation: VIOLATION_EXECUTION_SCOPE_PAUSED,
    clearMode: "cancel",
  });

  await sendLiveIxs(
    [
      await scenario.program.methods
        .setScopedPause({
          scopeKind: 1,
          chain: 2,
          txType: null,
          recipient: null,
          protocolId: null,
          paused: false,
          expiresAt: null,
          now: grantedAt.add(new BN(2)),
        })
        .accountsPartial({
          operator: operator.publicKey,
          treasury: scenario.treasury,
          operatorRole,
        })
        .instruction(),
    ],
    "setScopedPause(operator unpause live)",
    [operator],
  );

  await sendLiveIxs(
    [
      await scenario.program.methods
        .revokeOperatorRole(nowBN())
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          operatorRole,
        })
        .instruction(),
    ],
    "revokeOperatorRole(live)",
  );

  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .setScopedPause({
            scopeKind: 1,
            chain: 2,
            txType: null,
            recipient: null,
            protocolId: null,
            paused: true,
            expiresAt: null,
            now: grantedAt.add(new BN(3)),
          })
          .accountsPartial({
            operator: operator.publicKey,
            treasury: scenario.treasury,
            operatorRole,
          })
          .instruction(),
      ],
      "setScopedPause(revoked operator live)",
      [operator],
    );
  }, /OperatorRoleExpired|0x179d|simulation failed/i);

  const afterRole =
    await scenario.program.account.operatorRoleAccount.fetch(operatorRole);
  assert.equal(afterRole.revoked, true);
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
