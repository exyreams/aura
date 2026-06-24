/**
 * Input validation helpers.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { Keypair, type PublicKey } from "@solana/web3.js";
import {
  MAX_ADDRESS_LEN,
  MAX_AGENT_ID_LEN,
  MAX_DWALLET_ID_LEN,
  MAX_GUARDIANS,
  MAX_SWARM_ID_LEN,
  MAX_SWARM_MEMBER_LEN,
  MAX_SWARM_MEMBERS,
  validateAddress,
  validateAgentId,
  validateAmountUsd,
  validateDwalletId,
  validateGuardians,
  validateMultisigThreshold,
  validateSwarmId,
  validateSwarmMembers,
} from "../../src/index.js";

function keys(count: number): PublicKey[] {
  return Array.from({ length: count }, () => Keypair.generate().publicKey);
}

test("limit constants match the on-chain program", () => {
  assert.equal(MAX_AGENT_ID_LEN, 64);
  assert.equal(MAX_DWALLET_ID_LEN, 64);
  assert.equal(MAX_ADDRESS_LEN, 128);
  assert.equal(MAX_GUARDIANS, 10);
  assert.equal(MAX_SWARM_MEMBERS, 16);
  assert.equal(MAX_SWARM_ID_LEN, 64);
  assert.equal(MAX_SWARM_MEMBER_LEN, 64);
});

test("validateAgentId enforces non-empty + max byte length", () => {
  assert.doesNotThrow(() => validateAgentId("my-agent"));
  assert.doesNotThrow(() => validateAgentId("a".repeat(MAX_AGENT_ID_LEN)));
  assert.throws(() => validateAgentId(""), /empty/);
  assert.throws(
    () => validateAgentId("a".repeat(MAX_AGENT_ID_LEN + 1)),
    /exceeds/,
  );
});

test("validateDwalletId enforces non-empty + max byte length", () => {
  assert.doesNotThrow(() => validateDwalletId("dwallet-1"));
  assert.throws(() => validateDwalletId(""), /empty/);
  assert.throws(
    () => validateDwalletId("a".repeat(MAX_DWALLET_ID_LEN + 1)),
    /exceeds/,
  );
});

test("validateAddress enforces non-empty + max byte length", () => {
  assert.doesNotThrow(() => validateAddress("0xdeadbeef"));
  assert.throws(() => validateAddress(""), /empty/);
  assert.throws(
    () => validateAddress("a".repeat(MAX_ADDRESS_LEN + 1)),
    /exceeds/,
  );
});

test("validateSwarmId enforces non-empty + max byte length", () => {
  assert.doesNotThrow(() => validateSwarmId("swarm-1"));
  assert.throws(() => validateSwarmId(""), /empty/);
  assert.throws(
    () => validateSwarmId("a".repeat(MAX_SWARM_ID_LEN + 1)),
    /exceeds/,
  );
});

test("validateAmountUsd requires a positive amount", () => {
  assert.doesNotThrow(() => validateAmountUsd(1));
  assert.doesNotThrow(() => validateAmountUsd(1n));
  assert.throws(() => validateAmountUsd(0), /greater than zero/);
  assert.throws(() => validateAmountUsd(-1), /greater than zero/);
});

test("validateMultisigThreshold bounds the threshold by guardian count", () => {
  assert.doesNotThrow(() => validateMultisigThreshold(1, 3));
  assert.doesNotThrow(() => validateMultisigThreshold(3, 3));
  assert.throws(() => validateMultisigThreshold(0, 3), /greater than zero/);
  assert.throws(() => validateMultisigThreshold(4, 3), /must not exceed/);
});

test("validateGuardians enforces a non-empty, bounded pubkey list", () => {
  assert.doesNotThrow(() => validateGuardians(keys(1)));
  assert.doesNotThrow(() => validateGuardians(keys(MAX_GUARDIANS)));
  assert.throws(() => validateGuardians([]), /empty/);
  assert.throws(
    () => validateGuardians(keys(MAX_GUARDIANS + 1)),
    /exceeds maximum/,
  );
});

test("validateSwarmMembers enforces count and per-member length", () => {
  assert.doesNotThrow(() => validateSwarmMembers(["agent-1"]));
  assert.doesNotThrow(() =>
    validateSwarmMembers(new Array(MAX_SWARM_MEMBERS).fill("x")),
  );
  assert.throws(() => validateSwarmMembers([]), /empty/);
  assert.throws(
    () => validateSwarmMembers(new Array(MAX_SWARM_MEMBERS + 1).fill("x")),
    /exceeds maximum/,
  );
  assert.throws(
    () => validateSwarmMembers(["a".repeat(MAX_SWARM_MEMBER_LEN + 1)]),
    /exceeds maximum length/,
  );
});
