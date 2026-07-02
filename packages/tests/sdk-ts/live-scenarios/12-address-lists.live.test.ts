/**
 * Live scenario 12: address-list policy enforcement with funded context.
 *
 * The live recipient owner is deny-listed and then allow-listed through the
 * address-list sidecar. Proposals are checked against the sidecar but no token
 * transfer is signed or broadcast.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  deriveAddressListAddress,
  deriveOperatorRoleAddress,
} from "@aura-protocol/sdk-ts";
import { Keypair, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import { getPayer, nowBN } from "../support/devnet.js";
import { readTokenBalance } from "../support/live/assets.js";
import {
  baseTransferProposalArgs,
  PROPOSE_ACCOUNTS,
  prepareLiveAuraScenario,
} from "../support/live/aura-scenario.js";
import { liveScenarioSkip } from "../support/live/config.js";
import { sendLiveIxs } from "../support/live/transfers.js";

const ADDRESS_LIST_DENY = 0;
const ADDRESS_LIST_ALLOW = 1;
const MANAGE_ADDRESS_LISTS = new BN(1 << 0);
const CHAIN_SOLANA = 2;

test("address lists block and allow funded-context recipients", {
  skip: liveScenarioSkip,
}, async () => {
  const payer = getPayer();
  const operator = Keypair.generate();
  const scenario = await prepareLiveAuraScenario({
    prefix: "live-address-list",
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
  const recipient = scenario.destinationOwner.toBase58();
  const [addressList] = deriveAddressListAddress(
    scenario.treasury,
    scenario.program.programId,
  );
  const [operatorRole] = deriveOperatorRoleAddress(
    scenario.treasury,
    operator.publicKey,
    scenario.program.programId,
  );
  const now = nowBN();

  await sendLiveIxs(
    [
      SystemProgram.transfer({
        fromPubkey: payer.publicKey,
        toPubkey: operator.publicKey,
        lamports: 20_000_000,
      }),
    ],
    "fund live address-list operator",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .grantOperatorRole({
          permissionMask: MANAGE_ADDRESS_LISTS,
          expiresAt: now.add(new BN(86_400)),
          now,
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
    "grantOperatorRole(live address lists)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .initAddressList(ADDRESS_LIST_DENY, CHAIN_SOLANA, now)
        .accountsPartial({
          owner: payer.publicKey,
          treasury: scenario.treasury,
          addressList,
          systemProgram: SystemProgram.programId,
        })
        .instruction(),
    ],
    "initAddressList(live deny)",
  );
  await sendLiveIxs(
    [
      await scenario.program.methods
        .updateAddressListEntry(recipient, true, now.add(new BN(1)))
        .accountsPartial({
          operator: operator.publicKey,
          treasury: scenario.treasury,
          operatorRole,
          addressList,
        })
        .instruction(),
    ],
    "updateAddressListEntry(operator deny live)",
    [operator],
  );

  const deniedArgs = baseTransferProposalArgs(scenario);
  await assert.rejects(async () => {
    await sendLiveIxs(
      [
        await scenario.program.methods
          .proposeTransaction(deniedArgs)
          .accountsPartial({
            aiAuthority: payer.publicKey,
            treasury: scenario.treasury,
            dwalletState: null,
            ...PROPOSE_ACCOUNTS,
            addressList,
          })
          .instruction(),
      ],
      "proposeTransaction(address-list deny live)",
    );
  }, /RecipientBlacklisted|0x178e|simulation failed/i);

  await sendLiveIxs(
    [
      await scenario.program.methods
        .manageAddressList(
          ADDRESS_LIST_ALLOW,
          CHAIN_SOLANA,
          [recipient],
          now.add(new BN(2)),
        )
        .accountsPartial({
          operator: operator.publicKey,
          treasury: scenario.treasury,
          operatorRole,
          addressList,
        })
        .instruction(),
    ],
    "manageAddressList(operator allow live)",
    [operator],
  );

  const allowedArgs = baseTransferProposalArgs(scenario);
  await sendLiveIxs(
    [
      await scenario.program.methods
        .proposeTransaction(allowedArgs)
        .accountsPartial({
          aiAuthority: payer.publicKey,
          treasury: scenario.treasury,
          dwalletState: null,
          ...PROPOSE_ACCOUNTS,
          addressList,
        })
        .instruction(),
    ],
    "proposeTransaction(address-list allow live)",
  );

  const treasury = await scenario.program.account.treasuryAccount.fetch(
    scenario.treasury,
  );
  const pending = treasury.pendingQueue[0];
  assert.ok(pending, "allow-listed proposal should be recorded");
  assert.equal(pending.decision.approved, true);
  assert.equal(pending.recipientOrContract, recipient);
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
    "cancelPending(address-list allow live)",
  );

  await sendLiveIxs(
    [
      await scenario.program.methods
        .clearAddressList(now.add(new BN(3)))
        .accountsPartial({
          operator: operator.publicKey,
          treasury: scenario.treasury,
          operatorRole,
          addressList,
        })
        .instruction(),
    ],
    "clearAddressList(operator live)",
    [operator],
  );
  const list =
    await scenario.program.account.addressListAccount.fetch(addressList);
  assert.equal(list.entryCount, 0);

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
