/**
 * Devnet: swarm shared-pool lifecycle.
 *
 * Beyond `configure_swarm` (which only attaches a config to the treasury), this
 * exercises the standalone `SwarmPoolAccount` PDA and the membership flow:
 *   - init_swarm_pool creates the pool (keyed by a hash of the swarm id).
 *   - join_swarm / leave_swarm add and remove the treasury as a member.
 *   - update_swarm rewrites the collective limit (creator-gated).
 *   - close_swarm_pool reclaims rent once the pool is empty.
 *   - join_swarm reverts when the treasury has no matching swarm config.
 *
 * Each test provisions its own treasury (configure/leave mutate treasury.swarm)
 * and a unique swarm id (the pool PDA is global per id), so re-runs never
 * collide. Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import {
  accounts,
  deriveSwarmPoolAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  configureSwarmArgs,
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  nowBN,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();

test("init_swarm_pool creates an empty pool keyed by the swarm id", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "swarm-init" });
  const swarmId = `${t.agentId}-pool`;
  const [swarmPool] = deriveSwarmPoolAddress(swarmId);

  await sendAndConfirm(
    [
      await instructions.swarm.initSwarmPool(client, {
        accounts: {
          creator: t.owner,
          swarmPool,
          systemProgram: SystemProgram.programId,
        },
        args: {
          swarmId,
          sharedPoolLimitUsd: new BN(50_000),
          timestamp: nowBN(),
        },
      }),
    ],
    [],
    "initSwarmPool",
  );

  const pool = await accounts.fetchSwarmPoolAccount(client, swarmPool);
  assert.equal(pool.creator.toBase58(), t.owner.toBase58());
  assert.equal(pool.sharedPoolLimitUsd.toString(), "50000");
  assert.equal(pool.memberCount, 0);
  assert.equal(pool.memberSpend.length, 0);
});

test("configure, join, update, leave, and close a swarm pool", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "swarm-life" });
  const swarmId = `${t.agentId}-pool`;
  const [swarmPool] = deriveSwarmPoolAddress(swarmId);

  // Attach the swarm config to the treasury so it can join the pool.
  await sendAndConfirm(
    [
      await instructions.swarm.configureSwarm(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: configureSwarmArgs(swarmId, [t.agentId]),
      }),
    ],
    [],
    "configureSwarm",
  );
  let treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(treasury.swarm?.swarmId, swarmId);

  await sendAndConfirm(
    [
      await instructions.swarm.initSwarmPool(client, {
        accounts: {
          creator: t.owner,
          swarmPool,
          systemProgram: SystemProgram.programId,
        },
        args: {
          swarmId,
          sharedPoolLimitUsd: new BN(50_000),
          timestamp: nowBN(),
        },
      }),
    ],
    [],
    "initSwarmPool",
  );

  // join
  await sendAndConfirm(
    [
      await instructions.swarm.joinSwarm(client, {
        accounts: { owner: t.owner, treasury: t.treasury, swarmPool },
        args: { now: nowBN() },
      }),
    ],
    [],
    "joinSwarm",
  );
  let pool = await accounts.fetchSwarmPoolAccount(client, swarmPool);
  assert.equal(pool.memberCount, 1, "treasury should be a member");
  assert.ok(
    pool.memberSpend.some(
      (m) => m.treasury.toBase58() === t.treasury.toBase58(),
    ),
    "member spend row for the treasury",
  );

  // update the collective limit (creator-gated)
  await sendAndConfirm(
    [
      await instructions.swarm.updateSwarm(client, {
        accounts: { owner: t.owner, treasury: t.treasury, swarmPool },
        args: { sharedPoolLimitUsd: new BN(75_000), now: nowBN() },
      }),
    ],
    [],
    "updateSwarm",
  );
  pool = await accounts.fetchSwarmPoolAccount(client, swarmPool);
  assert.equal(pool.sharedPoolLimitUsd.toString(), "75000");
  treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(
    treasury.policyConfig.sharedPoolLimitUsd?.toString(),
    "75000",
    "treasury policy mirror updated",
  );

  // leave (detaches the swarm config too)
  await sendAndConfirm(
    [
      await instructions.swarm.leaveSwarm(client, {
        accounts: { owner: t.owner, treasury: t.treasury, swarmPool },
        args: { now: nowBN() },
      }),
    ],
    [],
    "leaveSwarm",
  );
  pool = await accounts.fetchSwarmPoolAccount(client, swarmPool);
  assert.equal(pool.memberCount, 0, "pool should be empty after leave");
  treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(treasury.swarm, null, "treasury swarm config detached");

  // close the now-empty pool
  await sendAndConfirm(
    [
      await instructions.swarm.closeSwarmPool(client, {
        accounts: { creator: t.owner, swarmPool },
      }),
    ],
    [],
    "closeSwarmPool",
  );
  assert.equal(
    await accounts.fetchSwarmPoolAccountNullable(client, swarmPool),
    null,
    "closed swarm pool account should be gone",
  );
});

test("join_swarm reverts without a matching swarm config", {
  skip,
}, async () => {
  const t = await provisionTreasury({ prefix: "swarm-nojoin" });
  const swarmId = `${t.agentId}-orphan`;
  const [swarmPool] = deriveSwarmPoolAddress(swarmId);

  await sendAndConfirm(
    [
      await instructions.swarm.initSwarmPool(client, {
        accounts: {
          creator: t.owner,
          swarmPool,
          systemProgram: SystemProgram.programId,
        },
        args: {
          swarmId,
          sharedPoolLimitUsd: new BN(50_000),
          timestamp: nowBN(),
        },
      }),
    ],
    [],
    "initSwarmPool",
  );

  // The treasury never called configure_swarm, so it has no swarm config that
  // matches the pool's id -> InvalidExternalAccountData.
  const ix = await instructions.swarm.joinSwarm(client, {
    accounts: { owner: t.owner, treasury: t.treasury, swarmPool },
    args: { now: nowBN() },
  });
  await expectSendToFail([ix], "join without swarm config");
});
