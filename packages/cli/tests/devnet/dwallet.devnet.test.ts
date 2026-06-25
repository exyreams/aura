/**
 * Devnet: dWallet registration through the CLI.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";

import {
  assertFunded,
  DEVNET_AVAILABLE,
  getPayer,
  runJson,
  uniqueAgentId,
} from "../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const agentId = uniqueAgentId("dwallet");
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

test("dwallet register attaches a dWallet reference", { skip }, () => {
  const result = runJson<{ signature: string }>([
    "dwallet",
    "register",
    "--agent-id",
    agentId,
    "--chain",
    "solana",
    "--dwallet-id",
    `dwallet-${suffix}`,
    "--address",
    getPayer().publicKey.toBase58(),
    "--balance",
    "2500",
  ]).json;
  assert.ok(result.signature);
});

test("dwallet list returns the registered dWallet", { skip }, () => {
  const result = runJson<{ dwallets: unknown[] }>([
    "dwallet",
    "list",
    "--agent-id",
    agentId,
  ]).json;
  assert.equal(result.dwallets.length, 1);
});
