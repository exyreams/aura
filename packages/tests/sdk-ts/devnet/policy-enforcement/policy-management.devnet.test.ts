/**
 * Devnet: policy management surface (presets, simulation, invariants).
 *
 *   - apply_policy_preset overwrites the active policy with a built-in preset
 *     and bumps the policy version (+ rejects an unknown preset code).
 *   - attest_policy writes a signed policy-version attestation over the exact
 *     serialized policy config.
 *   - simulate_policy evaluates a hypothetical transaction into a result PDA
 *     WITHOUT mutating spend counters or reverting on denial.
 *   - check_invariants writes a pass/fail/warn report PDA over treasury health.
 *
 * Skips automatically when no funded payer keypair is available.
 */

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { before, test } from "node:test";
import {
  AURA_IDL,
  accounts,
  deriveInvariantReportAddress,
  derivePolicyAttestationAddress,
  derivePolicySimulationAddress,
  instructions,
} from "@aura-protocol/sdk-ts";
import { BorshCoder } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import BN from "bn.js";
import {
  DEVNET_AVAILABLE,
  devnetClient,
  expectSendToFail,
  nowBN,
  type ProvisionedTreasury,
  provisionTreasury,
  sendAndConfirm,
} from "../../support/devnet.js";

const skip = DEVNET_AVAILABLE ? false : "no devnet payer keypair";
const client = devnetClient();
const coder = new BorshCoder(AURA_IDL);

const CHAIN_ETHEREUM = 1;
const TX_TYPE_TRANSFER = 0;
const EVM_DEAD = "0x000000000000000000000000000000000000dead";
const PRESET_CONSERVATIVE_DAO = 1;
const PER_TRANSACTION_LIMIT = 1;

let t: ProvisionedTreasury;

function snakeKey(key: string): string {
  return key.replace(/[A-Z]/g, (match) => `_${match.toLowerCase()}`);
}

function toRustRecordKeys(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (
    BN.isBN(value) ||
    value instanceof PublicKey ||
    value instanceof Uint8Array
  ) {
    return value;
  }
  if (Array.isArray(value)) return value.map(toRustRecordKeys);

  const record: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    record[snakeKey(key)] = toRustRecordKeys(nested);
  }
  return record;
}

before(async () => {
  if (!DEVNET_AVAILABLE) return;
  t = await provisionTreasury({ prefix: "pol-mgmt", activate: true });
});

test("attest_policy writes the policy hash for the active version", {
  skip,
}, async () => {
  const treasury = await accounts.fetchTreasuryAccount(client, t.treasury);
  const [attestation] = derivePolicyAttestationAddress(
    t.treasury,
    t.owner,
    treasury.currentPolicyVersion,
  );
  const policyBytes = coder.types.encode(
    "PolicyConfigRecord",
    toRustRecordKeys(treasury.policyConfig),
  );
  const expectedPolicyHash = Array.from(
    createHash("sha256").update(policyBytes).digest(),
  );

  await sendAndConfirm(
    [
      await instructions.policy.attestPolicy(client, {
        accounts: {
          payer: t.owner,
          attester: t.owner,
          treasury: t.treasury,
          attestation,
          systemProgram: SystemProgram.programId,
        },
        args: {
          attestationKind: 1,
          expectedPolicyHash,
          now: nowBN(),
        },
      }),
    ],
    [],
    "attestPolicy",
  );
  const stored = await accounts.fetchPolicyAttestationAccount(
    client,
    attestation,
  );
  assert.equal(stored.treasury.toBase58(), t.treasury.toBase58());
  assert.equal(stored.policyVersion, treasury.currentPolicyVersion);
  assert.deepEqual(stored.policyHash, expectedPolicyHash);
});

test("simulate_policy records an approved decision for a within-limit tx", {
  skip,
}, async () => {
  const simulationId = Date.now();
  const [simulationResult] = derivePolicySimulationAddress(
    t.treasury,
    simulationId,
  );
  await sendAndConfirm(
    [
      await instructions.policy.simulatePolicy(client, {
        accounts: {
          payer: t.owner,
          treasury: t.treasury,
          operatorRole: null,
          simulationResult,
          systemProgram: SystemProgram.programId,
        },
        args: {
          simulationId: new BN(simulationId),
          amountUsd: new BN(100),
          targetChain: CHAIN_ETHEREUM,
          txType: TX_TYPE_TRANSFER,
          protocolId: null,
          currentTimestamp: nowBN(),
          expectedOutputUsd: null,
          actualOutputUsd: null,
          quoteAgeSecs: null,
          counterpartyRiskScore: null,
          recipientOrContract: EVM_DEAD,
        },
      }),
    ],
    [],
    "simulatePolicy(approve)",
  );
  const result = await accounts.fetchPolicySimulationResultAccount(
    client,
    simulationResult,
  );
  assert.equal(result.approved, true, "within-limit simulation is approved");
  assert.equal(result.amountUsd.toString(), "100");
});

test("simulate_policy records a denial for an over-limit tx", {
  skip,
}, async () => {
  const simulationId = Date.now() + 1;
  const [simulationResult] = derivePolicySimulationAddress(
    t.treasury,
    simulationId,
  );
  await sendAndConfirm(
    [
      await instructions.policy.simulatePolicy(client, {
        accounts: {
          payer: t.owner,
          treasury: t.treasury,
          operatorRole: null,
          simulationResult,
          systemProgram: SystemProgram.programId,
        },
        args: {
          simulationId: new BN(simulationId),
          amountUsd: new BN(5_000), // over the 1000 per-tx limit
          targetChain: CHAIN_ETHEREUM,
          txType: TX_TYPE_TRANSFER,
          protocolId: null,
          currentTimestamp: nowBN(),
          expectedOutputUsd: null,
          actualOutputUsd: null,
          quoteAgeSecs: null,
          counterpartyRiskScore: null,
          recipientOrContract: EVM_DEAD,
        },
      }),
    ],
    [],
    "simulatePolicy(deny)",
  );
  const result = await accounts.fetchPolicySimulationResultAccount(
    client,
    simulationResult,
  );
  assert.equal(result.approved, false, "over-limit simulation is denied");
  assert.equal(result.violationCode, PER_TRANSACTION_LIMIT);
});

test("check_invariants writes an all-pass report for a healthy treasury", {
  skip,
}, async () => {
  const reportId = Date.now() + 2;
  const [report] = deriveInvariantReportAddress(t.treasury, reportId);
  await sendAndConfirm(
    [
      await instructions.policy.checkInvariants(client, {
        accounts: {
          payer: t.owner,
          treasury: t.treasury,
          report,
          systemProgram: SystemProgram.programId,
        },
        args: { reportId: new BN(reportId), now: nowBN() },
      }),
    ],
    [],
    "checkInvariants",
  );
  const result = await accounts.fetchInvariantReportAccount(client, report);
  assert.equal(result.failedBitmap.toString(), "0", "no invariant should fail");
  assert.notEqual(
    result.passedBitmap.toString(),
    "0",
    "invariants should be marked passed",
  );
});

test("apply_policy_preset overwrites policy and bumps the version", {
  skip,
}, async () => {
  const before = await accounts.fetchTreasuryAccount(client, t.treasury);
  await sendAndConfirm(
    [
      await instructions.policy.applyPolicyPreset(client, {
        accounts: { owner: t.owner, treasury: t.treasury },
        args: { presetKind: PRESET_CONSERVATIVE_DAO, now: nowBN() },
      }),
    ],
    [],
    "applyPolicyPreset",
  );
  const after = await accounts.fetchTreasuryAccount(client, t.treasury);
  assert.equal(
    after.currentPolicyVersion,
    before.currentPolicyVersion + 1,
    "policy version should increment",
  );
  assert.notEqual(
    after.policyConfig.dailyLimitUsd.toString(),
    before.policyConfig.dailyLimitUsd.toString(),
    "preset should rewrite the daily limit",
  );
});

test("apply_policy_preset rejects an unknown preset code", {
  skip,
}, async () => {
  const ix = await instructions.policy.applyPolicyPreset(client, {
    accounts: { owner: t.owner, treasury: t.treasury },
    args: { presetKind: 99, now: nowBN() },
  });
  await expectSendToFail([ix], "unknown preset code");
});
