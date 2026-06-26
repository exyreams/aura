/**
 * Program id and PDA seed constants.
 *
 * Verifies the SDK constants stay in lockstep with the deployed program:
 * the program id is read from the IDL, and every seed matches the byte string
 * declared in `programs/aura-core/src/constants.rs`.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { PublicKey } from "@solana/web3.js";
import {
  ACTIVITY_LOG_SEED,
  ADDRESS_LIST_SEED,
  AURA_IDL,
  AURA_PROGRAM_ID,
  BATCH_PROPOSAL_SEED,
  BILLING_TEMPLATE_SEED,
  BUDGET_ENVELOPE_SEED,
  CHAIN_PROFILE_SEED,
  CONDITIONAL_PROPOSAL_SEED,
  CONFIDENTIAL_GUARDRAILS_SEED,
  DEVNET_RPC_URL,
  DWALLET_CPI_AUTHORITY_SEED,
  DWALLET_DEVNET_PROGRAM_ID,
  DWALLET_SEED,
  DWALLET_STATE_SEED,
  ENCRYPT_CPI_AUTHORITY_SEED,
  ENCRYPT_DEVNET_PROGRAM_ID,
  ENCRYPT_EVENT_AUTHORITY_SEED,
  EXPOSURE_GROUP_SEED,
  EXTERNAL_LIVENESS_SEED,
  FEE_SCHEDULE_SEED,
  FEE_VAULT_SEED,
  HEALTH_SCORE_SEED,
  INVARIANT_REPORT_SEED,
  MESSAGE_APPROVAL_SEED,
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
} from "../../../src/index.js";

test("AURA_PROGRAM_ID is read from the IDL address", () => {
  assert.equal(AURA_PROGRAM_ID.toBase58(), AURA_IDL.address);
  assert.equal(
    AURA_PROGRAM_ID.toBase58(),
    "auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce",
  );
});

test("Ika devnet program ids and RPC url are valid", () => {
  assert.ok(DWALLET_DEVNET_PROGRAM_ID instanceof PublicKey);
  assert.ok(ENCRYPT_DEVNET_PROGRAM_ID instanceof PublicKey);
  assert.match(DEVNET_RPC_URL, /^https?:\/\//);
});

// Every seed must match the byte string in programs/aura-core/src/constants.rs.
const SEED_BYTES: ReadonlyArray<[Buffer, string]> = [
  [TREASURY_SEED, "treasury"],
  [DWALLET_CPI_AUTHORITY_SEED, "__ika_cpi_authority"],
  [DWALLET_SEED, "dwallet"],
  [ENCRYPT_CPI_AUTHORITY_SEED, "__encrypt_cpi_authority"],
  [ENCRYPT_EVENT_AUTHORITY_SEED, "__event_authority"],
  [MESSAGE_APPROVAL_SEED, "message_approval"],
  [POLICY_RECEIPT_SEED, "policy_receipt"],
  [POLICY_SIMULATION_SEED, "policy_simulation"],
  [BUDGET_ENVELOPE_SEED, "budget_envelope"],
  [EXPOSURE_GROUP_SEED, "exposure_group"],
  [OPERATOR_ROLE_SEED, "operator_role"],
  [EXTERNAL_LIVENESS_SEED, "external_liveness"],
  [POLICY_ATTESTATION_SEED, "policy_attestation"],
  [BATCH_PROPOSAL_SEED, "batch_proposal"],
  [INVARIANT_REPORT_SEED, "invariant_report"],
  [DWALLET_STATE_SEED, "dwallet_state"],
  [ACTIVITY_LOG_SEED, "activity_log"],
  [ADDRESS_LIST_SEED, "address_list"],
  [BILLING_TEMPLATE_SEED, "billing_template"],
  [CHAIN_PROFILE_SEED, "chain_profile"],
  [CONDITIONAL_PROPOSAL_SEED, "conditional_proposal"],
  [CONFIDENTIAL_GUARDRAILS_SEED, "confidential_guardrails"],
  [FEE_SCHEDULE_SEED, "fee_schedule"],
  [FEE_VAULT_SEED, "fee_vault"],
  [HEALTH_SCORE_SEED, "health_score"],
  [POLICY_CANARY_SEED, "policy_canary"],
  [POLICY_CHECK_SEED, "policy_check"],
  [POLICY_HISTORY_SEED, "policy_history"],
  [POLICY_TEMPLATE_SEED, "policy_template"],
  [PROTOCOL_CONFIG_SEED, "protocol_config"],
  [SCHEDULED_INTENT_SEED, "scheduled_intent"],
  [SESSION_KEY_SEED, "session_key"],
  [SNAPSHOT_SEED, "treasury_snapshot"],
  [SWARM_POOL_SEED, "swarm_pool"],
  [TREASURY_ANALYTICS_SEED, "treasury_analytics"],
  [TRUST_IDENTITY_SEED, "trust_identity"],
];

test("PDA seeds match the program's declared byte strings", () => {
  for (const [seed, text] of SEED_BYTES) {
    assert.ok(Buffer.isBuffer(seed), text);
    assert.equal(seed.toString("utf8"), text);
  }
});
