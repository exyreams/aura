/**
 * Devnet: governance (multisig + swarm) through the CLI.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";

import { Keypair } from "@solana/web3.js";

import {
  assertFunded,
  DEVNET_AVAILABLE,
  getPayer,
  runJson,
  uniqueAgentId,
} from "../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const agentId = uniqueAgentId("gov");
const suffix = Date.now().toString(36);

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  await assertFunded();
  runJson<{ treasury: string }>([
    "treasury",
    "create",
    "--agent-id",
    agentId,
    "--daily-limit",
    "10000",
    "--per-tx-limit",
    "1000",
  ]);
});

test("governance multisig configures an emergency guardian set", {
  skip,
}, () => {
  const guardian = Keypair.generate().publicKey.toBase58();
  const result = runJson<{ signature: string }>([
    "governance",
    "multisig",
    "--agent-id",
    agentId,
    "--required",
    "1",
    "--guardians",
    `${getPayer().publicKey.toBase58()},${guardian}`,
  ]).json;
  assert.ok(result.signature);
});

test("governance swarm configures a shared pool", { skip }, () => {
  const result = runJson<{ signature: string }>([
    "governance",
    "swarm",
    "--agent-id",
    agentId,
    "--swarm-id",
    `swarm-${suffix}`,
    "--members",
    `${agentId},peer-${suffix}`,
    "--pool-limit",
    "50000",
  ]).json;
  assert.ok(result.signature);
});
