//! Compile-time coverage test for the client send-helper surface.
//!
//! References the send-helper for every one of the 161 `aura-core` instructions
//! so that removing, renaming, or changing the visibility of any client method
//! breaks compilation.

use super::AuraClient;

#[test]
fn every_program_instruction_has_a_client_send_helper() {
    // core: treasury / agent / trust / recovery / analytics
    let _ = AuraClient::create_treasury;
    let _ = AuraClient::pause_execution;
    let _ = AuraClient::cancel_pending;
    let _ = AuraClient::configure_swarm;
    let _ = AuraClient::update_treasury_metadata;
    let _ = AuraClient::set_recipient_limit;
    let _ = AuraClient::remove_recipient_limit;
    let _ = AuraClient::register_agent;
    let _ = AuraClient::revoke_agent;
    let _ = AuraClient::emergency_revoke_agent;
    let _ = AuraClient::set_agent_capability;
    let _ = AuraClient::arm_capability_loosen;
    let _ = AuraClient::set_agent_tripwires;
    let _ = AuraClient::nominate_successor_owner;
    let _ = AuraClient::execute_ownership_handover;
    let _ = AuraClient::init_trust_identity;
    let _ = AuraClient::configure_trust_policy;
    let _ = AuraClient::restore_trust;
    let _ = AuraClient::register_recovery_destination;
    let _ = AuraClient::break_glass_recover;
    let _ = AuraClient::break_glass_transfer_authority;
    let _ = AuraClient::init_treasury_analytics;
    let _ = AuraClient::close_treasury_analytics;

    // flows: execution / batch / conditional / scheduled / confidential
    let _ = AuraClient::propose_transaction;
    let _ = AuraClient::propose_confidential_transaction;
    let _ = AuraClient::execute_pending;
    let _ = AuraClient::finalize_execution;
    let _ = AuraClient::approve_pending_execution;
    let _ = AuraClient::confirm_settlement;
    let _ = AuraClient::mark_settlement_broadcast;
    let _ = AuraClient::resubmit_proposal;
    let _ = AuraClient::abandon_proposal;
    let _ = AuraClient::propose_batch;
    let _ = AuraClient::propose_conditional_transaction;
    let _ = AuraClient::try_trigger;
    let _ = AuraClient::close_conditional_proposal;
    let _ = AuraClient::create_scheduled_intent;
    let _ = AuraClient::update_scheduled_intent;
    let _ = AuraClient::pause_scheduled_intent;
    let _ = AuraClient::resume_scheduled_intent;
    let _ = AuraClient::close_scheduled_intent;
    let _ = AuraClient::clear_scheduled_intent_in_flight;
    let _ = AuraClient::execute_scheduled_intent;
    let _ = AuraClient::configure_confidential_guardrails;
    let _ = AuraClient::request_policy_decryption;
    let _ = AuraClient::confirm_policy_decryption;
    let _ = AuraClient::init_confidential_guardrails;
    let _ = AuraClient::update_confidential_guardrails;
    let _ = AuraClient::rotate_confidential_guardrails;
    let _ = AuraClient::reset_confidential_counters;
    let _ = AuraClient::disable_confidential_guardrails;
    let _ = AuraClient::close_confidential_guardrails;
    let _ = AuraClient::propose_confidential_batch;

    // wallets: dwallet / chain profiles
    let _ = AuraClient::register_dwallet;
    let _ = AuraClient::refresh_dwallet_balance;
    let _ = AuraClient::init_dwallet_state;
    let _ = AuraClient::set_dwallet_status;
    let _ = AuraClient::set_dwallet_limits;
    let _ = AuraClient::set_dwallet_label;
    let _ = AuraClient::rotate_dwallet_authority;
    let _ = AuraClient::set_default_chain;
    let _ = AuraClient::remove_dwallet;
    let _ = AuraClient::refresh_asset_balance;
    let _ = AuraClient::record_deposit;
    let _ = AuraClient::set_asset_feed;
    let _ = AuraClient::set_asset_oracle_feed;
    let _ = AuraClient::refresh_verified_asset_balance;
    let _ = AuraClient::reconcile_dwallet_balance;
    let _ = AuraClient::reserve_dwallet_spend;
    let _ = AuraClient::settle_dwallet_spend;
    let _ = AuraClient::release_dwallet_spend;
    let _ = AuraClient::register_chain_profile;
    let _ = AuraClient::update_chain_profile;

    // admin: governance / lifecycle
    let _ = AuraClient::configure_multisig;
    let _ = AuraClient::propose_override;
    let _ = AuraClient::collect_override_signature;
    let _ = AuraClient::propose_ai_rotation;
    let _ = AuraClient::execute_ai_rotation;
    let _ = AuraClient::cancel_ai_rotation;
    let _ = AuraClient::propose_guardian_rotation;
    let _ = AuraClient::execute_guardian_rotation;
    let _ = AuraClient::propose_config_change;
    let _ = AuraClient::execute_config_change;
    let _ = AuraClient::veto_config_change;
    let _ = AuraClient::emergency_shutdown;
    let _ = AuraClient::grant_operator_role;
    let _ = AuraClient::revoke_operator_role;
    let _ = AuraClient::update_operator_role;
    let _ = AuraClient::transition_agent_state;
    let _ = AuraClient::migrate_treasury;
    let _ = AuraClient::issue_session_key;
    let _ = AuraClient::update_session_key;
    let _ = AuraClient::revoke_session_key;
    let _ = AuraClient::close_session_key;
    let _ = AuraClient::trigger_dead_mans_switch;

    // controls: policy / budget / operational / address lists / swarm
    let _ = AuraClient::simulate_policy;
    let _ = AuraClient::write_policy_receipt;
    let _ = AuraClient::apply_policy_preset;
    let _ = AuraClient::attest_policy;
    let _ = AuraClient::check_invariants;
    let _ = AuraClient::check_policy_cpi;
    let _ = AuraClient::init_policy_history;
    let _ = AuraClient::close_policy_history;
    let _ = AuraClient::rollback_policy;
    let _ = AuraClient::start_canary;
    let _ = AuraClient::promote_canary;
    let _ = AuraClient::discard_canary;
    let _ = AuraClient::create_policy_template;
    let _ = AuraClient::update_policy_template;
    let _ = AuraClient::close_policy_template;
    let _ = AuraClient::apply_policy_template;
    let _ = AuraClient::apply_policy_template_parameterized;
    let _ = AuraClient::configure_budget_envelope;
    let _ = AuraClient::init_exposure_group;
    let _ = AuraClient::join_exposure_group;
    let _ = AuraClient::remove_budget_envelope;
    let _ = AuraClient::leave_exposure_group;
    let _ = AuraClient::update_exposure_group;
    let _ = AuraClient::close_exposure_group;
    let _ = AuraClient::configure_approval_ladder;
    let _ = AuraClient::configure_liveness_guardrails;
    let _ = AuraClient::set_scoped_pause;
    let _ = AuraClient::init_external_liveness;
    let _ = AuraClient::refresh_external_liveness;
    let _ = AuraClient::close_external_liveness;
    let _ = AuraClient::init_health_score;
    let _ = AuraClient::refresh_health_score;
    let _ = AuraClient::close_health_score;
    let _ = AuraClient::take_snapshot;
    let _ = AuraClient::record_policy_snapshot;
    let _ = AuraClient::close_snapshot;
    let _ = AuraClient::init_activity_log;
    let _ = AuraClient::close_activity_log;
    let _ = AuraClient::init_address_list;
    let _ = AuraClient::manage_address_list;
    let _ = AuraClient::update_address_list_entry;
    let _ = AuraClient::clear_address_list;
    let _ = AuraClient::close_address_list;
    let _ = AuraClient::init_swarm_pool;
    let _ = AuraClient::join_swarm;
    let _ = AuraClient::leave_swarm;
    let _ = AuraClient::update_swarm;
    let _ = AuraClient::close_swarm_pool;

    // economics: fees / billing / protocol config
    let _ = AuraClient::init_fee_vault;
    let _ = AuraClient::collect_fees;
    let _ = AuraClient::close_fee_vault;
    let _ = AuraClient::deposit_fees;
    let _ = AuraClient::withdraw_unused_fees;
    let _ = AuraClient::set_fee_splits;
    let _ = AuraClient::update_fee_recipient;
    let _ = AuraClient::init_fee_schedule;
    let _ = AuraClient::update_fee_schedule;
    let _ = AuraClient::close_fee_schedule;
    let _ = AuraClient::create_billing_template;
    let _ = AuraClient::update_billing_template;
    let _ = AuraClient::close_billing_template;
    let _ = AuraClient::apply_billing_template;
    let _ = AuraClient::apply_org_profile;
    let _ = AuraClient::init_protocol_config;
    let _ = AuraClient::update_protocol_config;
    let _ = AuraClient::commit_protocol_config;
}
