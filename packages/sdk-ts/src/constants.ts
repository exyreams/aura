/**
 * Program IDs, PDA seeds, and IDL-derived type aliases for the AURA SDK.
 *
 * All values here are derived from the generated IDL so they stay in sync
 * with the deployed program automatically. Do not hard-code program IDs or
 * seeds elsewhere in the SDK — import them from this module.
 */

import type { IdlAccounts, IdlTypes } from "@coral-xyz/anchor";
import { PublicKey } from "@solana/web3.js";

import type { AuraCore } from "./generated/aura_core.js";
import idlJson from "./generated/aura_core.json" with { type: "json" };

/** The raw Anchor IDL object. Exported at `@aura-protocol/sdk-ts/idl` as well. */
export const AURA_IDL = idlJson as AuraCore;

/** The deployed `aura-core` program ID, read directly from the IDL address field. */
export const AURA_PROGRAM_ID = new PublicKey(AURA_IDL.address);

/** Ika dWallet program ID on Solana devnet (pre-alpha). */
export const DWALLET_DEVNET_PROGRAM_ID = new PublicKey(
  "87W54kGYFQ1rgWqMeu4XTPHWXWmXSQCcjm8vCTfiq1oY",
);

/** Ika Encrypt program ID on Solana devnet (pre-alpha). */
export const ENCRYPT_DEVNET_PROGRAM_ID = new PublicKey(
  "4ebfzWdKnrnGseuQpezXdG8yCdHqwQ1SSBHD3bWArND8",
);

/** Default Solana devnet RPC endpoint. */
export const DEVNET_RPC_URL = "https://api.devnet.solana.com";

// PDA seeds — must match the constants defined in `programs/aura-core/src/constants.rs`.

/** Seed for the treasury PDA: `[b"treasury", owner, agentId]`. */
export const TREASURY_SEED = Buffer.from("treasury");

/** Seed for AURA's dWallet CPI authority PDA. */
export const DWALLET_CPI_AUTHORITY_SEED = Buffer.from("__ika_cpi_authority");

/** Seed prefix for dWallet account derivation on the Ika dWallet program. */
export const DWALLET_SEED = Buffer.from("dwallet");

/** Seed for AURA's Encrypt CPI authority PDA. */
export const ENCRYPT_CPI_AUTHORITY_SEED = Buffer.from(
  "__encrypt_cpi_authority",
);

/** Seed for the Encrypt program's event authority PDA (derived on the Encrypt program). */
export const ENCRYPT_EVENT_AUTHORITY_SEED = Buffer.from("__event_authority");

/** Seed for the dWallet `MessageApproval` PDA (derived on the dWallet program). */
export const MESSAGE_APPROVAL_SEED = Buffer.from("message_approval");

/** Seed for policy receipt PDAs. */
export const POLICY_RECEIPT_SEED = Buffer.from("policy_receipt");

/** Seed for policy simulation result PDAs. */
export const POLICY_SIMULATION_SEED = Buffer.from("policy_simulation");

/** Seed for budget envelope PDAs. */
export const BUDGET_ENVELOPE_SEED = Buffer.from("budget_envelope");

/** Seed for cross-treasury exposure group PDAs. */
export const EXPOSURE_GROUP_SEED = Buffer.from("exposure_group");

/** Seed for operator role PDAs. */
export const OPERATOR_ROLE_SEED = Buffer.from("operator_role");

/** Seed for external dependency liveness PDAs. */
export const EXTERNAL_LIVENESS_SEED = Buffer.from("external_liveness");

/** Seed for policy attestation PDAs. */
export const POLICY_ATTESTATION_SEED = Buffer.from("policy_attestation");

/** Seed for batch proposal PDAs. */
export const BATCH_PROPOSAL_SEED = Buffer.from("batch_proposal");

/** Seed for invariant report PDAs. */
export const INVARIANT_REPORT_SEED = Buffer.from("invariant_report");

/** Seed for AURA's per-dWallet runtime state PDA: `[seed, treasury, [chainCode]]`. */
export const DWALLET_STATE_SEED = Buffer.from("dwallet_state");

/** Seed for the per-treasury activity-log ring buffer PDA: `[seed, treasury]`. */
export const ACTIVITY_LOG_SEED = Buffer.from("activity_log");

/** Seed for the per-treasury address-list PDA: `[seed, treasury]`. */
export const ADDRESS_LIST_SEED = Buffer.from("address_list");

/** Seed for user-authored billing template PDAs: `[seed, owner, templateId]`. */
export const BILLING_TEMPLATE_SEED = Buffer.from("billing_template");

/** Seed for per-chain profile PDAs: `[seed, [chainCode]]` (no treasury component). */
export const CHAIN_PROFILE_SEED = Buffer.from("chain_profile");

/** Seed for parked conditional proposal PDAs: `[seed, treasury, proposalId]`. */
export const CONDITIONAL_PROPOSAL_SEED = Buffer.from("conditional_proposal");

/** Seed for the per-treasury confidential guardrails sidecar PDA: `[seed, treasury]`. */
export const CONFIDENTIAL_GUARDRAILS_SEED = Buffer.from(
  "confidential_guardrails",
);

/** Seed for the per-treasury fee-schedule sidecar PDA: `[seed, treasury]`. */
export const FEE_SCHEDULE_SEED = Buffer.from("fee_schedule");

/** Seed for the per-treasury protocol-fee vault PDA: `[seed, treasury]`. */
export const FEE_VAULT_SEED = Buffer.from("fee_vault");

/** Seed for the per-treasury health-score PDA: `[seed, treasury]`. */
export const HEALTH_SCORE_SEED = Buffer.from("health_score");

/** Seed for the per-treasury shadow/canary policy candidate PDA: `[seed, treasury]`. */
export const POLICY_CANARY_SEED = Buffer.from("policy_canary");

/** Seed for policy-check result PDAs: `[seed, treasury, caller]`. */
export const POLICY_CHECK_SEED = Buffer.from("policy_check");

/** Seed for the per-treasury policy-history PDA: `[seed, treasury]`. */
export const POLICY_HISTORY_SEED = Buffer.from("policy_history");

/** Seed for user-authored policy template PDAs: `[seed, owner, templateId]`. */
export const POLICY_TEMPLATE_SEED = Buffer.from("policy_template");

/** Seed for the global protocol-config singleton PDA: `[seed]`. */
export const PROTOCOL_CONFIG_SEED = Buffer.from("protocol_config");

/** Seed for scheduled intent PDAs: `[seed, treasury, intentId]`. */
export const SCHEDULED_INTENT_SEED = Buffer.from("scheduled_intent");

/** Seed for session key PDAs: `[seed, treasury, sessionKey]`. */
export const SESSION_KEY_SEED = Buffer.from("session_key");

/** Seed for periodic snapshot PDAs: `[seed, treasury, snapshotIndex]` (snapshotIndex is u32). */
export const SNAPSHOT_SEED = Buffer.from("treasury_snapshot");

/** Seed for shared swarm pool PDAs: `[seed, sha256(swarmId)]`. */
export const SWARM_POOL_SEED = Buffer.from("swarm_pool");

/** Seed for the per-treasury analytics + audit-commitment sidecar PDA: `[seed, treasury]`. */
export const TREASURY_ANALYTICS_SEED = Buffer.from("treasury_analytics");

/** Seed for the per-treasury trust + identity PDA: `[seed, treasury]`. */
export const TRUST_IDENTITY_SEED = Buffer.from("trust_identity");

// IDL-derived type aliases. These are the canonical TypeScript types for all
// on-chain account and instruction argument shapes. Import them instead of
// writing the types by hand.

/** All account types keyed by their Anchor account name. */
export type AuraAccountTypes = IdlAccounts<AuraCore>;

/** All instruction argument and struct types keyed by their IDL name. */
export type AuraTypeDefs = IdlTypes<AuraCore>;

/** Deserialized `TreasuryAccount` as returned by `program.account.treasuryAccount.fetch`. */
export type TreasuryAccountRecord = AuraAccountTypes["treasuryAccount"];

/** Arguments for the `create_treasury` instruction. */
export type CreateTreasuryArgs = AuraTypeDefs["createTreasuryArgs"];

/** Arguments for the `register_dwallet` instruction. */
export type RegisterDwalletArgs = AuraTypeDefs["registerDwalletArgs"];

/** Arguments for the `propose_transaction` instruction. */
export type ProposeTransactionArgs = AuraTypeDefs["proposeTransactionArgs"];

/** Arguments for the `propose_confidential_transaction` instruction. */
export type ProposeConfidentialTransactionArgs =
  AuraTypeDefs["proposeConfidentialTransactionArgs"];

/** Arguments for the `configure_multisig` instruction. */
export type ConfigureMultisigArgs = AuraTypeDefs["configureMultisigArgs"];

/** Arguments for the `configure_swarm` instruction. */
export type ConfigureSwarmArgs = AuraTypeDefs["configureSwarmArgs"];

/** Arguments for the `apply_policy_preset` instruction. */
export type ApplyPolicyPresetArgs = AuraTypeDefs["applyPolicyPresetArgs"];

/** Arguments for the `configure_budget_envelope` instruction. */
export type ConfigureBudgetEnvelopeArgs =
  AuraTypeDefs["configureBudgetEnvelopeArgs"];

/** Arguments for the `init_exposure_group` instruction. */
export type InitExposureGroupArgs = AuraTypeDefs["initExposureGroupArgs"];

/** Arguments for the `configure_approval_ladder` instruction. */
export type ConfigureApprovalLadderArgs =
  AuraTypeDefs["configureApprovalLadderArgs"];

/** Arguments for the `approve_pending_execution` instruction. */
export type ApprovePendingExecutionArgs =
  AuraTypeDefs["approvePendingExecutionArgs"];

/** Arguments for the `set_scoped_pause` instruction. */
export type SetScopedPauseArgs = AuraTypeDefs["setScopedPauseArgs"];

/** Arguments for the `grant_operator_role` instruction. */
export type GrantOperatorRoleArgs = AuraTypeDefs["grantOperatorRoleArgs"];

/** Arguments for the `init_external_liveness` instruction. */
export type InitExternalLivenessArgs = AuraTypeDefs["initExternalLivenessArgs"];

/** Arguments for the `configure_liveness_guardrails` instruction. */
export type ConfigureLivenessGuardrailsArgs =
  AuraTypeDefs["configureLivenessGuardrailsArgs"];

/** Arguments for the `refresh_external_liveness` instruction. */
export type RefreshExternalLivenessArgs =
  AuraTypeDefs["refreshExternalLivenessArgs"];

/** Arguments for the `attest_policy` instruction. */
export type AttestPolicyArgs = AuraTypeDefs["attestPolicyArgs"];

/** Arguments for the `propose_batch` instruction. */
export type ProposeBatchArgs = AuraTypeDefs["proposeBatchArgs"];

/** One item inside `ProposeBatchArgs.items`. */
export type BatchProposalItemArgs = AuraTypeDefs["batchProposalItemArgs"];

/** Arguments for the `check_invariants` instruction. */
export type CheckInvariantsArgs = AuraTypeDefs["checkInvariantsArgs"];

/** Arguments for the `simulate_policy` instruction. */
export type SimulatePolicyArgs = AuraTypeDefs["simulatePolicyArgs"];

/** Arguments for the `write_policy_receipt` instruction. */
export type WritePolicyReceiptArgs = AuraTypeDefs["writePolicyReceiptArgs"];

/** Serialized policy configuration record accepted by governance updates. */
export type PolicyConfigRecord = AuraTypeDefs["policyConfigRecord"];

/** Arguments for the `issue_session_key` instruction. */
export type IssueSessionKeyArgs = AuraTypeDefs["issueSessionKeyArgs"];

/** Arguments for the `check_policy_cpi` instruction. */
export type CheckPolicyCpiArgs = AuraTypeDefs["checkPolicyCpiArgs"];

/** Arguments for the `init_swarm_pool` instruction. */
export type InitSwarmPoolArgs = AuraTypeDefs["initSwarmPoolArgs"];
