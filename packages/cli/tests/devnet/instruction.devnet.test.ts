/**
 * Devnet: the raw `ix` surface drives any instruction by name.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { before, test } from "node:test";

import {
  assertFunded,
  DEVNET_AVAILABLE,
  nowSeconds,
  runJson,
  uniqueAgentId,
} from "../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const agentId = uniqueAgentId("ix");

let treasuryPda = "";

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  await assertFunded();
  treasuryPda = runJson<{ treasury: string }>([
    "treasury",
    "create",
    "--agent-id",
    agentId,
    "--daily-limit",
    "10000",
    "--per-tx-limit",
    "1000",
  ]).json.treasury;
});

test("ix send transition_agent_state activates the treasury", { skip }, () => {
  const sent = runJson<{ signature: string }>([
    "ix",
    "send",
    "transition_agent_state",
    "--account",
    "owner=$wallet",
    "--account",
    `treasury=${treasuryPda}`,
    "--args",
    JSON.stringify({ target_state: 1, now: nowSeconds() }),
  ]).json;
  assert.ok(sent.signature);

  const shown = runJson<{ account: { agentState: number } }>([
    "treasury",
    "show",
    "--agent-id",
    agentId,
  ]).json;
  assert.equal(shown.account.agentState, 1);
});
