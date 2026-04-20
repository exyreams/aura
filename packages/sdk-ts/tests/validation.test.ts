import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_ADDRESS_LEN,
  MAX_AGENT_ID_LEN,
  MAX_DWALLET_ID_LEN,
  MAX_GUARDIANS,
  MAX_SWARM_MEMBERS,
  validateAddress,
  validateAgentId,
  validateAmountUsd,
  validateDwalletId,
  validateGuardians,
  validateMultisigThreshold,
  validateSwarmMembers,
} from "../src/index.js";

// constants match the on-chain program (programs/aura-core/src/constants.rs)

test("constants: MAX_AGENT_ID_LEN is 64", () => {
  assert.equal(MAX_AGENT_ID_LEN, 64);
});

test("constants: MAX_DWALLET_ID_LEN is 64", () => {
  assert.equal(MAX_DWALLET_ID_LEN, 64);
});

test("constants: MAX_ADDRESS_LEN is 128", () => {
  assert.equal(MAX_ADDRESS_LEN, 128);
});

test("constants: MAX_GUARDIANS is 10", () => {
  assert.equal(MAX_GUARDIANS, 10);
});

test("constants: MAX_SWARM_MEMBERS is 16", () => {
  assert.equal(MAX_SWARM_MEMBERS, 16);
});

// validateAgentId

test("validateAgentId: accepts valid id", () => {
  assert.doesNotThrow(() => validateAgentId("my-agent"));
  assert.doesNotThrow(() => validateAgentId("a".repeat(MAX_AGENT_ID_LEN)));
});

test("validateAgentId: rejects empty string", () => {
  assert.throws(() => validateAgentId(""), /empty/);
});

test("validateAgentId: rejects id exceeding max length", () => {
  assert.throws(() => validateAgentId("a".repeat(MAX_AGENT_ID_LEN + 1)), /exceeds/);
});

// validateDwalletId

test("validateDwalletId: accepts valid id", () => {
  assert.doesNotThrow(() => validateDwalletId("dwallet-1"));
  assert.doesNotThrow(() => validateDwalletId("a".repeat(MAX_DWALLET_ID_LEN)));
});

test("validateDwalletId: rejects empty string", () => {
  assert.throws(() => validateDwalletId(""), /empty/);
});

test("validateDwalletId: rejects id exceeding max length", () => {
  assert.throws(() => validateDwalletId("a".repeat(MAX_DWALLET_ID_LEN + 1)), /exceeds/);
});

// validateAddress

test("validateAddress: accepts valid address", () => {
  assert.doesNotThrow(() => validateAddress("0xdeadbeef"));
  assert.doesNotThrow(() => validateAddress("a".repeat(MAX_ADDRESS_LEN)));
});

test("validateAddress: rejects empty string", () => {
  assert.throws(() => validateAddress(""), /empty/);
});

test("validateAddress: rejects address exceeding max length", () => {
  assert.throws(() => validateAddress("a".repeat(MAX_ADDRESS_LEN + 1)), /exceeds/);
});

// validateAmountUsd

test("validateAmountUsd: accepts positive number", () => {
  assert.doesNotThrow(() => validateAmountUsd(1));
  assert.doesNotThrow(() => validateAmountUsd(1_000_000));
});

test("validateAmountUsd: accepts positive bigint", () => {
  assert.doesNotThrow(() => validateAmountUsd(1n));
});

test("validateAmountUsd: rejects zero", () => {
  assert.throws(() => validateAmountUsd(0), /greater than zero/);
});

test("validateAmountUsd: rejects negative", () => {
  assert.throws(() => validateAmountUsd(-1), /greater than zero/);
});

// validateMultisigThreshold

test("validateMultisigThreshold: accepts valid threshold", () => {
  assert.doesNotThrow(() => validateMultisigThreshold(1, 3));
  assert.doesNotThrow(() => validateMultisigThreshold(3, 3));
});

test("validateMultisigThreshold: rejects zero threshold", () => {
  assert.throws(() => validateMultisigThreshold(0, 3), /greater than zero/);
});

test("validateMultisigThreshold: rejects threshold exceeding count", () => {
  assert.throws(() => validateMultisigThreshold(4, 3), /must not exceed/);
});

// validateGuardians

test("validateGuardians: accepts valid list", () => {
  assert.doesNotThrow(() => validateGuardians(new Array(MAX_GUARDIANS).fill("x")));
  assert.doesNotThrow(() => validateGuardians(["a"]));
});

test("validateGuardians: rejects empty list", () => {
  assert.throws(() => validateGuardians([]), /empty/);
});

test("validateGuardians: rejects list exceeding max", () => {
  assert.throws(
    () => validateGuardians(new Array(MAX_GUARDIANS + 1).fill("x")),
    /exceeds maximum/,
  );
});

// validateSwarmMembers

test("validateSwarmMembers: accepts valid list", () => {
  assert.doesNotThrow(() => validateSwarmMembers(new Array(MAX_SWARM_MEMBERS).fill("x")));
  assert.doesNotThrow(() => validateSwarmMembers(["agent-1"]));
});

test("validateSwarmMembers: rejects empty list", () => {
  assert.throws(() => validateSwarmMembers([]), /empty/);
});

test("validateSwarmMembers: rejects list exceeding max", () => {
  assert.throws(
    () => validateSwarmMembers(new Array(MAX_SWARM_MEMBERS + 1).fill("x")),
    /exceeds maximum/,
  );
});
