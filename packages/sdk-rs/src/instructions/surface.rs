//! Full instruction-builder surface coverage test.
//!
//! References every builder for the 161-instruction `aura-core` program so that
//! renaming, removing, or failing to wire up any builder breaks compilation.
//! Because each builder is type-checked against the real Anchor-generated
//! account context and instruction-data structs, this also pins every builder's
//! signature to the checked-in program surface.

use solana_sdk::pubkey::Pubkey;

use super::{
    accounts, address_lists, agent, analytics, batch, billing, budget, chain_profiles, conditional,
    confidential, dwallet, execution, fees, governance, lifecycle, operational, policy,
    protocol_config, recovery, scheduled_intents, swarm, treasury, trust,
};

/// Compile-time proof that the entire program surface has a public builder.
#[test]
fn every_program_instruction_has_a_reachable_builder() {
    // treasury
    let _ = treasury::create_treasury;
    let _ = treasury::pause_execution;
    let _ = treasury::cancel_pending;
    let _ = treasury::configure_swarm;
    let _ = treasury::update_treasury_metadata;
    let _ = treasury::set_recipient_limit;
    let _ = treasury::remove_recipient_limit;

    // agent identity & capabilities
    let _ = agent::register_agent;
    let _ = agent::revoke_agent;
    let _ = agent::emergency_revoke_agent;
    let _ = agent::set_agent_capability;
    let _ = agent::arm_capability_loosen;
    let _ = agent::set_agent_tripwires;
    let _ = agent::nominate_successor_owner;
    let _ = agent::execute_ownership_handover;

    // trust envelope
    let _ = trust::init_trust_identity;
    let _ = trust::configure_trust_policy;
    let _ = trust::restore_trust;

    // recovery / break-glass
    let _ = recovery::register_recovery_destination;
    let _ = recovery::break_glass_recover;
    let _ = recovery::break_glass_transfer_authority;

    // chain profiles
    let _ = chain_profiles::register_chain_profile;
    let _ = chain_profiles::update_chain_profile;

    // dwallet controls / balances / transfers
    let _ = dwallet::register_dwallet;
    let _ = dwallet::refresh_dwallet_balance;
    let _ = dwallet::init_dwallet_state;
    let _ = dwallet::set_dwallet_status;
    let _ = dwallet::set_dwallet_limits;
    let _ = dwallet::set_dwallet_label;
    let _ = dwallet::rotate_dwallet_authority;
    let _ = dwallet::set_default_chain;
    let _ = dwallet::remove_dwallet;
    let _ = dwallet::refresh_asset_balance;
    let _ = dwallet::record_deposit;
    let _ = dwallet::set_asset_feed;
    let _ = dwallet::set_asset_oracle_feed;
    let _ = dwallet::refresh_verified_asset_balance;
    let _ = dwallet::reconcile_dwallet_balance;
    let _ = dwallet::reserve_dwallet_spend;
    let _ = dwallet::settle_dwallet_spend;
    let _ = dwallet::release_dwallet_spend;

    // confidential execution & guardrails
    let _ = confidential::configure_confidential_guardrails;
    let _ = confidential::propose_confidential_transaction;
    let _ = confidential::request_policy_decryption;
    let _ = confidential::confirm_policy_decryption;
    let _ = confidential::init_confidential_guardrails;
    let _ = confidential::update_confidential_guardrails;
    let _ = confidential::rotate_confidential_guardrails;
    let _ = confidential::reset_confidential_counters;
    let _ = confidential::disable_confidential_guardrails;
    let _ = confidential::close_confidential_guardrails;
    let _ = confidential::propose_confidential_batch;

    // execution lifecycle
    let _ = execution::propose_transaction;
    let _ = execution::execute_pending;
    let _ = execution::finalize_execution;
    let _ = execution::approve_pending_execution;
    let _ = execution::confirm_settlement;
    let _ = execution::mark_settlement_broadcast;
    let _ = execution::resubmit_proposal;
    let _ = execution::abandon_proposal;

    // batch
    let _ = batch::propose_batch;

    // budget envelopes & exposure groups
    let _ = budget::configure_budget_envelope;
    let _ = budget::init_exposure_group;
    let _ = budget::join_exposure_group;
    let _ = budget::configure_approval_ladder;
    let _ = budget::configure_liveness_guardrails;
    let _ = budget::remove_budget_envelope;
    let _ = budget::leave_exposure_group;
    let _ = budget::update_exposure_group;
    let _ = budget::close_exposure_group;

    // governance
    let _ = governance::configure_multisig;
    let _ = governance::propose_override;
    let _ = governance::collect_override_signature;
    let _ = governance::propose_ai_rotation;
    let _ = governance::execute_ai_rotation;
    let _ = governance::cancel_ai_rotation;
    let _ = governance::propose_guardian_rotation;
    let _ = governance::execute_guardian_rotation;
    let _ = governance::propose_config_change;
    let _ = governance::execute_config_change;
    let _ = governance::veto_config_change;
    let _ = governance::emergency_shutdown;

    // lifecycle / sessions / operator roles
    let _ = lifecycle::grant_operator_role;
    let _ = lifecycle::revoke_operator_role;
    let _ = lifecycle::transition_agent_state;
    let _ = lifecycle::migrate_treasury;
    let _ = lifecycle::issue_session_key;
    let _ = lifecycle::revoke_session_key;
    let _ = lifecycle::close_session_key;
    let _ = lifecycle::trigger_dead_mans_switch;
    let _ = lifecycle::update_session_key;
    let _ = lifecycle::update_operator_role;

    // operational surface
    let _ = operational::init_external_liveness;
    let _ = operational::refresh_external_liveness;
    let _ = operational::set_scoped_pause;
    let _ = operational::init_health_score;
    let _ = operational::refresh_health_score;
    let _ = operational::close_health_score;
    let _ = operational::take_snapshot;
    let _ = operational::record_policy_snapshot;
    let _ = operational::close_snapshot;
    let _ = operational::init_activity_log;
    let _ = operational::close_activity_log;
    let _ = operational::close_external_liveness;

    // policy controls
    let _ = policy::simulate_policy;
    let _ = policy::write_policy_receipt;
    let _ = policy::apply_policy_preset;
    let _ = policy::attest_policy;
    let _ = policy::check_invariants;
    let _ = policy::check_policy_cpi;
    let _ = policy::init_policy_history;
    let _ = policy::close_policy_history;
    let _ = policy::rollback_policy;
    let _ = policy::start_canary;
    let _ = policy::promote_canary;
    let _ = policy::discard_canary;
    let _ = policy::create_policy_template;
    let _ = policy::update_policy_template;
    let _ = policy::close_policy_template;
    let _ = policy::apply_policy_template;
    let _ = policy::apply_policy_template_parameterized;

    // protocol config
    let _ = protocol_config::init_protocol_config;
    let _ = protocol_config::update_protocol_config;
    let _ = protocol_config::commit_protocol_config;

    // scheduled intents
    let _ = scheduled_intents::create_scheduled_intent;
    let _ = scheduled_intents::update_scheduled_intent;
    let _ = scheduled_intents::pause_scheduled_intent;
    let _ = scheduled_intents::resume_scheduled_intent;
    let _ = scheduled_intents::close_scheduled_intent;
    let _ = scheduled_intents::clear_scheduled_intent_in_flight;
    let _ = scheduled_intents::execute_scheduled_intent;

    // conditional transactions
    let _ = conditional::propose_conditional_transaction;
    let _ = conditional::try_trigger;
    let _ = conditional::close_conditional_proposal;

    // fees
    let _ = fees::init_fee_vault;
    let _ = fees::collect_fees;
    let _ = fees::close_fee_vault;
    let _ = fees::deposit_fees;
    let _ = fees::withdraw_unused_fees;
    let _ = fees::set_fee_splits;
    let _ = fees::update_fee_recipient;
    let _ = fees::init_fee_schedule;
    let _ = fees::update_fee_schedule;
    let _ = fees::close_fee_schedule;

    // billing templates & org profiles
    let _ = billing::create_billing_template;
    let _ = billing::update_billing_template;
    let _ = billing::close_billing_template;
    let _ = billing::apply_billing_template;
    let _ = billing::apply_org_profile;

    // address lists
    let _ = address_lists::init_address_list;
    let _ = address_lists::manage_address_list;
    let _ = address_lists::close_address_list;
    let _ = address_lists::update_address_list_entry;
    let _ = address_lists::clear_address_list;

    // swarm pools
    let _ = swarm::init_swarm_pool;
    let _ = swarm::join_swarm;
    let _ = swarm::leave_swarm;
    let _ = swarm::update_swarm;
    let _ = swarm::close_swarm_pool;

    // analytics
    let _ = analytics::init_treasury_analytics;
    let _ = analytics::close_treasury_analytics;
}

/// Runtime check: a scalar-args builder added in this pass produces a
/// well-formed instruction for the program.
#[test]
fn remove_recipient_limit_builder_is_well_formed() {
    let ix = treasury::remove_recipient_limit(
        accounts::OwnerTreasury {
            owner: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
        },
        2,
        "0xrecipient".to_string(),
        42,
    );
    assert_eq!(ix.program_id, aura_core::ID);
    assert_eq!(ix.accounts.len(), 2);
    assert!(!ix.data.is_empty());
}
