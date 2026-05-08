//! # AURA Core Program
//!
//! ![AURA banner](https://raw.githubusercontent.com/exyreams/aura/refs/heads/main/packages/web/public/banner.png)
//!
//! `aura-core` — the deployed Anchor program for AURA treasury coordination.
//!
//! This crate is the on-chain half of the AURA protocol. It owns the
//! `TreasuryAccount` PDA and exposes the full instruction set for creating
//! and operating agent treasuries: registering dWallets, submitting proposals,
//! running FHE policy evaluation, requesting dWallet signatures, and finalizing
//! execution.
//!
//! ## Module layout
//!
//! - `instructions/` — one file per Anchor instruction handler
//! - `state/`        — domain model types (`AgentTreasury`, `PendingTransaction`, etc.)
//! - `execution/`    — proposal lifecycle state-machine logic
//! - `ext_cpi/`      — thin adapters for dWallet and Encrypt CPIs
//! - `governance/`   — emergency multisig override
//! - `audit/`        — append-only audit trail
//! - `program_accounts/` — Anchor account serialization layer
//! - `program_events/`   — on-chain event emission
//! - `program_error/`    — `AuraCoreError` and `TreasuryError` → Anchor error mapping
//! - `constants/`    — field length limits and collection caps
#![allow(unexpected_cfgs)]
#![allow(clippy::diverging_sub_expression)]
#![forbid(unsafe_code)]

use anchor_lang::prelude::*;

pub mod audit;
pub mod constants;
pub mod errors;
pub mod execution;
pub mod ext_cpi;
pub mod governance;
pub mod instructions;
pub mod program_accounts;
pub mod program_error;
pub mod program_events;
pub mod state;

pub use instructions::*;
#[allow(unused_imports)]
use instructions::{
    __client_accounts_apply_policy_preset, __client_accounts_approve_pending_execution,
    __client_accounts_attest_policy, __client_accounts_cancel_pending,
    __client_accounts_check_invariants, __client_accounts_check_policy_cpi,
    __client_accounts_close_activity_log, __client_accounts_close_address_list,
    __client_accounts_close_fee_vault, __client_accounts_close_health_score,
    __client_accounts_close_policy_history, __client_accounts_close_session_key,
    __client_accounts_close_snapshot, __client_accounts_collect_fees,
    __client_accounts_collect_override_signature, __client_accounts_configure_approval_ladder,
    __client_accounts_configure_budget_envelope,
    __client_accounts_configure_confidential_guardrails,
    __client_accounts_configure_liveness_guardrails, __client_accounts_configure_multisig,
    __client_accounts_configure_swarm, __client_accounts_confirm_policy_decryption,
    __client_accounts_create_treasury, __client_accounts_execute_pending,
    __client_accounts_finalize_execution, __client_accounts_grant_operator_role,
    __client_accounts_init_activity_log, __client_accounts_init_address_list,
    __client_accounts_init_exposure_group, __client_accounts_init_external_liveness,
    __client_accounts_init_fee_vault, __client_accounts_init_health_score,
    __client_accounts_init_policy_history, __client_accounts_init_swarm_pool,
    __client_accounts_issue_session_key, __client_accounts_join_exposure_group,
    __client_accounts_join_swarm, __client_accounts_manage_address_list,
    __client_accounts_migrate_treasury, __client_accounts_owner_treasury,
    __client_accounts_pause_execution, __client_accounts_propose_batch,
    __client_accounts_propose_confidential_transaction, __client_accounts_propose_override,
    __client_accounts_propose_transaction, __client_accounts_refresh_dwallet_balance,
    __client_accounts_refresh_external_liveness, __client_accounts_register_dwallet,
    __client_accounts_request_policy_decryption, __client_accounts_revoke_operator_role,
    __client_accounts_revoke_session_key, __client_accounts_set_scoped_pause,
    __client_accounts_simulate_policy, __client_accounts_take_snapshot,
    __client_accounts_trigger_dead_mans_switch, __client_accounts_update_health_score,
    __client_accounts_veto_config_change, __client_accounts_write_policy_receipt,
    __cpi_client_accounts_apply_policy_preset, __cpi_client_accounts_approve_pending_execution,
    __cpi_client_accounts_attest_policy, __cpi_client_accounts_cancel_pending,
    __cpi_client_accounts_check_invariants, __cpi_client_accounts_check_policy_cpi,
    __cpi_client_accounts_close_activity_log, __cpi_client_accounts_close_address_list,
    __cpi_client_accounts_close_fee_vault, __cpi_client_accounts_close_health_score,
    __cpi_client_accounts_close_policy_history, __cpi_client_accounts_close_session_key,
    __cpi_client_accounts_close_snapshot, __cpi_client_accounts_collect_fees,
    __cpi_client_accounts_collect_override_signature,
    __cpi_client_accounts_configure_approval_ladder,
    __cpi_client_accounts_configure_budget_envelope,
    __cpi_client_accounts_configure_confidential_guardrails,
    __cpi_client_accounts_configure_liveness_guardrails, __cpi_client_accounts_configure_multisig,
    __cpi_client_accounts_configure_swarm, __cpi_client_accounts_confirm_policy_decryption,
    __cpi_client_accounts_create_treasury, __cpi_client_accounts_execute_pending,
    __cpi_client_accounts_finalize_execution, __cpi_client_accounts_grant_operator_role,
    __cpi_client_accounts_init_activity_log, __cpi_client_accounts_init_address_list,
    __cpi_client_accounts_init_exposure_group, __cpi_client_accounts_init_external_liveness,
    __cpi_client_accounts_init_fee_vault, __cpi_client_accounts_init_health_score,
    __cpi_client_accounts_init_policy_history, __cpi_client_accounts_init_swarm_pool,
    __cpi_client_accounts_issue_session_key, __cpi_client_accounts_join_exposure_group,
    __cpi_client_accounts_join_swarm, __cpi_client_accounts_manage_address_list,
    __cpi_client_accounts_migrate_treasury, __cpi_client_accounts_owner_treasury,
    __cpi_client_accounts_pause_execution, __cpi_client_accounts_propose_batch,
    __cpi_client_accounts_propose_confidential_transaction, __cpi_client_accounts_propose_override,
    __cpi_client_accounts_propose_transaction, __cpi_client_accounts_refresh_dwallet_balance,
    __cpi_client_accounts_refresh_external_liveness, __cpi_client_accounts_register_dwallet,
    __cpi_client_accounts_request_policy_decryption, __cpi_client_accounts_revoke_operator_role,
    __cpi_client_accounts_revoke_session_key, __cpi_client_accounts_set_scoped_pause,
    __cpi_client_accounts_simulate_policy, __cpi_client_accounts_take_snapshot,
    __cpi_client_accounts_trigger_dead_mans_switch, __cpi_client_accounts_update_health_score,
    __cpi_client_accounts_veto_config_change, __cpi_client_accounts_write_policy_receipt,
};

declare_id!("2fHkM5fb8iLt5ojkubAcLpAjgkF1QL1iEXivKZmPw3ya");

#[program]
pub mod aura_core {
    use super::*;

    pub fn create_treasury(ctx: Context<CreateTreasury>, args: CreateTreasuryArgs) -> Result<()> {
        instructions::create_treasury::handler(ctx, args)
    }

    pub fn register_dwallet(
        ctx: Context<RegisterDwallet>,
        args: RegisterDwalletArgs,
    ) -> Result<()> {
        instructions::register_dwallet::handler(ctx, args)
    }

    pub fn configure_confidential_guardrails(
        ctx: Context<ConfigureConfidentialGuardrails>,
        now: i64,
    ) -> Result<()> {
        instructions::configure_confidential_guardrails::handler(ctx, now)
    }

    pub fn propose_transaction(
        ctx: Context<ProposeTransaction>,
        args: ProposeTransactionArgs,
    ) -> Result<()> {
        instructions::propose_transaction::handler(ctx, args)
    }

    pub fn propose_confidential_transaction(
        ctx: Context<ProposeConfidentialTransaction>,
        args: ProposeConfidentialTransactionArgs,
    ) -> Result<()> {
        instructions::propose_confidential_transaction::handler(ctx, args)
    }

    pub fn execute_pending(ctx: Context<ExecutePending>, now: i64) -> Result<()> {
        instructions::execute_pending::handler(ctx, now)
    }

    pub fn request_policy_decryption(
        ctx: Context<RequestPolicyDecryption>,
        now: i64,
    ) -> Result<()> {
        instructions::request_policy_decryption::handler(ctx, now)
    }

    pub fn confirm_policy_decryption(
        ctx: Context<ConfirmPolicyDecryption>,
        now: i64,
    ) -> Result<()> {
        instructions::confirm_policy_decryption::handler(ctx, now)
    }

    pub fn finalize_execution(ctx: Context<FinalizeExecution>, now: i64) -> Result<()> {
        instructions::finalize_execution::handler(ctx, now)
    }

    pub fn pause_execution(ctx: Context<PauseExecution>, paused: bool, now: i64) -> Result<()> {
        instructions::pause_execution::handler(ctx, paused, now)
    }

    pub fn cancel_pending(ctx: Context<CancelPending>, now: i64) -> Result<()> {
        instructions::cancel_pending::handler(ctx, now)
    }

    pub fn configure_multisig(
        ctx: Context<ConfigureMultisig>,
        args: ConfigureMultisigArgs,
    ) -> Result<()> {
        instructions::configure_multisig::handler(ctx, args)
    }

    pub fn propose_override(
        ctx: Context<ProposeOverride>,
        new_daily_limit_usd: u64,
        now: i64,
    ) -> Result<()> {
        instructions::propose_override::handler(ctx, new_daily_limit_usd, now)
    }

    pub fn collect_override_signature(
        ctx: Context<CollectOverrideSignature>,
        now: i64,
    ) -> Result<()> {
        instructions::collect_override_signature::handler(ctx, now)
    }

    pub fn configure_swarm(ctx: Context<ConfigureSwarm>, args: ConfigureSwarmArgs) -> Result<()> {
        instructions::configure_swarm::handler(ctx, args)
    }

    pub fn init_activity_log(ctx: Context<InitActivityLog>) -> Result<()> {
        instructions::activity_log::init_activity_log(ctx)
    }

    pub fn init_swarm_pool(ctx: Context<InitSwarmPool>, args: InitSwarmPoolArgs) -> Result<()> {
        instructions::swarm_pool::init_swarm_pool(ctx, args)
    }

    pub fn join_swarm(ctx: Context<JoinSwarm>, now: i64) -> Result<()> {
        instructions::swarm_pool::join_swarm(ctx, now)
    }

    pub fn propose_ai_rotation(
        ctx: Context<OwnerTreasury>,
        new_ai_authority: Pubkey,
        now: i64,
    ) -> Result<()> {
        instructions::treasury_admin::propose_ai_rotation(ctx, new_ai_authority, now)
    }

    pub fn execute_ai_rotation(ctx: Context<OwnerTreasury>, now: i64) -> Result<()> {
        instructions::treasury_admin::execute_ai_rotation(ctx, now)
    }

    pub fn cancel_ai_rotation(ctx: Context<OwnerTreasury>, now: i64) -> Result<()> {
        instructions::treasury_admin::cancel_ai_rotation(ctx, now)
    }

    pub fn propose_config_change(
        ctx: Context<OwnerTreasury>,
        change_id: u64,
        new_policy_config: PolicyConfigRecord,
        now: i64,
    ) -> Result<()> {
        instructions::treasury_admin::propose_config_change(ctx, change_id, new_policy_config, now)
    }

    pub fn execute_config_change(
        ctx: Context<OwnerTreasury>,
        change_id: u64,
        now: i64,
    ) -> Result<()> {
        instructions::treasury_admin::execute_config_change(ctx, change_id, now)
    }

    pub fn veto_config_change(
        ctx: Context<VetoConfigChange>,
        change_id: u64,
        now: i64,
    ) -> Result<()> {
        instructions::treasury_admin::veto_config_change(ctx, change_id, now)
    }

    pub fn issue_session_key(
        ctx: Context<IssueSessionKey>,
        args: IssueSessionKeyArgs,
    ) -> Result<()> {
        instructions::session_keys::issue_session_key(ctx, args)
    }

    pub fn revoke_session_key(ctx: Context<RevokeSessionKey>, now: i64) -> Result<()> {
        instructions::session_keys::revoke_session_key(ctx, now)
    }

    pub fn trigger_dead_mans_switch(ctx: Context<TriggerDeadMansSwitch>, now: i64) -> Result<()> {
        instructions::treasury_admin::trigger_dead_mans_switch(ctx, now)
    }

    pub fn transition_agent_state(
        ctx: Context<OwnerTreasury>,
        target_state: u8,
        now: i64,
    ) -> Result<()> {
        instructions::treasury_admin::transition_agent_state(ctx, target_state, now)
    }

    pub fn propose_guardian_rotation(
        ctx: Context<VetoConfigChange>,
        action: u8,
        target_guardian: Pubkey,
        now: i64,
    ) -> Result<()> {
        instructions::treasury_admin::propose_guardian_rotation(ctx, action, target_guardian, now)
    }

    pub fn execute_guardian_rotation(ctx: Context<VetoConfigChange>, now: i64) -> Result<()> {
        instructions::treasury_admin::execute_guardian_rotation(ctx, now)
    }

    pub fn emergency_shutdown(
        ctx: Context<OwnerTreasury>,
        recovery_pubkey: Pubkey,
        now: i64,
    ) -> Result<()> {
        instructions::treasury_admin::emergency_shutdown(ctx, recovery_pubkey, now)
    }

    pub fn init_address_list(
        ctx: Context<InitAddressList>,
        mode: u8,
        chain: u8,
        now: i64,
    ) -> Result<()> {
        instructions::address_lists::init_address_list(ctx, mode, chain, now)
    }

    pub fn manage_address_list(
        ctx: Context<ManageAddressList>,
        mode: u8,
        chain: u8,
        addresses: Vec<String>,
        now: i64,
    ) -> Result<()> {
        instructions::address_lists::manage_address_list(ctx, mode, chain, addresses, now)
    }

    pub fn init_fee_vault(
        ctx: Context<InitFeeVault>,
        protocol_fee_recipient: Pubkey,
        now: i64,
    ) -> Result<()> {
        instructions::fee_vault::init_fee_vault(ctx, protocol_fee_recipient, now)
    }

    pub fn collect_fees(ctx: Context<CollectFees>, now: i64) -> Result<()> {
        instructions::fee_vault::collect_fees(ctx, now)
    }

    pub fn refresh_dwallet_balance(
        ctx: Context<RefreshDwalletBalance>,
        chain_code: u8,
        now: i64,
    ) -> Result<()> {
        instructions::policy_services::refresh_dwallet_balance(ctx, chain_code, now)
    }

    pub fn check_policy_cpi(ctx: Context<CheckPolicyCpi>, args: CheckPolicyCpiArgs) -> Result<()> {
        instructions::policy_services::check_policy_cpi(ctx, args)
    }

    pub fn migrate_treasury(ctx: Context<MigrateTreasury>) -> Result<()> {
        instructions::migration::migrate_treasury(ctx)
    }

    pub fn init_policy_history(ctx: Context<InitPolicyHistory>) -> Result<()> {
        instructions::policy_history::init_policy_history(ctx)
    }

    pub fn record_policy_snapshot(ctx: Context<InitPolicyHistory>, now: i64) -> Result<()> {
        instructions::policy_history::record_policy_snapshot(ctx, now)
    }

    pub fn init_health_score(ctx: Context<InitHealthScore>, now: i64) -> Result<()> {
        instructions::health_score::init_health_score(ctx, now)
    }

    pub fn refresh_health_score(ctx: Context<UpdateHealthScore>, now: i64) -> Result<()> {
        instructions::health_score::refresh_health_score(ctx, now)
    }

    pub fn take_snapshot(ctx: Context<TakeSnapshot>, snapshot_index: u32, now: i64) -> Result<()> {
        instructions::snapshots::take_snapshot(ctx, snapshot_index, now)
    }

    pub fn close_session_key(ctx: Context<CloseSessionKey>) -> Result<()> {
        instructions::session_keys::close_session_key(ctx)
    }

    pub fn close_activity_log(ctx: Context<CloseActivityLog>) -> Result<()> {
        instructions::activity_log::close_activity_log(ctx)
    }

    pub fn close_address_list(ctx: Context<CloseAddressList>) -> Result<()> {
        instructions::address_lists::close_address_list(ctx)
    }

    pub fn close_policy_history(ctx: Context<ClosePolicyHistory>) -> Result<()> {
        instructions::policy_history::close_policy_history(ctx)
    }

    pub fn close_health_score(ctx: Context<CloseHealthScore>) -> Result<()> {
        instructions::health_score::close_health_score(ctx)
    }

    pub fn close_fee_vault(ctx: Context<CloseFeeVault>) -> Result<()> {
        instructions::fee_vault::close_fee_vault(ctx)
    }

    pub fn close_snapshot(ctx: Context<CloseSnapshot>) -> Result<()> {
        instructions::snapshots::close_snapshot(ctx)
    }

    pub fn simulate_policy(ctx: Context<SimulatePolicy>, args: SimulatePolicyArgs) -> Result<()> {
        instructions::policy_simulation::simulate_policy(ctx, args)
    }

    pub fn write_policy_receipt(
        ctx: Context<WritePolicyReceipt>,
        args: WritePolicyReceiptArgs,
    ) -> Result<()> {
        instructions::policy_receipts::write_policy_receipt(ctx, args)
    }

    pub fn apply_policy_preset(
        ctx: Context<ApplyPolicyPreset>,
        args: ApplyPolicyPresetArgs,
    ) -> Result<()> {
        instructions::apply_policy_preset::apply_policy_preset(ctx, args)
    }

    pub fn configure_budget_envelope(
        ctx: Context<ConfigureBudgetEnvelope>,
        args: ConfigureBudgetEnvelopeArgs,
    ) -> Result<()> {
        instructions::budget_envelopes::configure_budget_envelope(ctx, args)
    }

    pub fn init_exposure_group(
        ctx: Context<InitExposureGroup>,
        args: InitExposureGroupArgs,
    ) -> Result<()> {
        instructions::budget_envelopes::init_exposure_group(ctx, args)
    }

    pub fn join_exposure_group(ctx: Context<JoinExposureGroup>) -> Result<()> {
        instructions::budget_envelopes::join_exposure_group(ctx)
    }

    pub fn configure_approval_ladder(
        ctx: Context<ConfigureApprovalLadder>,
        args: ConfigureApprovalLadderArgs,
    ) -> Result<()> {
        instructions::approval_ladder::configure_approval_ladder(ctx, args)
    }

    pub fn approve_pending_execution(
        ctx: Context<ApprovePendingExecution>,
        args: ApprovePendingExecutionArgs,
    ) -> Result<()> {
        instructions::approval_ladder::approve_pending_execution(ctx, args)
    }

    pub fn set_scoped_pause(ctx: Context<SetScopedPause>, args: SetScopedPauseArgs) -> Result<()> {
        instructions::scoped_pause::set_scoped_pause(ctx, args)
    }

    pub fn grant_operator_role(
        ctx: Context<GrantOperatorRole>,
        args: GrantOperatorRoleArgs,
    ) -> Result<()> {
        instructions::operator_roles::grant_operator_role(ctx, args)
    }

    pub fn revoke_operator_role(ctx: Context<RevokeOperatorRole>, now: i64) -> Result<()> {
        instructions::operator_roles::revoke_operator_role(ctx, now)
    }

    pub fn init_external_liveness(
        ctx: Context<InitExternalLiveness>,
        args: InitExternalLivenessArgs,
    ) -> Result<()> {
        instructions::external_liveness::init_external_liveness(ctx, args)
    }

    pub fn configure_liveness_guardrails(
        ctx: Context<ConfigureLivenessGuardrails>,
        args: ConfigureLivenessGuardrailsArgs,
    ) -> Result<()> {
        instructions::external_liveness::configure_liveness_guardrails(ctx, args)
    }

    pub fn refresh_external_liveness(
        ctx: Context<RefreshExternalLiveness>,
        args: RefreshExternalLivenessArgs,
    ) -> Result<()> {
        instructions::external_liveness::refresh_external_liveness(ctx, args)
    }

    pub fn attest_policy(ctx: Context<AttestPolicy>, args: AttestPolicyArgs) -> Result<()> {
        instructions::policy_attestations::attest_policy(ctx, args)
    }

    pub fn propose_batch(ctx: Context<ProposeBatch>, args: ProposeBatchArgs) -> Result<()> {
        instructions::batch_execution::propose_batch(ctx, args)
    }

    pub fn check_invariants(
        ctx: Context<CheckInvariants>,
        args: CheckInvariantsArgs,
    ) -> Result<()> {
        instructions::invariant_checks::check_invariants(ctx, args)
    }
}

pub use audit::{AuditEvent, AuditKind, AuditTrail};
pub use errors::TreasuryError;
pub use execution::{
    apply_confidential_policy_result, approve_pending_execution, build_chain_message,
    confirm_pending_decryption, deny_pending_transaction, enforce_pending_approval,
    evaluate_batch_preview, expire_pending_transaction, finalize_signed_pending,
    generate_proposal_digest, hash_message, keccak_message_digest, keccak_message_digest_hex,
    mark_pending_decryption_request, mark_signature_requested, propose_confidential_transaction,
    propose_transaction,
};
pub use ext_cpi::{
    approve_message_via_cpi, build_message_approval_request, decode_digest_hex, decrypt_u64,
    find_message_approval_pda, parse_ciphertext_account, parse_decryption_request_account,
    parse_message_approval_account, parse_runtime_pubkey, pending_signature_request_from_live,
    request_decryption_via_cpi, transfer_dwallet_via_cpi, transfer_future_sign_via_cpi,
    verify_decryption_request_digest, verify_message_approval, zero_message_metadata_digest_hex,
    AuraEncryptContext, DecryptionStatus, EncryptEvaluation, MessageApprovalRequest,
    MessageApprovalStatus, OnchainCiphertext, OnchainDecryptionRequest, OnchainMessageApproval,
    DWALLET_CPI_AUTHORITY_SEED, ENCRYPT_CPI_AUTHORITY_SEED, ENCRYPT_EVENT_AUTHORITY_SEED,
    ENCRYPT_FHE_UINT64, MESSAGE_APPROVAL_SEED,
};
pub use governance::{EmergencyMultisig, OverrideProposal};
pub use program_accounts::*;
pub use program_error::{map_treasury_error, AuraCoreError};
pub use program_events::{
    emit_audit_events, emit_execution_event, emit_policy_receipt_event, emit_proposal_event,
};
pub use state::{
    AgentLifecycleState, AgentReputation, AgentSwarm, AgentTreasury, CircuitBreakerConfig,
    CircuitBreakerState, ComplianceMetadata, ConfidentialGuardrails, ConfigChangeKind,
    DWalletCurve, DWalletReference, DeadMansSwitch, DeploymentCluster, ExecutionReceipt,
    GuardianChangeAction, PendingAiRotation, PendingConfigChange, PendingDecryptionRequest,
    PendingGuardianChange, PendingSignatureRequest, PendingTransaction, ProposalStatus,
    ProtocolDeployment, ProtocolFees, SignatureScheme, DWALLET_DEVNET_GRPC_ENDPOINT,
    DWALLET_DEVNET_PROGRAM_ID, ENCRYPT_DEVNET_GRPC_ENDPOINT, ENCRYPT_DEVNET_PROGRAM_ID,
};

#[cfg(test)]
pub mod tests;
