/// Anchor instruction handlers for `aura-core`.
///
/// Each file in this module corresponds to one instruction or one closely
/// related instruction family. Account contexts stay beside their handlers,
/// while this index re-exports the stable public instruction surface.
pub mod activity_log;
pub mod address_lists;
pub mod agent_identity;
pub mod apply_policy_preset;
pub mod approval_ladder;
pub mod batch_execution;
pub mod budget_envelopes;
pub mod cancel_pending;
pub mod chain_profiles;
pub mod collect_override_signature;
pub mod conditional;
pub mod configure_confidential_guardrails;
pub mod configure_multisig;
pub mod configure_swarm;
pub mod confirm_policy_decryption;
pub mod confirm_settlement;
pub mod create_treasury;
pub mod execute_pending;
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
pub mod policy_templates;
pub mod propose_confidential_transaction;
pub mod propose_override;
pub mod propose_transaction;
pub mod recovery;
pub mod register_dwallet;
pub mod request_policy_decryption;
pub mod scheduled_intents;
pub mod scoped_pause;
pub mod session_keys;
pub mod snapshots;
pub mod swarm_pool;
pub mod treasury_admin;
pub mod trust_envelope;
pub mod wallet_balances;
pub mod wallet_controls;
pub mod wallet_transfers;

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
pub use agent_identity::{
    AgentManage, EmergencyRevokeAgent, ExecuteHandoverArgs, ExecuteOwnershipHandover,
    NominateSuccessorArgs, OwnershipHandover, RegisterAgentArgs,
};
pub(crate) use agent_identity::{
    __client_accounts_agent_manage, __client_accounts_emergency_revoke_agent,
    __client_accounts_execute_ownership_handover, __client_accounts_ownership_handover,
    __cpi_client_accounts_agent_manage, __cpi_client_accounts_emergency_revoke_agent,
    __cpi_client_accounts_execute_ownership_handover, __cpi_client_accounts_ownership_handover,
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
    CloseExposureGroup, ConfigureBudgetEnvelope, ConfigureBudgetEnvelopeArgs, InitExposureGroup,
    InitExposureGroupArgs, JoinExposureGroup, ManageExposureGroup, RemoveBudgetEnvelope,
};
pub(crate) use budget_envelopes::{
    __client_accounts_close_exposure_group, __client_accounts_configure_budget_envelope,
    __client_accounts_init_exposure_group, __client_accounts_join_exposure_group,
    __client_accounts_manage_exposure_group, __client_accounts_remove_budget_envelope,
    __cpi_client_accounts_close_exposure_group, __cpi_client_accounts_configure_budget_envelope,
    __cpi_client_accounts_init_exposure_group, __cpi_client_accounts_join_exposure_group,
    __cpi_client_accounts_manage_exposure_group, __cpi_client_accounts_remove_budget_envelope,
};
pub use cancel_pending::CancelPending;
pub(crate) use cancel_pending::__client_accounts_cancel_pending;
pub(crate) use cancel_pending::__cpi_client_accounts_cancel_pending;
pub use chain_profiles::{ChainProfileArgs, RegisterChainProfile, UpdateChainProfile};
pub(crate) use chain_profiles::{
    __client_accounts_register_chain_profile, __client_accounts_update_chain_profile,
    __cpi_client_accounts_register_chain_profile, __cpi_client_accounts_update_chain_profile,
};
pub use collect_override_signature::CollectOverrideSignature;
pub(crate) use collect_override_signature::__client_accounts_collect_override_signature;
pub(crate) use collect_override_signature::__cpi_client_accounts_collect_override_signature;
pub use conditional::{
    CloseConditionalProposal, ConditionalProposalArgs, ProposeConditionalTransaction, TryTrigger,
};
pub(crate) use conditional::{
    __client_accounts_close_conditional_proposal,
    __client_accounts_propose_conditional_transaction, __client_accounts_try_trigger,
    __cpi_client_accounts_close_conditional_proposal,
    __cpi_client_accounts_propose_conditional_transaction, __cpi_client_accounts_try_trigger,
};
pub use configure_confidential_guardrails::ConfigureConfidentialGuardrails;
pub(crate) use configure_confidential_guardrails::__client_accounts_configure_confidential_guardrails;
pub(crate) use configure_confidential_guardrails::__cpi_client_accounts_configure_confidential_guardrails;
pub(crate) use configure_multisig::__client_accounts_configure_multisig;
pub(crate) use configure_multisig::__cpi_client_accounts_configure_multisig;
pub use configure_multisig::{ConfigureMultisig, ConfigureMultisigArgs};
pub(crate) use configure_swarm::__client_accounts_configure_swarm;
pub(crate) use configure_swarm::__cpi_client_accounts_configure_swarm;
pub use configure_swarm::{ConfigureSwarm, ConfigureSwarmArgs};
pub use confirm_policy_decryption::ConfirmPolicyDecryption;
pub(crate) use confirm_policy_decryption::__client_accounts_confirm_policy_decryption;
pub(crate) use confirm_policy_decryption::__cpi_client_accounts_confirm_policy_decryption;
pub use confirm_settlement::{
    AbandonProposal, ConfirmSettlement, ConfirmSettlementArgs, MarkSettlementBroadcast,
    MarkSettlementBroadcastArgs, ResubmitProposal, ResubmitProposalArgs,
};
pub(crate) use confirm_settlement::{
    __client_accounts_abandon_proposal, __client_accounts_confirm_settlement,
    __client_accounts_mark_settlement_broadcast, __client_accounts_resubmit_proposal,
    __cpi_client_accounts_abandon_proposal, __cpi_client_accounts_confirm_settlement,
    __cpi_client_accounts_mark_settlement_broadcast, __cpi_client_accounts_resubmit_proposal,
};
pub(crate) use create_treasury::__client_accounts_create_treasury;
pub(crate) use create_treasury::__cpi_client_accounts_create_treasury;
pub use create_treasury::{CreateTreasury, CreateTreasuryArgs};
pub use execute_pending::ExecutePending;
pub(crate) use execute_pending::__client_accounts_execute_pending;
pub(crate) use execute_pending::__cpi_client_accounts_execute_pending;
pub use external_liveness::{
    CloseExternalLiveness, ConfigureLivenessGuardrails, ConfigureLivenessGuardrailsArgs,
    InitExternalLiveness, InitExternalLivenessArgs, RefreshExternalLiveness,
    RefreshExternalLivenessArgs,
};
pub(crate) use external_liveness::{
    __client_accounts_close_external_liveness, __client_accounts_configure_liveness_guardrails,
    __client_accounts_init_external_liveness, __client_accounts_refresh_external_liveness,
    __cpi_client_accounts_close_external_liveness,
    __cpi_client_accounts_configure_liveness_guardrails,
    __cpi_client_accounts_init_external_liveness, __cpi_client_accounts_refresh_external_liveness,
};
pub use fee_vault::{CloseFeeVault, CollectFees, InitFeeVault, UpdateFeeRecipient};
pub(crate) use fee_vault::{
    __client_accounts_close_fee_vault, __client_accounts_collect_fees,
    __client_accounts_init_fee_vault, __client_accounts_update_fee_recipient,
    __cpi_client_accounts_close_fee_vault, __cpi_client_accounts_collect_fees,
    __cpi_client_accounts_init_fee_vault, __cpi_client_accounts_update_fee_recipient,
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
pub use operator_roles::{
    GrantOperatorRole, GrantOperatorRoleArgs, RevokeOperatorRole, UpdateOperatorRole,
    UpdateOperatorRoleArgs,
};
pub(crate) use operator_roles::{
    __client_accounts_grant_operator_role, __client_accounts_revoke_operator_role,
    __client_accounts_update_operator_role, __cpi_client_accounts_grant_operator_role,
    __cpi_client_accounts_revoke_operator_role, __cpi_client_accounts_update_operator_role,
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
pub use policy_templates::{
    ApplyPolicyTemplate, ClosePolicyTemplate, CreatePolicyTemplate, CreatePolicyTemplateArgs,
    ManagePolicyTemplate, ParameterizedOverrides, UpdatePolicyTemplateArgs,
};
pub(crate) use policy_templates::{
    __client_accounts_apply_policy_template, __client_accounts_close_policy_template,
    __client_accounts_create_policy_template, __client_accounts_manage_policy_template,
    __cpi_client_accounts_apply_policy_template, __cpi_client_accounts_close_policy_template,
    __cpi_client_accounts_create_policy_template, __cpi_client_accounts_manage_policy_template,
};
pub(crate) use propose_confidential_transaction::__client_accounts_propose_confidential_transaction;
pub(crate) use propose_confidential_transaction::__cpi_client_accounts_propose_confidential_transaction;
pub use propose_confidential_transaction::{
    ProposeConfidentialTransaction, ProposeConfidentialTransactionArgs,
};
pub use propose_override::ProposeOverride;
pub(crate) use propose_override::__client_accounts_propose_override;
pub(crate) use propose_override::__cpi_client_accounts_propose_override;
pub(crate) use propose_transaction::__client_accounts_propose_transaction;
pub(crate) use propose_transaction::__cpi_client_accounts_propose_transaction;
pub use propose_transaction::{ProposeTransaction, ProposeTransactionArgs};
pub use recovery::{
    BreakGlassRecover, BreakGlassRecoverArgs, BreakGlassTransferAuthority,
    BreakGlassTransferAuthorityArgs, RecoveryConfig, RegisterRecoveryDestinationArgs,
};
pub(crate) use recovery::{
    __client_accounts_break_glass_recover, __client_accounts_break_glass_transfer_authority,
    __client_accounts_recovery_config, __cpi_client_accounts_break_glass_recover,
    __cpi_client_accounts_break_glass_transfer_authority, __cpi_client_accounts_recovery_config,
};
pub(crate) use register_dwallet::__client_accounts_register_dwallet;
pub(crate) use register_dwallet::__cpi_client_accounts_register_dwallet;
pub use register_dwallet::{RegisterDwallet, RegisterDwalletArgs};
pub use request_policy_decryption::RequestPolicyDecryption;
pub(crate) use request_policy_decryption::__client_accounts_request_policy_decryption;
pub(crate) use request_policy_decryption::__cpi_client_accounts_request_policy_decryption;
pub use scheduled_intents::{
    ClearScheduledIntentInFlight, CloseScheduledIntent, CreateScheduledIntent,
    ExecuteScheduledIntent, ManageScheduledIntent, ScheduledIntentArgs,
};
pub(crate) use scheduled_intents::{
    __client_accounts_clear_scheduled_intent_in_flight, __client_accounts_close_scheduled_intent,
    __client_accounts_create_scheduled_intent, __client_accounts_execute_scheduled_intent,
    __client_accounts_manage_scheduled_intent,
    __cpi_client_accounts_clear_scheduled_intent_in_flight,
    __cpi_client_accounts_close_scheduled_intent, __cpi_client_accounts_create_scheduled_intent,
    __cpi_client_accounts_execute_scheduled_intent, __cpi_client_accounts_manage_scheduled_intent,
};
pub use scoped_pause::{SetScopedPause, SetScopedPauseArgs};
pub(crate) use scoped_pause::{
    __client_accounts_set_scoped_pause, __cpi_client_accounts_set_scoped_pause,
};
pub use session_keys::{
    CloseSessionKey, IssueSessionKey, IssueSessionKeyArgs, RevokeSessionKey, UpdateSessionKey,
    UpdateSessionKeyArgs,
};
pub(crate) use session_keys::{
    __client_accounts_close_session_key, __client_accounts_issue_session_key,
    __client_accounts_revoke_session_key, __client_accounts_update_session_key,
    __cpi_client_accounts_close_session_key, __cpi_client_accounts_issue_session_key,
    __cpi_client_accounts_revoke_session_key, __cpi_client_accounts_update_session_key,
};
pub use snapshots::{CloseSnapshot, TakeSnapshot};
pub(crate) use snapshots::{
    __client_accounts_close_snapshot, __client_accounts_take_snapshot,
    __cpi_client_accounts_close_snapshot, __cpi_client_accounts_take_snapshot,
};
pub use swarm_pool::{CloseSwarmPool, InitSwarmPool, InitSwarmPoolArgs, JoinSwarm, ManageSwarm};
pub(crate) use swarm_pool::{
    __client_accounts_close_swarm_pool, __client_accounts_init_swarm_pool,
    __client_accounts_join_swarm, __client_accounts_manage_swarm,
    __cpi_client_accounts_close_swarm_pool, __cpi_client_accounts_init_swarm_pool,
    __cpi_client_accounts_join_swarm, __cpi_client_accounts_manage_swarm,
};
pub use treasury_admin::{
    OwnerTreasury, SetRecipientLimitArgs, TriggerDeadMansSwitch, UpdateTreasuryMetadataArgs,
    VetoConfigChange,
};
pub(crate) use treasury_admin::{
    __client_accounts_owner_treasury, __client_accounts_trigger_dead_mans_switch,
    __client_accounts_veto_config_change, __cpi_client_accounts_owner_treasury,
    __cpi_client_accounts_trigger_dead_mans_switch, __cpi_client_accounts_veto_config_change,
};
pub use trust_envelope::InitTrustIdentity;
pub use trust_envelope::{ConfigureTrustPolicyArgs, TrustEnvelopeConfig};
pub(crate) use trust_envelope::{
    __client_accounts_init_trust_identity, __client_accounts_trust_envelope_config,
    __cpi_client_accounts_init_trust_identity, __cpi_client_accounts_trust_envelope_config,
};
pub use wallet_balances::{
    RefreshVerifiedAssetBalance, RefreshVerifiedAssetBalanceArgs, SetAssetOracleFeedArgs,
};
pub(crate) use wallet_balances::{
    __client_accounts_refresh_verified_asset_balance,
    __cpi_client_accounts_refresh_verified_asset_balance,
};
pub use wallet_controls::{DwalletControl, InitDwalletState, RemoveDwallet, SetDefaultChain};
pub(crate) use wallet_controls::{
    __client_accounts_dwallet_control, __client_accounts_init_dwallet_state,
    __client_accounts_remove_dwallet, __client_accounts_set_default_chain,
    __cpi_client_accounts_dwallet_control, __cpi_client_accounts_init_dwallet_state,
    __cpi_client_accounts_remove_dwallet, __cpi_client_accounts_set_default_chain,
};
pub use wallet_transfers::DwalletSpend;
pub(crate) use wallet_transfers::{
    __client_accounts_dwallet_spend, __cpi_client_accounts_dwallet_spend,
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
    account.next_proposal_id = domain.next_proposal_id;
    account.execution_paused = domain.execution_paused;
    account.agent_state = lifecycle_state_code(domain.agent_state);
    account.confidential_guardrails = domain
        .confidential_guardrails
        .as_ref()
        .map(ConfidentialGuardrailsRecord::from_domain);

    account.pending_queue = if domain.pending_queue.is_empty() {
        let pending = domain
            .pending
            .as_ref()
            .ok_or_else(|| error!(crate::AuraCoreError::NoPendingTransaction))?;
        vec![PendingProposalRecord::from_domain(pending)?]
    } else {
        domain
            .pending_queue
            .iter()
            .map(PendingProposalRecord::from_domain)
            .collect::<Result<Vec<_>>>()?
    };

    emit_audit_events(account.key(), domain.audit_trail.events());
    if emit_proposal {
        if let Some(pending) = &domain.pending {
            emit_proposal_event(account.key(), pending);
        }
    }
    Ok(())
}
