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
// Some instruction handlers (and Anchor's generated dispatch glue) take many
// arguments; bundling every one into an args struct isn't worth the churn.
#![allow(clippy::too_many_arguments)]
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
    __client_accounts_abandon_proposal, __client_accounts_agent_manage,
    __client_accounts_apply_billing_template, __client_accounts_apply_org_profile,
    __client_accounts_apply_policy_preset, __client_accounts_apply_policy_template,
    __client_accounts_approve_pending_execution, __client_accounts_attest_policy,
    __client_accounts_break_glass_recover, __client_accounts_break_glass_transfer_authority,
    __client_accounts_cancel_pending, __client_accounts_check_invariants,
    __client_accounts_check_policy_cpi, __client_accounts_clear_scheduled_intent_in_flight,
    __client_accounts_close_activity_log, __client_accounts_close_address_list,
    __client_accounts_close_billing_template, __client_accounts_close_conditional_proposal,
    __client_accounts_close_exposure_group, __client_accounts_close_external_liveness,
    __client_accounts_close_fee_schedule, __client_accounts_close_fee_vault,
    __client_accounts_close_health_score, __client_accounts_close_policy_history,
    __client_accounts_close_policy_template, __client_accounts_close_scheduled_intent,
    __client_accounts_close_session_key, __client_accounts_close_snapshot,
    __client_accounts_close_swarm_pool, __client_accounts_collect_fees,
    __client_accounts_collect_override_signature, __client_accounts_configure_approval_ladder,
    __client_accounts_configure_budget_envelope,
    __client_accounts_configure_confidential_guardrails,
    __client_accounts_configure_liveness_guardrails, __client_accounts_configure_multisig,
    __client_accounts_configure_swarm, __client_accounts_confirm_policy_decryption,
    __client_accounts_confirm_settlement, __client_accounts_create_billing_template,
    __client_accounts_create_policy_template, __client_accounts_create_scheduled_intent,
    __client_accounts_create_treasury, __client_accounts_discard_canary,
    __client_accounts_dwallet_control, __client_accounts_dwallet_spend,
    __client_accounts_emergency_revoke_agent, __client_accounts_execute_ownership_handover,
    __client_accounts_execute_pending, __client_accounts_execute_scheduled_intent,
    __client_accounts_finalize_execution, __client_accounts_grant_operator_role,
    __client_accounts_init_activity_log, __client_accounts_init_address_list,
    __client_accounts_init_dwallet_state, __client_accounts_init_exposure_group,
    __client_accounts_init_external_liveness, __client_accounts_init_fee_schedule,
    __client_accounts_init_fee_vault, __client_accounts_init_health_score,
    __client_accounts_init_policy_history, __client_accounts_init_protocol_config,
    __client_accounts_init_swarm_pool, __client_accounts_init_trust_identity,
    __client_accounts_issue_session_key, __client_accounts_join_exposure_group,
    __client_accounts_join_swarm, __client_accounts_manage_address_list,
    __client_accounts_manage_billing_template, __client_accounts_manage_exposure_group,
    __client_accounts_manage_fee_vault, __client_accounts_manage_policy_template,
    __client_accounts_manage_scheduled_intent, __client_accounts_manage_swarm,
    __client_accounts_mark_settlement_broadcast, __client_accounts_migrate_treasury,
    __client_accounts_owner_treasury, __client_accounts_ownership_handover,
    __client_accounts_pause_execution, __client_accounts_promote_canary,
    __client_accounts_propose_batch, __client_accounts_propose_conditional_transaction,
    __client_accounts_propose_confidential_transaction, __client_accounts_propose_override,
    __client_accounts_propose_transaction, __client_accounts_protocol_config_authority,
    __client_accounts_record_policy_snapshot, __client_accounts_recovery_config,
    __client_accounts_refresh_dwallet_balance, __client_accounts_refresh_external_liveness,
    __client_accounts_refresh_verified_asset_balance, __client_accounts_register_chain_profile,
    __client_accounts_register_dwallet, __client_accounts_remove_budget_envelope,
    __client_accounts_remove_dwallet, __client_accounts_request_policy_decryption,
    __client_accounts_resubmit_proposal, __client_accounts_revoke_operator_role,
    __client_accounts_revoke_session_key, __client_accounts_rollback_policy,
    __client_accounts_set_default_chain, __client_accounts_set_scoped_pause,
    __client_accounts_simulate_policy, __client_accounts_start_canary,
    __client_accounts_take_snapshot, __client_accounts_trigger_dead_mans_switch,
    __client_accounts_trust_envelope_config, __client_accounts_try_trigger,
    __client_accounts_update_chain_profile, __client_accounts_update_fee_recipient,
    __client_accounts_update_fee_schedule, __client_accounts_update_health_score,
    __client_accounts_update_operator_role, __client_accounts_update_session_key,
    __client_accounts_veto_config_change, __client_accounts_write_policy_receipt,
    __cpi_client_accounts_abandon_proposal, __cpi_client_accounts_agent_manage,
    __cpi_client_accounts_apply_billing_template, __cpi_client_accounts_apply_org_profile,
    __cpi_client_accounts_apply_policy_preset, __cpi_client_accounts_apply_policy_template,
    __cpi_client_accounts_approve_pending_execution, __cpi_client_accounts_attest_policy,
    __cpi_client_accounts_break_glass_recover,
    __cpi_client_accounts_break_glass_transfer_authority, __cpi_client_accounts_cancel_pending,
    __cpi_client_accounts_check_invariants, __cpi_client_accounts_check_policy_cpi,
    __cpi_client_accounts_clear_scheduled_intent_in_flight,
    __cpi_client_accounts_close_activity_log, __cpi_client_accounts_close_address_list,
    __cpi_client_accounts_close_billing_template, __cpi_client_accounts_close_conditional_proposal,
    __cpi_client_accounts_close_exposure_group, __cpi_client_accounts_close_external_liveness,
    __cpi_client_accounts_close_fee_schedule, __cpi_client_accounts_close_fee_vault,
    __cpi_client_accounts_close_health_score, __cpi_client_accounts_close_policy_history,
    __cpi_client_accounts_close_policy_template, __cpi_client_accounts_close_scheduled_intent,
    __cpi_client_accounts_close_session_key, __cpi_client_accounts_close_snapshot,
    __cpi_client_accounts_close_swarm_pool, __cpi_client_accounts_collect_fees,
    __cpi_client_accounts_collect_override_signature,
    __cpi_client_accounts_configure_approval_ladder,
    __cpi_client_accounts_configure_budget_envelope,
    __cpi_client_accounts_configure_confidential_guardrails,
    __cpi_client_accounts_configure_liveness_guardrails, __cpi_client_accounts_configure_multisig,
    __cpi_client_accounts_configure_swarm, __cpi_client_accounts_confirm_policy_decryption,
    __cpi_client_accounts_confirm_settlement, __cpi_client_accounts_create_billing_template,
    __cpi_client_accounts_create_policy_template, __cpi_client_accounts_create_scheduled_intent,
    __cpi_client_accounts_create_treasury, __cpi_client_accounts_discard_canary,
    __cpi_client_accounts_dwallet_control, __cpi_client_accounts_dwallet_spend,
    __cpi_client_accounts_emergency_revoke_agent, __cpi_client_accounts_execute_ownership_handover,
    __cpi_client_accounts_execute_pending, __cpi_client_accounts_execute_scheduled_intent,
    __cpi_client_accounts_finalize_execution, __cpi_client_accounts_grant_operator_role,
    __cpi_client_accounts_init_activity_log, __cpi_client_accounts_init_address_list,
    __cpi_client_accounts_init_dwallet_state, __cpi_client_accounts_init_exposure_group,
    __cpi_client_accounts_init_external_liveness, __cpi_client_accounts_init_fee_schedule,
    __cpi_client_accounts_init_fee_vault, __cpi_client_accounts_init_health_score,
    __cpi_client_accounts_init_policy_history, __cpi_client_accounts_init_protocol_config,
    __cpi_client_accounts_init_swarm_pool, __cpi_client_accounts_init_trust_identity,
    __cpi_client_accounts_issue_session_key, __cpi_client_accounts_join_exposure_group,
    __cpi_client_accounts_join_swarm, __cpi_client_accounts_manage_address_list,
    __cpi_client_accounts_manage_billing_template, __cpi_client_accounts_manage_exposure_group,
    __cpi_client_accounts_manage_fee_vault, __cpi_client_accounts_manage_policy_template,
    __cpi_client_accounts_manage_scheduled_intent, __cpi_client_accounts_manage_swarm,
    __cpi_client_accounts_mark_settlement_broadcast, __cpi_client_accounts_migrate_treasury,
    __cpi_client_accounts_owner_treasury, __cpi_client_accounts_ownership_handover,
    __cpi_client_accounts_pause_execution, __cpi_client_accounts_promote_canary,
    __cpi_client_accounts_propose_batch, __cpi_client_accounts_propose_conditional_transaction,
    __cpi_client_accounts_propose_confidential_transaction, __cpi_client_accounts_propose_override,
    __cpi_client_accounts_propose_transaction, __cpi_client_accounts_protocol_config_authority,
    __cpi_client_accounts_record_policy_snapshot, __cpi_client_accounts_recovery_config,
    __cpi_client_accounts_refresh_dwallet_balance, __cpi_client_accounts_refresh_external_liveness,
    __cpi_client_accounts_refresh_verified_asset_balance,
    __cpi_client_accounts_register_chain_profile, __cpi_client_accounts_register_dwallet,
    __cpi_client_accounts_remove_budget_envelope, __cpi_client_accounts_remove_dwallet,
    __cpi_client_accounts_request_policy_decryption, __cpi_client_accounts_resubmit_proposal,
    __cpi_client_accounts_revoke_operator_role, __cpi_client_accounts_revoke_session_key,
    __cpi_client_accounts_rollback_policy, __cpi_client_accounts_set_default_chain,
    __cpi_client_accounts_set_scoped_pause, __cpi_client_accounts_simulate_policy,
    __cpi_client_accounts_start_canary, __cpi_client_accounts_take_snapshot,
    __cpi_client_accounts_trigger_dead_mans_switch, __cpi_client_accounts_trust_envelope_config,
    __cpi_client_accounts_try_trigger, __cpi_client_accounts_update_chain_profile,
    __cpi_client_accounts_update_fee_recipient, __cpi_client_accounts_update_fee_schedule,
    __cpi_client_accounts_update_health_score, __cpi_client_accounts_update_operator_role,
    __cpi_client_accounts_update_session_key, __cpi_client_accounts_veto_config_change,
    __cpi_client_accounts_write_policy_receipt,
};

declare_id!("auraEgX8ZUK3Xr8X81aRfgyTmoyNdsdfL6XfDN8W1ce");

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

    pub fn init_trust_identity(ctx: Context<InitTrustIdentity>, now: i64) -> Result<()> {
        instructions::trust_envelope::init_trust_identity(ctx, now)
    }

    pub fn configure_trust_policy(
        ctx: Context<TrustEnvelopeConfig>,
        args: ConfigureTrustPolicyArgs,
    ) -> Result<()> {
        instructions::trust_envelope::configure_trust_policy(ctx, args)
    }

    pub fn restore_trust(ctx: Context<TrustEnvelopeConfig>, now: i64) -> Result<()> {
        instructions::trust_envelope::restore_trust(ctx, now)
    }

    pub fn register_agent(ctx: Context<AgentManage>, args: RegisterAgentArgs) -> Result<()> {
        instructions::agent_identity::register_agent(ctx, args)
    }

    pub fn revoke_agent(ctx: Context<AgentManage>, key: Pubkey, now: i64) -> Result<()> {
        instructions::agent_identity::revoke_agent(ctx, key, now)
    }

    pub fn emergency_revoke_agent(
        ctx: Context<EmergencyRevokeAgent>,
        key: Pubkey,
        now: i64,
    ) -> Result<()> {
        instructions::agent_identity::emergency_revoke_agent(ctx, key, now)
    }

    pub fn nominate_successor_owner(
        ctx: Context<OwnershipHandover>,
        args: NominateSuccessorArgs,
    ) -> Result<()> {
        instructions::agent_identity::nominate_successor_owner(ctx, args)
    }

    pub fn execute_ownership_handover(
        ctx: Context<ExecuteOwnershipHandover>,
        args: ExecuteHandoverArgs,
    ) -> Result<()> {
        instructions::agent_identity::execute_ownership_handover(ctx, args)
    }

    pub fn set_agent_capability(
        ctx: Context<AgentManage>,
        args: SetAgentCapabilityArgs,
    ) -> Result<()> {
        instructions::agent_capabilities::set_agent_capability(ctx, args)
    }

    pub fn arm_capability_loosen(ctx: Context<AgentManage>, key: Pubkey, now: i64) -> Result<()> {
        instructions::agent_capabilities::arm_capability_loosen(ctx, key, now)
    }

    pub fn set_agent_tripwires(
        ctx: Context<TrustEnvelopeConfig>,
        args: SetAgentTripwiresArgs,
    ) -> Result<()> {
        instructions::agent_capabilities::set_agent_tripwires(ctx, args)
    }

    pub fn register_recovery_destination(
        ctx: Context<RecoveryConfig>,
        args: RegisterRecoveryDestinationArgs,
    ) -> Result<()> {
        instructions::recovery::register_recovery_destination(ctx, args)
    }

    pub fn break_glass_recover(
        ctx: Context<BreakGlassRecover>,
        args: BreakGlassRecoverArgs,
    ) -> Result<()> {
        instructions::recovery::break_glass_recover(ctx, args)
    }

    pub fn break_glass_transfer_authority(
        ctx: Context<BreakGlassTransferAuthority>,
        args: BreakGlassTransferAuthorityArgs,
    ) -> Result<()> {
        instructions::recovery::break_glass_transfer_authority(ctx, args)
    }

    pub fn register_chain_profile(
        ctx: Context<RegisterChainProfile>,
        args: ChainProfileArgs,
    ) -> Result<()> {
        instructions::chain_profiles::register_chain_profile(ctx, args)
    }

    pub fn update_chain_profile(
        ctx: Context<UpdateChainProfile>,
        args: ChainProfileArgs,
    ) -> Result<()> {
        instructions::chain_profiles::update_chain_profile(ctx, args)
    }

    pub fn init_dwallet_state(ctx: Context<InitDwalletState>, chain: u8, now: i64) -> Result<()> {
        instructions::wallet_controls::init_dwallet_state(ctx, chain, now)
    }

    pub fn set_dwallet_status(
        ctx: Context<DwalletControl>,
        chain: u8,
        status_code: u8,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_controls::set_dwallet_status(ctx, chain, status_code, now)
    }

    pub fn set_dwallet_limits(
        ctx: Context<DwalletControl>,
        chain: u8,
        daily_limit_usd: Option<u64>,
        per_tx_limit_usd: Option<u64>,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_controls::set_dwallet_limits(
            ctx,
            chain,
            daily_limit_usd,
            per_tx_limit_usd,
            now,
        )
    }

    pub fn set_dwallet_label(
        ctx: Context<DwalletControl>,
        chain: u8,
        label: Option<String>,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_controls::set_dwallet_label(ctx, chain, label, now)
    }

    pub fn rotate_dwallet_authority(
        ctx: Context<DwalletControl>,
        chain: u8,
        new_authority: Pubkey,
        new_cpi_authority_seed: String,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_controls::rotate_dwallet_authority(
            ctx,
            chain,
            new_authority,
            new_cpi_authority_seed,
            now,
        )
    }

    pub fn set_default_chain(
        ctx: Context<SetDefaultChain>,
        chain: Option<u8>,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_controls::set_default_chain(ctx, chain, now)
    }

    pub fn remove_dwallet(ctx: Context<RemoveDwallet>, chain: u8, now: i64) -> Result<()> {
        instructions::wallet_controls::remove_dwallet(ctx, chain, now)
    }

    #[allow(clippy::too_many_arguments)]
    pub fn refresh_asset_balance(
        ctx: Context<DwalletControl>,
        chain: u8,
        asset_id: String,
        symbol: String,
        decimals: u8,
        native_amount: u128,
        usd_value: u64,
        feed: Option<Pubkey>,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_balances::refresh_asset_balance(
            ctx,
            chain,
            asset_id,
            symbol,
            decimals,
            native_amount,
            usd_value,
            feed,
            now,
        )
    }

    #[allow(clippy::too_many_arguments)]
    pub fn record_deposit(
        ctx: Context<DwalletControl>,
        chain: u8,
        asset_id: String,
        symbol: String,
        decimals: u8,
        native_amount: u128,
        usd_value: u64,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_balances::record_deposit(
            ctx,
            chain,
            asset_id,
            symbol,
            decimals,
            native_amount,
            usd_value,
            now,
        )
    }

    pub fn set_asset_feed(
        ctx: Context<DwalletControl>,
        chain: u8,
        asset_id: String,
        feed: Option<Pubkey>,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_balances::set_asset_feed(ctx, chain, asset_id, feed, now)
    }

    pub fn set_asset_oracle_feed(
        ctx: Context<DwalletControl>,
        chain: u8,
        args: SetAssetOracleFeedArgs,
    ) -> Result<()> {
        instructions::wallet_balances::set_asset_oracle_feed(ctx, chain, args)
    }

    pub fn refresh_verified_asset_balance(
        ctx: Context<RefreshVerifiedAssetBalance>,
        args: RefreshVerifiedAssetBalanceArgs,
    ) -> Result<()> {
        instructions::wallet_balances::refresh_verified_asset_balance(ctx, args)
    }

    pub fn reconcile_dwallet_balance(
        ctx: Context<DwalletControl>,
        chain: u8,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_balances::reconcile_dwallet_balance(ctx, chain, now)
    }

    pub fn reserve_dwallet_spend(
        ctx: Context<DwalletSpend>,
        chain: u8,
        amount_usd: u64,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_transfers::reserve_dwallet_spend(ctx, chain, amount_usd, now)
    }

    pub fn settle_dwallet_spend(
        ctx: Context<DwalletSpend>,
        chain: u8,
        amount_usd: u64,
        asset_id: String,
        native_amount: u128,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_transfers::settle_dwallet_spend(
            ctx,
            chain,
            amount_usd,
            asset_id,
            native_amount,
            now,
        )
    }

    pub fn release_dwallet_spend(
        ctx: Context<DwalletSpend>,
        chain: u8,
        amount_usd: u64,
        now: i64,
    ) -> Result<()> {
        instructions::wallet_transfers::release_dwallet_spend(ctx, chain, amount_usd, now)
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

    pub fn confirm_settlement(
        ctx: Context<ConfirmSettlement>,
        args: ConfirmSettlementArgs,
    ) -> Result<()> {
        instructions::confirm_settlement::handler(ctx, args)
    }

    pub fn mark_settlement_broadcast(
        ctx: Context<MarkSettlementBroadcast>,
        args: MarkSettlementBroadcastArgs,
    ) -> Result<()> {
        instructions::confirm_settlement::mark_broadcast(ctx, args)
    }

    pub fn resubmit_proposal(
        ctx: Context<ResubmitProposal>,
        args: ResubmitProposalArgs,
    ) -> Result<()> {
        instructions::confirm_settlement::resubmit_proposal(ctx, args)
    }

    pub fn abandon_proposal(
        ctx: Context<AbandonProposal>,
        proposal_id: u64,
        now: i64,
    ) -> Result<()> {
        instructions::confirm_settlement::abandon_proposal(ctx, proposal_id, now)
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

    pub fn deposit_fees(ctx: Context<ManageFeeVault>, amount: u64) -> Result<()> {
        instructions::fee_vault::deposit_fees(ctx, amount)
    }

    pub fn withdraw_unused_fees(ctx: Context<ManageFeeVault>, amount: u64) -> Result<()> {
        instructions::fee_vault::withdraw_unused_fees(ctx, amount)
    }

    pub fn set_fee_splits(
        ctx: Context<ManageFeeVault>,
        splits: Vec<FeeSplitRecord>,
        low_balance_mode: u8,
    ) -> Result<()> {
        instructions::fee_vault::set_fee_splits(ctx, splits, low_balance_mode)
    }

    pub fn init_fee_schedule(
        ctx: Context<InitFeeSchedule>,
        schedule: FeeScheduleRecord,
        now: i64,
    ) -> Result<()> {
        instructions::fee_schedule::init_fee_schedule(ctx, schedule, now)
    }

    pub fn update_fee_schedule(
        ctx: Context<UpdateFeeSchedule>,
        schedule: FeeScheduleRecord,
        now: i64,
    ) -> Result<()> {
        instructions::fee_schedule::update_fee_schedule(ctx, schedule, now)
    }

    pub fn close_fee_schedule(ctx: Context<CloseFeeSchedule>) -> Result<()> {
        instructions::fee_schedule::close_fee_schedule(ctx)
    }

    pub fn create_billing_template(
        ctx: Context<CreateBillingTemplate>,
        args: CreateBillingTemplateArgs,
    ) -> Result<()> {
        instructions::billing_templates::create_billing_template(ctx, args)
    }

    pub fn update_billing_template(
        ctx: Context<ManageBillingTemplate>,
        args: UpdateBillingTemplateArgs,
    ) -> Result<()> {
        instructions::billing_templates::update_billing_template(ctx, args)
    }

    pub fn close_billing_template(ctx: Context<CloseBillingTemplate>) -> Result<()> {
        instructions::billing_templates::close_billing_template(ctx)
    }

    pub fn apply_billing_template(ctx: Context<ApplyBillingTemplate>, now: i64) -> Result<()> {
        instructions::billing_templates::apply_billing_template(ctx, now)
    }

    pub fn apply_org_profile(ctx: Context<ApplyOrgProfile>, now: i64) -> Result<()> {
        instructions::billing_templates::apply_org_profile(ctx, now)
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

    pub fn record_policy_snapshot(ctx: Context<RecordPolicySnapshot>, now: i64) -> Result<()> {
        instructions::policy_history::record_policy_snapshot(ctx, now)
    }

    pub fn rollback_policy(
        ctx: Context<RollbackPolicy>,
        target_version: u32,
        candidate: PolicyConfigRecord,
        now: i64,
    ) -> Result<()> {
        instructions::policy_history::rollback_policy(ctx, target_version, candidate, now)
    }

    pub fn start_canary(
        ctx: Context<StartCanary>,
        candidate: PolicyConfigRecord,
        sample_cap: u32,
        now: i64,
    ) -> Result<()> {
        instructions::policy_canary::start_canary(ctx, candidate, sample_cap, now)
    }

    pub fn promote_canary(ctx: Context<PromoteCanary>, now: i64) -> Result<()> {
        instructions::policy_canary::promote_canary(ctx, now)
    }

    pub fn discard_canary(ctx: Context<DiscardCanary>) -> Result<()> {
        instructions::policy_canary::discard_canary(ctx)
    }

    pub fn init_protocol_config(
        ctx: Context<InitProtocolConfig>,
        args: ProtocolConfigArgs,
        now: i64,
    ) -> Result<()> {
        instructions::protocol_config::init_protocol_config(ctx, args, now)
    }

    pub fn update_protocol_config(
        ctx: Context<ProtocolConfigAuthority>,
        args: ProtocolConfigArgs,
        now: i64,
    ) -> Result<()> {
        instructions::protocol_config::update_protocol_config(ctx, args, now)
    }

    pub fn commit_protocol_config(ctx: Context<ProtocolConfigAuthority>, now: i64) -> Result<()> {
        instructions::protocol_config::commit_protocol_config(ctx, now)
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

    pub fn create_policy_template(
        ctx: Context<CreatePolicyTemplate>,
        args: CreatePolicyTemplateArgs,
    ) -> Result<()> {
        instructions::policy_templates::create_policy_template(ctx, args)
    }

    pub fn update_policy_template(
        ctx: Context<ManagePolicyTemplate>,
        args: UpdatePolicyTemplateArgs,
    ) -> Result<()> {
        instructions::policy_templates::update_policy_template(ctx, args)
    }

    pub fn close_policy_template(ctx: Context<ClosePolicyTemplate>) -> Result<()> {
        instructions::policy_templates::close_policy_template(ctx)
    }

    pub fn apply_policy_template(ctx: Context<ApplyPolicyTemplate>, now: i64) -> Result<()> {
        instructions::policy_templates::apply_policy_template(ctx, now)
    }

    pub fn apply_policy_template_parameterized(
        ctx: Context<ApplyPolicyTemplate>,
        overrides: ParameterizedOverrides,
        now: i64,
    ) -> Result<()> {
        instructions::policy_templates::apply_policy_template_parameterized(ctx, overrides, now)
    }

    pub fn create_scheduled_intent(
        ctx: Context<CreateScheduledIntent>,
        intent_id: u64,
        args: ScheduledIntentArgs,
    ) -> Result<()> {
        instructions::scheduled_intents::create_scheduled_intent(ctx, intent_id, args)
    }

    pub fn update_scheduled_intent(
        ctx: Context<ManageScheduledIntent>,
        args: ScheduledIntentArgs,
    ) -> Result<()> {
        instructions::scheduled_intents::update_scheduled_intent(ctx, args)
    }

    pub fn pause_scheduled_intent(ctx: Context<ManageScheduledIntent>) -> Result<()> {
        instructions::scheduled_intents::set_scheduled_intent_enabled(ctx, false)
    }

    pub fn resume_scheduled_intent(ctx: Context<ManageScheduledIntent>) -> Result<()> {
        instructions::scheduled_intents::set_scheduled_intent_enabled(ctx, true)
    }

    pub fn close_scheduled_intent(ctx: Context<CloseScheduledIntent>) -> Result<()> {
        instructions::scheduled_intents::close_scheduled_intent(ctx)
    }

    pub fn clear_scheduled_intent_in_flight(
        ctx: Context<ClearScheduledIntentInFlight>,
        proposal_id: u64,
        now: i64,
    ) -> Result<()> {
        instructions::scheduled_intents::clear_scheduled_intent_in_flight(ctx, proposal_id, now)
    }

    pub fn execute_scheduled_intent(ctx: Context<ExecuteScheduledIntent>) -> Result<()> {
        instructions::scheduled_intents::execute_scheduled_intent(ctx)
    }

    pub fn propose_conditional_transaction(
        ctx: Context<ProposeConditionalTransaction>,
        proposal_id: u64,
        args: ConditionalProposalArgs,
    ) -> Result<()> {
        instructions::conditional::propose_conditional_transaction(ctx, proposal_id, args)
    }

    pub fn try_trigger(ctx: Context<TryTrigger>) -> Result<()> {
        instructions::conditional::try_trigger(ctx)
    }

    pub fn close_conditional_proposal(ctx: Context<CloseConditionalProposal>) -> Result<()> {
        instructions::conditional::close_conditional_proposal(ctx)
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

    pub fn remove_budget_envelope(
        ctx: Context<RemoveBudgetEnvelope>,
        envelope_id: u64,
        now: i64,
    ) -> Result<()> {
        instructions::budget_envelopes::remove_budget_envelope(ctx, envelope_id, now)
    }

    pub fn leave_exposure_group(ctx: Context<ManageExposureGroup>) -> Result<()> {
        instructions::budget_envelopes::leave_exposure_group(ctx)
    }

    pub fn update_exposure_group(
        ctx: Context<ManageExposureGroup>,
        daily_limit_usd: Option<u64>,
    ) -> Result<()> {
        instructions::budget_envelopes::update_exposure_group(ctx, daily_limit_usd)
    }

    pub fn close_exposure_group(ctx: Context<CloseExposureGroup>) -> Result<()> {
        instructions::budget_envelopes::close_exposure_group(ctx)
    }

    pub fn close_external_liveness(ctx: Context<CloseExternalLiveness>) -> Result<()> {
        instructions::external_liveness::close_external_liveness(ctx)
    }

    pub fn update_treasury_metadata(
        ctx: Context<OwnerTreasury>,
        args: UpdateTreasuryMetadataArgs,
    ) -> Result<()> {
        instructions::treasury_admin::update_treasury_metadata(ctx, args)
    }

    pub fn set_recipient_limit(
        ctx: Context<OwnerTreasury>,
        args: SetRecipientLimitArgs,
    ) -> Result<()> {
        instructions::treasury_admin::set_recipient_limit(ctx, args)
    }

    pub fn remove_recipient_limit(
        ctx: Context<OwnerTreasury>,
        chain: u8,
        address: String,
        now: i64,
    ) -> Result<()> {
        instructions::treasury_admin::remove_recipient_limit(ctx, chain, address, now)
    }

    pub fn update_address_list_entry(
        ctx: Context<ManageAddressList>,
        address: String,
        add: bool,
        now: i64,
    ) -> Result<()> {
        instructions::address_lists::update_address_list_entry(ctx, address, add, now)
    }

    pub fn clear_address_list(ctx: Context<ManageAddressList>, now: i64) -> Result<()> {
        instructions::address_lists::clear_address_list(ctx, now)
    }

    pub fn leave_swarm(ctx: Context<ManageSwarm>, now: i64) -> Result<()> {
        instructions::swarm_pool::leave_swarm(ctx, now)
    }

    pub fn update_swarm(
        ctx: Context<ManageSwarm>,
        shared_pool_limit_usd: u64,
        now: i64,
    ) -> Result<()> {
        instructions::swarm_pool::update_swarm(ctx, shared_pool_limit_usd, now)
    }

    pub fn close_swarm_pool(ctx: Context<CloseSwarmPool>) -> Result<()> {
        instructions::swarm_pool::close_swarm_pool(ctx)
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

    pub fn update_operator_role(
        ctx: Context<UpdateOperatorRole>,
        args: UpdateOperatorRoleArgs,
    ) -> Result<()> {
        instructions::operator_roles::update_operator_role(ctx, args)
    }

    pub fn update_session_key(
        ctx: Context<UpdateSessionKey>,
        args: UpdateSessionKeyArgs,
    ) -> Result<()> {
        instructions::session_keys::update_session_key(ctx, args)
    }

    pub fn update_fee_recipient(
        ctx: Context<UpdateFeeRecipient>,
        new_recipient: Pubkey,
    ) -> Result<()> {
        instructions::fee_vault::update_fee_recipient(ctx, new_recipient)
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
    propose_confidential_transaction_with_transfer, propose_transaction,
    propose_transaction_with_transfer,
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
