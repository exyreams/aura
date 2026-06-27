/**
 * PDA derivation coverage.
 *
 * Each helper is checked for determinism and against a manual
 * `findProgramAddressSync` using the documented seed layout (which mirrors
 * `programs/aura-core/src/instructions/*`), plus input validation.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { sha256 } from "@noble/hashes/sha2.js";
import { Keypair, PublicKey } from "@solana/web3.js";
import {
  ACTIVITY_LOG_SEED,
  ADDRESS_LIST_SEED,
  AURA_PROGRAM_ID,
  BATCH_PROPOSAL_SEED,
  BILLING_TEMPLATE_SEED,
  BUDGET_ENVELOPE_SEED,
  CHAIN_PROFILE_SEED,
  CONDITIONAL_PROPOSAL_SEED,
  CONFIDENTIAL_GUARDRAILS_SEED,
  deriveActivityLogAddress,
  deriveAddressListAddress,
  deriveBatchProposalAddress,
  deriveBillingTemplateAddress,
  deriveBudgetEnvelopeAddress,
  deriveChainProfileAddress,
  deriveConditionalProposalAddress,
  deriveConfidentialGuardrailsAddress,
  deriveDwalletCpiAuthorityAddress,
  deriveDwalletStateAddress,
  deriveEncryptCpiAuthorityAddress,
  deriveEncryptEventAuthorityAddress,
  deriveExposureGroupAddress,
  deriveExternalLivenessAddress,
  deriveFeeScheduleAddress,
  deriveFeeVaultAddress,
  deriveHealthScoreAddress,
  deriveInvariantReportAddress,
  deriveOperatorRoleAddress,
  derivePolicyAttestationAddress,
  derivePolicyCanaryAddress,
  derivePolicyCheckAddress,
  derivePolicyHistoryAddress,
  derivePolicyReceiptAddress,
  derivePolicySimulationAddress,
  derivePolicyTemplateAddress,
  deriveProtocolConfigAddress,
  deriveScheduledIntentAddress,
  deriveSessionKeyAddress,
  deriveSnapshotAddress,
  deriveSwarmPoolAddress,
  deriveTreasuryAddress,
  deriveTreasuryAnalyticsAddress,
  deriveTrustIdentityAddress,
  EXPOSURE_GROUP_SEED,
  EXTERNAL_LIVENESS_SEED,
  FEE_SCHEDULE_SEED,
  FEE_VAULT_SEED,
  HEALTH_SCORE_SEED,
  hashSwarmId,
  INVARIANT_REPORT_SEED,
  OPERATOR_ROLE_SEED,
  POLICY_ATTESTATION_SEED,
  POLICY_CANARY_SEED,
  POLICY_CHECK_SEED,
  POLICY_HISTORY_SEED,
  POLICY_RECEIPT_SEED,
  POLICY_SIMULATION_SEED,
  POLICY_TEMPLATE_SEED,
  PROTOCOL_CONFIG_SEED,
  SCHEDULED_INTENT_SEED,
  SESSION_KEY_SEED,
  SNAPSHOT_SEED,
  SWARM_POOL_SEED,
  TREASURY_ANALYTICS_SEED,
  TREASURY_SEED,
  TRUST_IDENTITY_SEED,
} from "../../../../sdk-ts/src/index.js";

const PROGRAM = Keypair.generate().publicKey;

function u64Le(value: number): Buffer {
  const b = Buffer.alloc(8);
  b.writeBigUInt64LE(BigInt(value));
  return b;
}
function u32Le(value: number): Buffer {
  const b = Buffer.alloc(4);
  b.writeUInt32LE(value);
  return b;
}
function find(seeds: Buffer[], programId = PROGRAM): PublicKey {
  return PublicKey.findProgramAddressSync(seeds, programId)[0];
}
function base58(value: [PublicKey, number]): string {
  return value[0].toBase58();
}

// treasury

test("deriveTreasuryAddress matches canonical seeds and is deterministic", () => {
  const owner = Keypair.generate().publicKey;
  const [a, bump] = deriveTreasuryAddress(owner, "agent-1", PROGRAM);
  const [b] = deriveTreasuryAddress(owner, "agent-1", PROGRAM);
  assert.equal(a.toBase58(), b.toBase58());
  assert.ok(bump >= 0 && bump <= 255);
  assert.equal(
    a.toBase58(),
    find(
      [TREASURY_SEED, owner.toBuffer(), Buffer.from("agent-1", "utf8")],
      PROGRAM,
    ).toBase58(),
  );
  assert.equal(PublicKey.isOnCurve(a.toBytes()), false);
});

test("deriveTreasuryAddress varies by owner, agentId, programId", () => {
  const owner = Keypair.generate().publicKey;
  const other = Keypair.generate().publicKey;
  assert.notEqual(
    base58(deriveTreasuryAddress(owner, "a", PROGRAM)),
    base58(deriveTreasuryAddress(other, "a", PROGRAM)),
  );
  assert.notEqual(
    base58(deriveTreasuryAddress(owner, "a", PROGRAM)),
    base58(deriveTreasuryAddress(owner, "b", PROGRAM)),
  );
  assert.notEqual(
    base58(deriveTreasuryAddress(owner, "a", PROGRAM)),
    base58(deriveTreasuryAddress(owner, "a", Keypair.generate().publicKey)),
  );
});

test("deriveTreasuryAddress defaults to AURA_PROGRAM_ID", () => {
  const owner = Keypair.generate().publicKey;
  assert.equal(
    base58(deriveTreasuryAddress(owner, "agent-1")),
    base58(deriveTreasuryAddress(owner, "agent-1", AURA_PROGRAM_ID)),
  );
});

// global / external authorities

test("CPI authority PDAs are deterministic, distinct, and program-scoped", () => {
  assert.equal(
    base58(deriveDwalletCpiAuthorityAddress(PROGRAM)),
    base58(deriveDwalletCpiAuthorityAddress(PROGRAM)),
  );
  assert.notEqual(
    base58(deriveDwalletCpiAuthorityAddress(PROGRAM)),
    base58(deriveEncryptCpiAuthorityAddress(PROGRAM)),
  );
  assert.notEqual(
    base58(deriveDwalletCpiAuthorityAddress(PROGRAM)),
    base58(deriveDwalletCpiAuthorityAddress(Keypair.generate().publicKey)),
  );
  assert.equal(
    base58(deriveDwalletCpiAuthorityAddress()),
    base58(deriveDwalletCpiAuthorityAddress(AURA_PROGRAM_ID)),
  );
  assert.equal(
    base58(deriveEncryptCpiAuthorityAddress()),
    base58(deriveEncryptCpiAuthorityAddress(AURA_PROGRAM_ID)),
  );
});

test("deriveEncryptEventAuthorityAddress is scoped to the encrypt program", () => {
  const enc = Keypair.generate().publicKey;
  assert.equal(
    base58(deriveEncryptEventAuthorityAddress(enc)),
    base58(deriveEncryptEventAuthorityAddress(enc)),
  );
  assert.notEqual(
    base58(deriveEncryptEventAuthorityAddress(enc)),
    base58(deriveEncryptEventAuthorityAddress(Keypair.generate().publicKey)),
  );
});

// per-treasury single-seed sidecars

const SIDECARS: ReadonlyArray<
  [string, (t: PublicKey, p?: PublicKey) => [PublicKey, number], Buffer]
> = [
  ["activityLog", deriveActivityLogAddress, ACTIVITY_LOG_SEED],
  ["addressList", deriveAddressListAddress, ADDRESS_LIST_SEED],
  [
    "confidentialGuardrails",
    deriveConfidentialGuardrailsAddress,
    CONFIDENTIAL_GUARDRAILS_SEED,
  ],
  ["feeSchedule", deriveFeeScheduleAddress, FEE_SCHEDULE_SEED],
  ["feeVault", deriveFeeVaultAddress, FEE_VAULT_SEED],
  ["healthScore", deriveHealthScoreAddress, HEALTH_SCORE_SEED],
  ["policyCanary", derivePolicyCanaryAddress, POLICY_CANARY_SEED],
  ["policyHistory", derivePolicyHistoryAddress, POLICY_HISTORY_SEED],
  [
    "treasuryAnalytics",
    deriveTreasuryAnalyticsAddress,
    TREASURY_ANALYTICS_SEED,
  ],
  ["trustIdentity", deriveTrustIdentityAddress, TRUST_IDENTITY_SEED],
  ["externalLiveness", deriveExternalLivenessAddress, EXTERNAL_LIVENESS_SEED],
];

for (const [name, fn, seed] of SIDECARS) {
  test(`derive${name} matches [seed, treasury] and defaults program id`, () => {
    const treasury = Keypair.generate().publicKey;
    assert.equal(
      base58(fn(treasury, PROGRAM)),
      find([seed, treasury.toBuffer()], PROGRAM).toBase58(),
      name,
    );
    assert.equal(base58(fn(treasury)), base58(fn(treasury, AURA_PROGRAM_ID)));
  });
}

// per-treasury indexed (u64) PDAs

const INDEXED: ReadonlyArray<
  [
    string,
    (t: PublicKey, id: number, p?: PublicKey) => [PublicKey, number],
    Buffer,
  ]
> = [
  ["policySimulation", derivePolicySimulationAddress, POLICY_SIMULATION_SEED],
  ["policyReceipt", derivePolicyReceiptAddress, POLICY_RECEIPT_SEED],
  ["budgetEnvelope", deriveBudgetEnvelopeAddress, BUDGET_ENVELOPE_SEED],
  ["batchProposal", deriveBatchProposalAddress, BATCH_PROPOSAL_SEED],
  ["invariantReport", deriveInvariantReportAddress, INVARIANT_REPORT_SEED],
  [
    "conditionalProposal",
    deriveConditionalProposalAddress,
    CONDITIONAL_PROPOSAL_SEED,
  ],
  ["scheduledIntent", deriveScheduledIntentAddress, SCHEDULED_INTENT_SEED],
];

for (const [name, fn, seed] of INDEXED) {
  test(`derive${name} matches [seed, treasury, u64Le(id)]`, () => {
    const treasury = Keypair.generate().publicKey;
    assert.equal(
      base58(fn(treasury, 42, PROGRAM)),
      find([seed, treasury.toBuffer(), u64Le(42)], PROGRAM).toBase58(),
      name,
    );
    assert.notEqual(
      base58(fn(treasury, 1, PROGRAM)),
      base58(fn(treasury, 2, PROGRAM)),
    );
  });
}

test("indexed PDA helpers reject out-of-range u64 ids", () => {
  const treasury = Keypair.generate().publicKey;
  assert.throws(() => deriveBudgetEnvelopeAddress(treasury, -1), /u64/);
});

// snapshot uses a u32 index

test("deriveSnapshotAddress matches [seed, treasury, u32Le(index)]", () => {
  const treasury = Keypair.generate().publicKey;
  assert.equal(
    base58(deriveSnapshotAddress(treasury, 7, PROGRAM)),
    find([SNAPSHOT_SEED, treasury.toBuffer(), u32Le(7)], PROGRAM).toBase58(),
  );
  assert.equal(
    base58(deriveSnapshotAddress(treasury, 7)),
    base58(deriveSnapshotAddress(treasury, 7, AURA_PROGRAM_ID)),
  );
  assert.throws(() => deriveSnapshotAddress(treasury, 2 ** 32), /u32/);
  assert.throws(() => deriveSnapshotAddress(treasury, -1), /u32/);
});

// pubkey-keyed PDAs

test("deriveSessionKeyAddress matches [seed, treasury, sessionKey]", () => {
  const treasury = Keypair.generate().publicKey;
  const sessionKey = Keypair.generate().publicKey;
  assert.equal(
    base58(deriveSessionKeyAddress(treasury, sessionKey, PROGRAM)),
    find(
      [SESSION_KEY_SEED, treasury.toBuffer(), sessionKey.toBuffer()],
      PROGRAM,
    ).toBase58(),
  );
});

test("derivePolicyCheckAddress matches [seed, treasury, caller]", () => {
  const treasury = Keypair.generate().publicKey;
  const caller = Keypair.generate().publicKey;
  assert.equal(
    base58(derivePolicyCheckAddress(treasury, caller, PROGRAM)),
    find(
      [POLICY_CHECK_SEED, treasury.toBuffer(), caller.toBuffer()],
      PROGRAM,
    ).toBase58(),
  );
});

// owner-scoped template PDAs

test("template PDAs match [seed, owner, u64Le(templateId)]", () => {
  const owner = Keypair.generate().publicKey;
  assert.equal(
    base58(derivePolicyTemplateAddress(owner, 3, PROGRAM)),
    find(
      [POLICY_TEMPLATE_SEED, owner.toBuffer(), u64Le(3)],
      PROGRAM,
    ).toBase58(),
  );
  assert.equal(
    base58(deriveBillingTemplateAddress(owner, 3, PROGRAM)),
    find(
      [BILLING_TEMPLATE_SEED, owner.toBuffer(), u64Le(3)],
      PROGRAM,
    ).toBase58(),
  );
});

// chain / dwallet-state / singleton

test("deriveChainProfileAddress matches [seed, [chainCode]] with no treasury", () => {
  assert.equal(
    base58(deriveChainProfileAddress(2, PROGRAM)),
    find([CHAIN_PROFILE_SEED, Buffer.from([2])], PROGRAM).toBase58(),
  );
  assert.throws(() => deriveChainProfileAddress(256), /u8/);
  assert.throws(() => deriveChainProfileAddress(-1), /u8/);
});

test("deriveDwalletStateAddress matches [seed, treasury, [chain]]", () => {
  const treasury = Keypair.generate().publicKey;
  assert.equal(
    base58(deriveDwalletStateAddress(treasury, 2, PROGRAM)),
    find(
      [Buffer.from("dwallet_state"), treasury.toBuffer(), Buffer.from([2])],
      PROGRAM,
    ).toBase58(),
  );
  assert.throws(() => deriveDwalletStateAddress(treasury, 256), /u8/);
});

test("deriveProtocolConfigAddress matches the [seed] singleton", () => {
  assert.equal(
    base58(deriveProtocolConfigAddress(PROGRAM)),
    find([PROTOCOL_CONFIG_SEED], PROGRAM).toBase58(),
  );
  assert.equal(
    base58(deriveProtocolConfigAddress()),
    base58(deriveProtocolConfigAddress(AURA_PROGRAM_ID)),
  );
});

// exposure group / operator role / attestation (multi-key)

test("deriveExposureGroupAddress matches [seed, authority, groupId(16)]", () => {
  const authority = Keypair.generate().publicKey;
  const groupId = new Uint8Array(16).fill(0x33);
  assert.equal(
    base58(deriveExposureGroupAddress(authority, groupId, PROGRAM)),
    find(
      [EXPOSURE_GROUP_SEED, authority.toBuffer(), Buffer.from(groupId)],
      PROGRAM,
    ).toBase58(),
  );
  assert.throws(
    () => deriveExposureGroupAddress(authority, new Uint8Array(15)),
    /16 bytes/,
  );
});

test("deriveOperatorRoleAddress matches [seed, treasury, operator]", () => {
  const treasury = Keypair.generate().publicKey;
  const operator = Keypair.generate().publicKey;
  assert.equal(
    base58(deriveOperatorRoleAddress(treasury, operator, PROGRAM)),
    find(
      [OPERATOR_ROLE_SEED, treasury.toBuffer(), operator.toBuffer()],
      PROGRAM,
    ).toBase58(),
  );
});

test("derivePolicyAttestationAddress matches [seed, treasury, attester, u64Le(version)]", () => {
  const treasury = Keypair.generate().publicKey;
  const attester = Keypair.generate().publicKey;
  assert.equal(
    base58(derivePolicyAttestationAddress(treasury, attester, 9, PROGRAM)),
    find(
      [
        POLICY_ATTESTATION_SEED,
        treasury.toBuffer(),
        attester.toBuffer(),
        u64Le(9),
      ],
      PROGRAM,
    ).toBase58(),
  );
});

// swarm pool (sha256 of swarm id)

test("hashSwarmId is sha256 of the utf-8 swarm id", () => {
  const hash = hashSwarmId("my-swarm");
  assert.equal(hash.length, 32);
  assert.deepEqual(hash, sha256(Buffer.from("my-swarm", "utf8")));
});

test("deriveSwarmPoolAddress accepts a string or a precomputed hash", () => {
  const fromString = deriveSwarmPoolAddress("my-swarm", PROGRAM);
  const fromHash = deriveSwarmPoolAddress(hashSwarmId("my-swarm"), PROGRAM);
  const manual = find(
    [SWARM_POOL_SEED, Buffer.from(sha256(Buffer.from("my-swarm", "utf8")))],
    PROGRAM,
  );
  assert.equal(base58(fromString), manual.toBase58());
  assert.equal(base58(fromHash), manual.toBase58());
  assert.throws(
    () => deriveSwarmPoolAddress(new Uint8Array(31), PROGRAM),
    /32 bytes/,
  );
});
