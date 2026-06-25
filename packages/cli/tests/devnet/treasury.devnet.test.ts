/**
 * Devnet: treasury lifecycle through the CLI.
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
const agentId = uniqueAgentId("treasury");

let treasuryPda = "";
let createSignature = "";

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  await assertFunded();
  const created = runJson<{ treasury: string; signature: string }>([
    "treasury",
    "create",
    "--agent-id",
    agentId,
    "--daily-limit",
    "12000",
    "--per-tx-limit",
    "1200",
    "--daytime-hourly-limit",
    "3000",
    "--nighttime-hourly-limit",
    "700",
    "--velocity-limit",
    "6000",
  ]).json;
  treasuryPda = created.treasury;
  createSignature = created.signature;
});

test("treasury create lands on devnet", { skip }, () => {
  assert.ok(createSignature, "expected a confirmed signature");
  assert.ok(treasuryPda, "expected a derived treasury PDA");
});

test("treasury show round-trips on-chain state", { skip }, () => {
  const shown = runJson<{ account: { agentId: string } }>([
    "treasury",
    "show",
    "--agent-id",
    agentId,
  ]).json;
  assert.equal(shown.account.agentId, agentId);
});

test("treasury list includes the new treasury", { skip }, () => {
  const list = runJson<Array<{ account: { agentId: string } }>>([
    "treasury",
    "list",
  ]).json;
  assert.ok(Array.isArray(list));
  assert.ok(list.some((entry) => entry.account.agentId === agentId));
});

test("treasury propose then cancel", { skip }, () => {
  const proposed = runJson<{ signature: string }>([
    "treasury",
    "propose",
    "--agent-id",
    agentId,
    "--amount",
    "75",
    "--chain",
    "solana",
    "--tx-type",
    "transfer",
    "--recipient",
    getPayer().publicKey.toBase58(),
  ]).json;
  assert.ok(proposed.signature);

  const cancelled = runJson<{ signature: string }>([
    "treasury",
    "cancel",
    "--agent-id",
    agentId,
  ]).json;
  assert.ok(cancelled.signature);
});

test("treasury pause then unpause", { skip }, () => {
  const paused = runJson<{ paused: boolean; signature: string }>([
    "treasury",
    "pause",
    "--agent-id",
    agentId,
  ]).json;
  assert.equal(paused.paused, true);

  const unpaused = runJson<{ paused: boolean }>([
    "treasury",
    "pause",
    "--agent-id",
    agentId,
    "--unpause",
  ]).json;
  assert.equal(unpaused.paused, false);
});

test("pda treasury matches the created PDA", { skip }, () => {
  const pda = runJson<{ address: string }>([
    "pda",
    "treasury",
    "--owner",
    getPayer().publicKey.toBase58(),
    "--agent-id",
    agentId,
  ]).json;
  assert.equal(pda.address, treasuryPda);
});
