use crate::{
    config::{
        is_fresh, required_approval_level, ApprovalLadder, ApprovalLevel, BudgetEnvelope,
        BudgetEnvelopeScope, BudgetEnvelopeSet, PauseScope, PolicyPresetKind, ScopedPauseControls,
        ScopedPauseEntry,
    },
    decision::{explain_decision, rule_outcome_bitmap},
    engine::{evaluate_batch_policy, evaluate_policy_without_spend_mutation, evaluate_transaction},
    helpers::diff::{FIELD_DAILY_LIMIT, FIELD_PER_TX_LIMIT},
    helpers::{confidential_commitment, diff_policy_config, policy_config_hash},
    state::{ExposureGroupState, PolicyState},
    types::{Chain, TransactionType},
    violations::ViolationCode,
    BatchProposalItem, PolicyConfig,
};

use super::engine_rules::base_tx;

#[test]
fn explainable_receipt_fields_capture_decision_shape() {
    let mut tx = base_tx();
    tx.amount_usd = 2_500;
    let decision = evaluate_transaction(
        &PolicyConfig::default(),
        &PolicyState::default(),
        &tx.into(),
    );

    assert!(!decision.approved);
    assert_ne!(rule_outcome_bitmap(&decision), 0);
    let fields = explain_decision(&decision, 100, ApprovalLevel::Guardian);
    assert_eq!(fields.decision, 0);
    assert_eq!(
        fields.primary_violation,
        ViolationCode::PerTransactionLimit as u16
    );
    assert_eq!(
        fields.required_approval_level,
        ApprovalLevel::Guardian.code()
    );
}

#[test]
fn simulation_does_not_mutate_previous_policy_state() {
    let state = PolicyState::default();
    let decision =
        evaluate_policy_without_spend_mutation(&PolicyConfig::default(), &state, &base_tx().into());

    assert!(decision.approved);
    assert_eq!(state.spent_today_usd, 0);
    assert_eq!(decision.next_state.spent_today_usd, 500);
}

#[test]
fn presets_and_policy_diff_identify_tightening_and_loosening() {
    let base = PolicyConfig::default();
    let strict = crate::build_policy_preset(PolicyPresetKind::StrictCompliance);
    let relaxed = crate::build_policy_preset(PolicyPresetKind::HighTrustExecutor);

    let strict_diff = diff_policy_config(&base, &strict);
    assert_ne!(strict_diff.tightened_bitmap, 0);

    let relaxed_diff = diff_policy_config(&base, &relaxed);
    assert_ne!(relaxed_diff.loosened_bitmap, 0);
    assert_ne!(relaxed_diff.high_impact_bitmap, 0);
}

#[test]
fn policy_diff_noop_is_empty_and_hash_inputs_are_sensitive() {
    let base = PolicyConfig::default();
    let noop = diff_policy_config(&base, &base);
    assert_eq!(noop.tightened_bitmap, 0);
    assert_eq!(noop.loosened_bitmap, 0);
    assert_eq!(noop.high_impact_bitmap, 0);
    assert_eq!(noop.risk_delta_bps, 0);

    let mut tightened = base.clone();
    tightened.per_tx_limit_usd = base.per_tx_limit_usd.saturating_sub(1);
    let diff = diff_policy_config(&base, &tightened);
    assert_ne!(diff.tightened_bitmap & (1u128 << FIELD_PER_TX_LIMIT), 0);

    let mut loosened = base.clone();
    loosened.daily_limit_usd = base.daily_limit_usd.saturating_add(1);
    let diff = diff_policy_config(&base, &loosened);
    assert_ne!(diff.loosened_bitmap & (1u128 << FIELD_DAILY_LIMIT), 0);
    assert_ne!(diff.high_impact_bitmap & (1u128 << FIELD_DAILY_LIMIT), 0);
    assert_ne!(
        policy_config_hash(b"policy:a"),
        policy_config_hash(b"policy:b")
    );
}

#[test]
fn budget_envelopes_apply_scope_limits_and_reset_by_day() {
    let mut tx = base_tx();
    tx.target_chain = Chain::Solana;
    tx.amount_usd = 150;
    tx.current_timestamp = 86_400 * 3;

    let stale_envelope = BudgetEnvelope {
        scope: BudgetEnvelopeScope::Chain {
            chain: Chain::Solana,
        },
        daily_limit_usd: 200,
        weekly_limit_usd: 600,
        spent_today_usd: 190,
        spent_week_usd: 400,
        last_reset_day: 2,
    };
    assert!(stale_envelope.check(&tx).is_ok());

    let active_envelope = BudgetEnvelope {
        last_reset_day: 3,
        ..stale_envelope
    };
    assert_eq!(
        active_envelope.check(&tx),
        Err(ViolationCode::BudgetEnvelopeDailyLimit)
    );

    let config = PolicyConfig {
        budget_envelopes: BudgetEnvelopeSet {
            envelopes: vec![active_envelope],
        },
        ..PolicyConfig::default()
    };
    let decision = evaluate_transaction(&config, &PolicyState::default(), &tx.into());
    assert_eq!(decision.violation, ViolationCode::BudgetEnvelopeDailyLimit);
}

#[test]
fn budget_envelopes_enforce_weekly_limits_and_ignore_non_matching_scopes() {
    let mut tx = base_tx();
    tx.protocol_id = Some(2);
    tx.amount_usd = 125;
    tx.current_timestamp = 86_400 * 4;

    let mut envelope = BudgetEnvelope {
        scope: BudgetEnvelopeScope::Protocol { protocol_id: 9 },
        daily_limit_usd: 200,
        weekly_limit_usd: 300,
        spent_today_usd: 199,
        spent_week_usd: 299,
        last_reset_day: 4,
    };
    envelope
        .check(&tx)
        .expect("non-matching protocol does not spend this envelope");
    envelope.record_spend(&tx);
    assert_eq!(envelope.spent_today_usd, 199);
    assert_eq!(envelope.spent_week_usd, 299);

    tx.protocol_id = Some(9);
    assert_eq!(
        envelope.check(&tx),
        Err(ViolationCode::BudgetEnvelopeDailyLimit)
    );

    let weekly_only = BudgetEnvelope {
        daily_limit_usd: 500,
        spent_today_usd: 0,
        ..envelope
    };
    assert_eq!(
        weekly_only.check(&tx),
        Err(ViolationCode::BudgetEnvelopeWeeklyLimit)
    );

    let mut stale = BudgetEnvelope {
        last_reset_day: -3,
        ..weekly_only
    };
    stale
        .check(&tx)
        .expect("daily and weekly spend reset after a full week");
    stale.record_spend(&tx);
    assert_eq!(stale.spent_today_usd, 125);
    assert_eq!(stale.spent_week_usd, 125);
    assert_eq!(stale.last_reset_day, 4);
}

#[test]
fn budget_envelope_category_scope_records_only_matching_types() {
    let mut tx = base_tx();
    tx.amount_usd = 75;
    tx.tx_type = TransactionType::Transfer;
    tx.current_timestamp = 86_400 * 8;

    let mut envelope = BudgetEnvelope {
        scope: BudgetEnvelopeScope::Category {
            tx_type_code: TransactionType::DeFiSwap as u8,
        },
        daily_limit_usd: 100,
        weekly_limit_usd: 150,
        spent_today_usd: 90,
        spent_week_usd: 140,
        last_reset_day: 8,
    };

    envelope
        .check(&tx)
        .expect("transfer should not match DeFi-swap category envelope");
    envelope.record_spend(&tx);
    assert_eq!(envelope.spent_today_usd, 90);
    assert_eq!(envelope.spent_week_usd, 140);

    tx.tx_type = TransactionType::DeFiSwap;
    assert_eq!(
        envelope.check(&tx),
        Err(ViolationCode::BudgetEnvelopeDailyLimit)
    );
}

#[test]
fn approval_ladder_denies_or_escalates_by_amount_and_risk() {
    let ladder = ApprovalLadder {
        guardian_above_usd: 100,
        multisig_above_usd: 500,
        timelock_above_usd: 900,
        deny_above_usd: 1_200,
        risk_guardian_bps: 2_500,
        risk_multisig_bps: 5_000,
        risk_timelock_bps: 7_500,
        timelock_secs: 60,
    };

    assert_eq!(
        required_approval_level(&ladder, 950, 0),
        ApprovalLevel::Timelock
    );
    assert_eq!(
        required_approval_level(&ladder, 1_500, 0),
        ApprovalLevel::Deny
    );

    let config = PolicyConfig {
        approval_ladder: Some(ladder),
        per_tx_limit_usd: 2_000,
        daily_limit_usd: 5_000,
        daytime_hourly_limit_usd: 5_000,
        nighttime_hourly_limit_usd: 5_000,
        velocity_limit_usd: 5_000,
        ..PolicyConfig::default()
    };
    let mut tx = base_tx();
    tx.amount_usd = 1_500;
    let decision = evaluate_transaction(&config, &PolicyState::default(), &tx.into());
    assert_eq!(decision.violation, ViolationCode::ApprovalLadderDenied);
}

#[test]
fn approval_ladder_threshold_edges_are_inclusive() {
    let ladder = ApprovalLadder {
        guardian_above_usd: 100,
        multisig_above_usd: 500,
        timelock_above_usd: 900,
        deny_above_usd: 1_200,
        risk_guardian_bps: 2_500,
        risk_multisig_bps: 5_000,
        risk_timelock_bps: 7_500,
        timelock_secs: 60,
    };

    assert_eq!(
        required_approval_level(&ladder, 99, 2_499),
        ApprovalLevel::None
    );
    assert_eq!(
        required_approval_level(&ladder, 100, 0),
        ApprovalLevel::Guardian
    );
    assert_eq!(
        required_approval_level(&ladder, 0, 2_500),
        ApprovalLevel::Guardian
    );
    assert_eq!(
        required_approval_level(&ladder, 500, 0),
        ApprovalLevel::Multisig
    );
    assert_eq!(
        required_approval_level(&ladder, 0, 5_000),
        ApprovalLevel::Multisig
    );
    assert_eq!(
        required_approval_level(&ladder, 900, 0),
        ApprovalLevel::Timelock
    );
    assert_eq!(
        required_approval_level(&ladder, 0, 7_500),
        ApprovalLevel::Timelock
    );
    assert_eq!(
        required_approval_level(&ladder, 1_200, 10_000),
        ApprovalLevel::Deny
    );
}

#[test]
fn scoped_pause_blocks_matching_transactions_only() {
    let mut controls = ScopedPauseControls::default();
    controls.entries.push(ScopedPauseEntry {
        scope: PauseScope::Chain {
            chain: Chain::Solana,
        },
        paused_by: "operator".to_string(),
        paused_at: 1,
        expires_at: Some(1_000),
    });

    let mut tx = base_tx();
    tx.target_chain = Chain::Solana;
    tx.current_timestamp = 10;
    assert!(controls.transaction_paused(&tx));

    tx.target_chain = Chain::Ethereum;
    assert!(!controls.transaction_paused(&tx));
}

#[test]
fn scoped_pause_expiry_and_dependency_scopes_are_precise() {
    let mut controls = ScopedPauseControls::default();
    controls.entries.push(ScopedPauseEntry {
        scope: PauseScope::Recipient {
            recipient: "0xrecipient".to_string(),
        },
        paused_by: "operator".to_string(),
        paused_at: 1,
        expires_at: Some(20),
    });
    controls.entries.push(ScopedPauseEntry {
        scope: PauseScope::DWalletFinalization,
        paused_by: "operator".to_string(),
        paused_at: 1,
        expires_at: None,
    });

    let mut tx = base_tx();
    tx.current_timestamp = 19;
    tx.recipient_or_contract = Some("0xrecipient".to_string());
    assert!(controls.transaction_paused(&tx));

    tx.current_timestamp = 20;
    assert!(!controls.transaction_paused(&tx));
    assert!(controls.dependency_paused(PauseScope::DWalletFinalization, 20));
    assert!(!controls.transaction_paused(&base_tx()));
}

#[test]
fn external_liveness_uses_max_staleness_boundary() {
    assert!(is_fresh(100, 10, 110));
    assert!(!is_fresh(100, 10, 111));
    assert!(!is_fresh(0, 10, 1));
}

#[test]
fn batch_policy_reports_empty_oversized_and_successful_batches() {
    let config = PolicyConfig {
        per_tx_limit_usd: 1_000,
        daily_limit_usd: 5_000,
        daytime_hourly_limit_usd: 5_000,
        nighttime_hourly_limit_usd: 5_000,
        velocity_limit_usd: 5_000,
        ..PolicyConfig::default()
    };
    let empty = evaluate_batch_policy(&config, &PolicyState::default(), &[], 1);
    assert_eq!(empty.violation, ViolationCode::EmptyBatch);

    let item = BatchProposalItem {
        amount_usd: 100,
        chain: Chain::Ethereum,
        tx_type: TransactionType::Transfer,
        recipient_or_contract: "0xrecipient".to_string(),
        protocol_id: None,
    };
    let items = vec![item.clone(); 2];
    let decision = evaluate_batch_policy(&config, &PolicyState::default(), &items, 1);
    assert!(decision.approved);
    assert_eq!(decision.item_count, 2);
    assert_eq!(decision.next_state.spent_today_usd, 200);

    let oversized = vec![item.clone(); 9];
    let decision = evaluate_batch_policy(&config, &PolicyState::default(), &oversized, 1);
    assert_eq!(decision.violation, ViolationCode::BatchTooLarge);

    let aggregate_over_limit = vec![
        BatchProposalItem {
            amount_usd: 3_000,
            ..item.clone()
        },
        BatchProposalItem {
            amount_usd: 3_000,
            ..item.clone()
        },
    ];
    let decision =
        evaluate_batch_policy(&config, &PolicyState::default(), &aggregate_over_limit, 1);
    assert_eq!(decision.violation, ViolationCode::DailyLimit);
    assert_eq!(decision.aggregate_amount_usd, 6_000);
}

#[test]
fn batch_policy_stops_on_item_failure_after_threading_state() {
    let config = PolicyConfig {
        per_tx_limit_usd: 250,
        daily_limit_usd: 5_000,
        daytime_hourly_limit_usd: 5_000,
        nighttime_hourly_limit_usd: 5_000,
        velocity_limit_usd: 5_000,
        ..PolicyConfig::default()
    };
    let item = BatchProposalItem {
        amount_usd: 200,
        chain: Chain::Ethereum,
        tx_type: TransactionType::Transfer,
        recipient_or_contract: "0xrecipient".to_string(),
        protocol_id: None,
    };
    let items = vec![
        item.clone(),
        BatchProposalItem {
            amount_usd: 300,
            ..item
        },
    ];

    let decision = evaluate_batch_policy(&config, &PolicyState::default(), &items, 1);
    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::PerTransactionLimit);
    assert_eq!(
        decision.item_violations,
        vec![ViolationCode::None, ViolationCode::PerTransactionLimit]
    );
    assert_eq!(decision.next_state.spent_today_usd, 200);
}

#[test]
fn exposure_groups_and_hash_helpers_are_deterministic() {
    let mut exposure = ExposureGroupState {
        group_id: [7; 16],
        daily_limit_usd: 1_000,
        spent_today_usd: 900,
        last_reset_day: 1,
    };
    assert!(exposure.available_for(100));
    assert!(!exposure.available_for(101));
    exposure.record_spend(100);
    assert_eq!(exposure.spent_today_usd, 1_000);

    let hash_a = policy_config_hash(b"policy");
    let hash_b = policy_config_hash(b"policy");
    assert_eq!(hash_a, hash_b);
    assert_ne!(
        confidential_commitment(b"input", b"secret"),
        confidential_commitment(b"output", b"secret")
    );
}
