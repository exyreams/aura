/// Anchor instruction handlers for `aura-core`.
///
/// Each file in this module corresponds to one instruction or one closely
/// related instruction family. Account contexts stay beside their handlers,
/// while this index re-exports the stable public instruction surface.
pub mod activity_log;
pub mod address_lists;
pub mod apply_policy_preset;
pub mod approval_ladder;
pub mod batch_execution;
pub mod budget_envelopes;
pub mod cancel_pending;
pub mod collect_override_signature;
pub mod configure_confidential_guardrails;
pub mod configure_confidential_vector_guardrails;
pub mod configure_multisig;
pub mod configure_swarm;
pub mod confirm_policy_decryption;
pub mod create_treasury;
pub mod execute_pending;
pub mod execute_pending_vector_fhe;
pub mod external_liveness;
pub mod fee_vault;
pub mod finalize_execution;
pub mod health_score;
pub mod invariant_checks;
pub mod migration;
pub mod operator_roles;
pub mod pause_execution;
pub mod policy_attestations;
pub mod policy_history;
pub mod policy_receipts;
pub mod policy_services;
pub mod policy_simulation;
pub mod propose_confidential_transaction;
pub mod propose_confidential_vector_transaction;
pub mod propose_override;
pub mod propose_transaction;
pub mod register_dwallet;
pub mod request_policy_decryption;
pub mod scoped_pause;
pub mod session_keys;
pub mod snapshots;
pub mod swarm_pool;
pub mod treasury_admin;

pub use activity_log::{CloseActivityLog, InitActivityLog};
pub(crate) use activity_log::{
    __client_accounts_close_activity_log, __client_accounts_init_activity_log,
    __cpi_client_accounts_close_activity_log, __cpi_client_accounts_init_activity_log,
};
pub use address_lists::{CloseAddressList, InitAddressList, ManageAddressList};
pub(crate) use address_lists::{
    __client_accounts_close_address_list, __client_accounts_init_address_list,
    __client_accounts_manage_address_list, __cpi_client_accounts_close_address_list,
    __cpi_client_accounts_init_address_list, __cpi_client_accounts_manage_address_list,
};
pub use apply_policy_preset::{ApplyPolicyPreset, ApplyPolicyPresetArgs};
pub(crate) use apply_policy_preset::{
    __client_accounts_apply_policy_preset, __cpi_client_accounts_apply_policy_preset,
};
pub use approval_ladder::{
    ApprovePendingExecution, ApprovePendingExecutionArgs, ConfigureApprovalLadder,
    ConfigureApprovalLadderArgs,
};
pub(crate) use approval_ladder::{
    __client_accounts_approve_pending_execution, __client_accounts_configure_approval_ladder,
    __cpi_client_accounts_approve_pending_execution,
    __cpi_client_accounts_configure_approval_ladder,
};
pub use batch_execution::{BatchProposalItemArgs, ProposeBatch, ProposeBatchArgs};
pub(crate) use batch_execution::{
    __client_accounts_propose_batch, __cpi_client_accounts_propose_batch,
};
pub use budget_envelopes::{
    ConfigureBudgetEnvelope, ConfigureBudgetEnvelopeArgs, InitExposureGroup, InitExposureGroupArgs,
    JoinExposureGroup,
};
pub(crate) use budget_envelopes::{
    __client_accounts_configure_budget_envelope, __client_accounts_init_exposure_group,
    __client_accounts_join_exposure_group, __cpi_client_accounts_configure_budget_envelope,
    __cpi_client_accounts_init_exposure_group, __cpi_client_accounts_join_exposure_group,
};
pub use cancel_pending::CancelPending;
pub(crate) use cancel_pending::__client_accounts_cancel_pending;
pub(crate) use cancel_pending::__cpi_client_accounts_cancel_pending;
pub use collect_override_signature::CollectOverrideSignature;
pub(crate) use collect_override_signature::__client_accounts_collect_override_signature;
pub(crate) use collect_override_signature::__cpi_client_accounts_collect_override_signature;
pub use configure_confidential_guardrails::ConfigureConfidentialGuardrails;
pub(crate) use configure_confidential_guardrails::__client_accounts_configure_confidential_guardrails;
pub(crate) use configure_confidential_guardrails::__cpi_client_accounts_configure_confidential_guardrails;
pub use configure_confidential_vector_guardrails::ConfigureConfidentialVectorGuardrails;
pub(crate) use configure_confidential_vector_guardrails::__client_accounts_configure_confidential_vector_guardrails;
pub(crate) use configure_confidential_vector_guardrails::__cpi_client_accounts_configure_confidential_vector_guardrails;
pub(crate) use configure_multisig::__client_accounts_configure_multisig;
pub(crate) use configure_multisig::__cpi_client_accounts_configure_multisig;
pub use configure_multisig::{ConfigureMultisig, ConfigureMultisigArgs};
pub(crate) use configure_swarm::__client_accounts_configure_swarm;
pub(crate) use configure_swarm::__cpi_client_accounts_configure_swarm;
pub use configure_swarm::{ConfigureSwarm, ConfigureSwarmArgs};
pub use confirm_policy_decryption::ConfirmPolicyDecryption;
pub(crate) use confirm_policy_decryption::__client_accounts_confirm_policy_decryption;
pub(crate) use confirm_policy_decryption::__cpi_client_accounts_confirm_policy_decryption;
pub(crate) use create_treasury::__client_accounts_create_treasury;
pub(crate) use create_treasury::__cpi_client_accounts_create_treasury;
pub use create_treasury::{CreateTreasury, CreateTreasuryArgs};
pub use execute_pending::ExecutePending;
pub(crate) use execute_pending::__client_accounts_execute_pending;
pub(crate) use execute_pending::__cpi_client_accounts_execute_pending;
pub(crate) use execute_pending_vector_fhe::__client_accounts_execute_pending_vector_fhe;
pub(crate) use execute_pending_vector_fhe::__cpi_client_accounts_execute_pending_vector_fhe;
pub use execute_pending_vector_fhe::{ExecutePendingVectorFhe, ExecutePendingVectorFheArgs};
pub use external_liveness::{
    ConfigureLivenessGuardrails, ConfigureLivenessGuardrailsArgs, InitExternalLiveness,
    InitExternalLivenessArgs, RefreshExternalLiveness, RefreshExternalLivenessArgs,
};
pub(crate) use external_liveness::{
    __client_accounts_configure_liveness_guardrails, __client_accounts_init_external_liveness,
    __client_accounts_refresh_external_liveness,
    __cpi_client_accounts_configure_liveness_guardrails,
    __cpi_client_accounts_init_external_liveness, __cpi_client_accounts_refresh_external_liveness,
};
pub use fee_vault::{CloseFeeVault, CollectFees, InitFeeVault};
pub(crate) use fee_vault::{
    __client_accounts_close_fee_vault, __client_accounts_collect_fees,
    __client_accounts_init_fee_vault, __cpi_client_accounts_close_fee_vault,
    __cpi_client_accounts_collect_fees, __cpi_client_accounts_init_fee_vault,
};
pub use finalize_execution::FinalizeExecution;
pub(crate) use finalize_execution::__client_accounts_finalize_execution;
pub(crate) use finalize_execution::__cpi_client_accounts_finalize_execution;
pub use health_score::{CloseHealthScore, InitHealthScore, UpdateHealthScore};
pub(crate) use health_score::{
    __client_accounts_close_health_score, __client_accounts_init_health_score,
    __client_accounts_update_health_score, __cpi_client_accounts_close_health_score,
    __cpi_client_accounts_init_health_score, __cpi_client_accounts_update_health_score,
};
pub use invariant_checks::{CheckInvariants, CheckInvariantsArgs};
pub(crate) use invariant_checks::{
    __client_accounts_check_invariants, __cpi_client_accounts_check_invariants,
};
pub use migration::MigrateTreasury;
pub(crate) use migration::__client_accounts_migrate_treasury;
pub(crate) use migration::__cpi_client_accounts_migrate_treasury;
pub use operator_roles::{GrantOperatorRole, GrantOperatorRoleArgs, RevokeOperatorRole};
pub(crate) use operator_roles::{
    __client_accounts_grant_operator_role, __client_accounts_revoke_operator_role,
    __cpi_client_accounts_grant_operator_role, __cpi_client_accounts_revoke_operator_role,
};
pub use pause_execution::PauseExecution;
pub(crate) use pause_execution::__client_accounts_pause_execution;
pub(crate) use pause_execution::__cpi_client_accounts_pause_execution;
pub use policy_attestations::{AttestPolicy, AttestPolicyArgs};
pub(crate) use policy_attestations::{
    __client_accounts_attest_policy, __cpi_client_accounts_attest_policy,
};
pub use policy_history::{ClosePolicyHistory, InitPolicyHistory};
pub(crate) use policy_history::{
    __client_accounts_close_policy_history, __client_accounts_init_policy_history,
    __cpi_client_accounts_close_policy_history, __cpi_client_accounts_init_policy_history,
};
pub use policy_receipts::{WritePolicyReceipt, WritePolicyReceiptArgs};
pub(crate) use policy_receipts::{
    __client_accounts_write_policy_receipt, __cpi_client_accounts_write_policy_receipt,
};
pub use policy_services::{CheckPolicyCpi, CheckPolicyCpiArgs, RefreshDwalletBalance};
pub(crate) use policy_services::{
    __client_accounts_check_policy_cpi, __client_accounts_refresh_dwallet_balance,
    __cpi_client_accounts_check_policy_cpi, __cpi_client_accounts_refresh_dwallet_balance,
};
pub use policy_simulation::{SimulatePolicy, SimulatePolicyArgs};
pub(crate) use policy_simulation::{
    __client_accounts_simulate_policy, __cpi_client_accounts_simulate_policy,
};
pub(crate) use propose_confidential_transaction::__client_accounts_propose_confidential_transaction;
pub(crate) use propose_confidential_transaction::__cpi_client_accounts_propose_confidential_transaction;
pub use propose_confidential_transaction::{
    ProposeConfidentialTransaction, ProposeConfidentialTransactionArgs,
};
pub use propose_confidential_vector_transaction::ProposeConfidentialVectorTransaction;
pub(crate) use propose_confidential_vector_transaction::__client_accounts_propose_confidential_vector_transaction;
pub(crate) use propose_confidential_vector_transaction::__cpi_client_accounts_propose_confidential_vector_transaction;
pub use propose_override::ProposeOverride;
pub(crate) use propose_override::__client_accounts_propose_override;
pub(crate) use propose_override::__cpi_client_accounts_propose_override;
pub(crate) use propose_transaction::__client_accounts_propose_transaction;
pub(crate) use propose_transaction::__cpi_client_accounts_propose_transaction;
pub use propose_transaction::{ProposeTransaction, ProposeTransactionArgs};
pub(crate) use register_dwallet::__client_accounts_register_dwallet;
pub(crate) use register_dwallet::__cpi_client_accounts_register_dwallet;
pub use register_dwallet::{RegisterDwallet, RegisterDwalletArgs};
pub use request_policy_decryption::RequestPolicyDecryption;
pub(crate) use request_policy_decryption::__client_accounts_request_policy_decryption;
pub(crate) use request_policy_decryption::__cpi_client_accounts_request_policy_decryption;
pub use scoped_pause::{SetScopedPause, SetScopedPauseArgs};
pub(crate) use scoped_pause::{
    __client_accounts_set_scoped_pause, __cpi_client_accounts_set_scoped_pause,
};
pub use session_keys::{CloseSessionKey, IssueSessionKey, IssueSessionKeyArgs, RevokeSessionKey};
pub(crate) use session_keys::{
    __client_accounts_close_session_key, __client_accounts_issue_session_key,
    __client_accounts_revoke_session_key, __cpi_client_accounts_close_session_key,
    __cpi_client_accounts_issue_session_key, __cpi_client_accounts_revoke_session_key,
};
pub use snapshots::{CloseSnapshot, TakeSnapshot};
pub(crate) use snapshots::{
    __client_accounts_close_snapshot, __client_accounts_take_snapshot,
    __cpi_client_accounts_close_snapshot, __cpi_client_accounts_take_snapshot,
};
pub use swarm_pool::{InitSwarmPool, InitSwarmPoolArgs, JoinSwarm};
pub(crate) use swarm_pool::{
    __client_accounts_init_swarm_pool, __client_accounts_join_swarm,
    __cpi_client_accounts_init_swarm_pool, __cpi_client_accounts_join_swarm,
};
pub use treasury_admin::{OwnerTreasury, TriggerDeadMansSwitch, VetoConfigChange};
pub(crate) use treasury_admin::{
    __client_accounts_owner_treasury, __client_accounts_trigger_dead_mans_switch,
    __client_accounts_veto_config_change, __cpi_client_accounts_owner_treasury,
    __cpi_client_accounts_trigger_dead_mans_switch, __cpi_client_accounts_veto_config_change,
};

use anchor_lang::prelude::*;

use crate::{
    program_accounts::{
        lifecycle_state_code, ConfidentialGuardrailsRecord, PendingProposalRecord, TreasuryAccount,
    },
    program_events::{emit_audit_events, emit_proposal_event},
    AgentTreasury,
};

/// Serializes the updated domain object back into the on-chain account and
/// emits any pending audit events and proposal events.
///
/// Called at the end of every instruction handler after all mutations are
/// complete. Fails if the domain object cannot be serialized into the
/// account's allocated space.
pub fn sync_treasury_account(
    account: &mut Account<'_, TreasuryAccount>,
    domain: &AgentTreasury,
    updated_at: i64,
) -> Result<()> {
    account.apply_domain(domain, updated_at)?;
    emit_audit_events(account.key(), domain.audit_trail.events());
    if let Some(pending) = &domain.pending {
        emit_proposal_event(account.key(), pending);
    }
    Ok(())
}

/// Writes only the active pending proposal fields back to the treasury account.
///
/// Used by live confidential/dWallet paths after CPIs, where full treasury
/// reserialization can exceed SBF heap limits even though only the active
/// pending record changed.
pub(crate) fn sync_treasury_pending_account(
    account: &mut Account<'_, TreasuryAccount>,
    domain: &AgentTreasury,
    updated_at: i64,
) -> Result<()> {
    sync_treasury_pending_account_with_events(account, domain, updated_at, true)
}

fn sync_treasury_pending_account_with_events(
    account: &mut Account<'_, TreasuryAccount>,
    domain: &AgentTreasury,
    updated_at: i64,
    emit_proposal: bool,
) -> Result<()> {
    account.updated_at = updated_at;
    account.execution_paused = domain.execution_paused;
    account.agent_state = lifecycle_state_code(domain.agent_state);
    account.confidential_guardrails = domain
        .confidential_guardrails
        .as_ref()
        .map(ConfidentialGuardrailsRecord::from_domain);

    let pending = domain
        .active_pending()
        .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
    let pending_record = PendingProposalRecord::from_domain(pending)?;
    if account.pending_queue.is_empty() {
        account.pending_queue.push(pending_record);
    } else {
        account.pending_queue[0] = pending_record;
    }

    emit_audit_events(account.key(), domain.audit_trail.events());
    if emit_proposal {
        if let Some(pending) = &domain.pending {
            emit_proposal_event(account.key(), pending);
        }
    }
    Ok(())
}
