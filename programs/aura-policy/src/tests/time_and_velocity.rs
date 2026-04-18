use crate::{
    config::PolicyConfig,
    context::{PolicyEvaluationContext, TransactionContext},
    engine::{evaluate_transaction, evaluate_transaction_simple},
    helpers::{active_hourly_limit, normalize_state, push_recent_amount},
    state::PolicyState,
    types::{Chain, TransactionType},
    violations::ViolationCode,
};

use super::engine_rules::base_tx;

// active_hourly_limit

#[test]
fn daytime_limit_applies_during_business_hours() {
    let config = PolicyConfig {
        daytime_hourly_limit_usd: 2_500,
        nighttime_hourly_limit_usd: 500,
        ..PolicyConfig::default()
    };

    // 10:00 UTC = 36_000 seconds into the day
    let midday = 10 * 3_600;
    assert_eq!(active_hourly_limit(&config, midday), 2_500);

    // 14:00 UTC
    let afternoon = 14 * 3_600;
    assert_eq!(active_hourly_limit(&config, afternoon), 2_500);
}

#[test]
fn nighttime_limit_applies_after_22_utc() {
    let config = PolicyConfig {
        daytime_hourly_limit_usd: 2_500,
        nighttime_hourly_limit_usd: 500,
        ..PolicyConfig::default()
    };

    // 22:00 UTC = 79_200 seconds
    let night_start = 22 * 3_600;
    assert_eq!(active_hourly_limit(&config, night_start), 500);

    // 23:59 UTC
    let late_night = 23 * 3_600 + 59 * 60;
    assert_eq!(active_hourly_limit(&config, late_night), 500);
}

#[test]
fn nighttime_limit_applies_before_7_utc() {
    let config = PolicyConfig {
        daytime_hourly_limit_usd: 2_500,
        nighttime_hourly_limit_usd: 500,
        ..PolicyConfig::default()
    };

    // 00:00 UTC
    assert_eq!(active_hourly_limit(&config, 0), 500);

    // 06:00 UTC
    let early_morning = 6 * 3_600;
    assert_eq!(active_hourly_limit(&config, early_morning), 500);
}

#[test]
fn hourly_limit_wraps_correctly_across_day_boundary() {
    let config = PolicyConfig {
        daytime_hourly_limit_usd: 2_500,
        nighttime_hourly_limit_usd: 500,
        ..PolicyConfig::default()
    };

    // timestamp = 86_400 * 5 + 10 * 3_600 (day 5, 10:00 UTC)
    let multi_day = 86_400 * 5 + 10 * 3_600;
    assert_eq!(active_hourly_limit(&config, multi_day), 2_500);

    // timestamp = 86_400 * 5 + 23 * 3_600 (day 5, 23:00 UTC)
    let multi_day_night = 86_400 * 5 + 23 * 3_600;
    assert_eq!(active_hourly_limit(&config, multi_day_night), 500);
}

#[test]
fn transaction_denied_when_nighttime_hourly_limit_exceeded() {
    let config = PolicyConfig {
        daytime_hourly_limit_usd: 2_500,
        nighttime_hourly_limit_usd: 500,
        ..PolicyConfig::default()
    };

    let mut tx = base_tx();
    tx.amount_usd = 600;
    tx.current_timestamp = 23 * 3_600; // 23:00 UTC — nighttime

    let decision = evaluate_transaction(
        &config,
        &PolicyState::default(),
        &PolicyEvaluationContext::from(tx),
    );

    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::TimeWindowLimit);
}

#[test]
fn transaction_approved_within_daytime_hourly_limit() {
    let config = PolicyConfig {
        daytime_hourly_limit_usd: 2_500,
        nighttime_hourly_limit_usd: 500,
        ..PolicyConfig::default()
    };

    let mut tx = base_tx();
    tx.amount_usd = 600;
    tx.current_timestamp = 12 * 3_600; // noon UTC — daytime

    let decision = evaluate_transaction(
        &config,
        &PolicyState::default(),
        &PolicyEvaluationContext::from(tx),
    );

    assert!(decision.approved);
}

#[test]
fn hourly_bucket_resets_after_one_hour() {
    let state = PolicyState {
        hourly_spent_usd: 400,
        hourly_bucket_started_at: 1_000,
        spent_today_usd: 400,
        last_reset_timestamp: 1_000,
        recent_amounts: vec![400],
    };

    // 3_601 seconds after bucket started — should reset
    let normalized = normalize_state(&state, 1_000 + 3_601);
    assert_eq!(normalized.hourly_spent_usd, 0);
    assert_eq!(normalized.hourly_bucket_started_at, 1_000 + 3_601);
}

// Velocity limit

#[test]
fn velocity_limit_blocks_when_recent_amounts_exceed_threshold() {
    let config = PolicyConfig {
        velocity_limit_usd: 1_000,
        ..PolicyConfig::default()
    };

    let state = PolicyState {
        recent_amounts: vec![300, 300, 300], // total = 900
        ..PolicyState::default()
    };

    let mut tx = base_tx();
    tx.amount_usd = 200; // 900 + 200 = 1_100 > 1_000

    let decision = evaluate_transaction(&config, &state, &PolicyEvaluationContext::from(tx));

    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::VelocityLimit);
}

#[test]
fn velocity_limit_approves_when_within_threshold() {
    let config = PolicyConfig {
        velocity_limit_usd: 1_000,
        ..PolicyConfig::default()
    };

    let state = PolicyState {
        recent_amounts: vec![200, 200, 200], // total = 600
        ..PolicyState::default()
    };

    let mut tx = base_tx();
    tx.amount_usd = 300; // 600 + 300 = 900 <= 1_000

    let decision = evaluate_transaction(&config, &state, &PolicyEvaluationContext::from(tx));

    assert!(decision.approved);
}

#[test]
fn push_recent_amount_caps_at_ten_entries() {
    let mut state = PolicyState {
        recent_amounts: vec![10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
        ..PolicyState::default()
    };

    push_recent_amount(&mut state, 999);

    assert_eq!(state.recent_amounts.len(), 10);
    assert_eq!(*state.recent_amounts.last().unwrap(), 999);
    // oldest entry (10) should be evicted
    assert!(!state.recent_amounts.contains(&10));
}

#[test]
fn push_recent_amount_grows_up_to_ten() {
    let mut state = PolicyState::default();

    for i in 1..=10u64 {
        push_recent_amount(&mut state, i * 100);
    }

    assert_eq!(state.recent_amounts.len(), 10);
    assert_eq!(state.recent_amounts[0], 100);
    assert_eq!(state.recent_amounts[9], 1_000);
}

#[test]
fn approved_transaction_appends_to_recent_amounts() {
    let config = PolicyConfig::default();
    let state = PolicyState::default();

    let mut tx = base_tx();
    tx.amount_usd = 300;

    let decision = evaluate_transaction(&config, &state, &PolicyEvaluationContext::from(tx));

    assert!(decision.approved);
    assert!(decision.next_state.recent_amounts.contains(&300));
}

// evaluate_transaction_simple

#[test]
fn evaluate_transaction_simple_approves_within_limits() {
    let config = PolicyConfig::default();
    let state = PolicyState::default();

    let tx = TransactionContext {
        amount_usd: 500,
        target_chain: Chain::Ethereum,
        tx_type: TransactionType::Transfer,
        protocol_id: None,
        current_timestamp: 43_200,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
    };

    let decision = evaluate_transaction_simple(&config, &state, tx);

    assert!(decision.approved);
    assert_eq!(decision.violation, ViolationCode::None);
    assert_eq!(decision.next_state.spent_today_usd, 500);
}

#[test]
fn evaluate_transaction_simple_denies_above_per_tx_limit() {
    let config = PolicyConfig::default(); // per_tx_limit = 1_000
    let state = PolicyState::default();

    let tx = TransactionContext {
        amount_usd: 1_500,
        target_chain: Chain::Ethereum,
        tx_type: TransactionType::Transfer,
        protocol_id: None,
        current_timestamp: 43_200,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
    };

    let decision = evaluate_transaction_simple(&config, &state, tx);

    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::PerTransactionLimit);
}

#[test]
fn evaluate_transaction_simple_matches_evaluate_transaction() {
    let config = PolicyConfig::default();
    let state = PolicyState::default();
    let tx = base_tx();

    let simple = evaluate_transaction_simple(&config, &state, tx.clone());
    let full = evaluate_transaction(&config, &state, &PolicyEvaluationContext::from(tx));

    assert_eq!(simple.approved, full.approved);
    assert_eq!(simple.violation, full.violation);
    assert_eq!(
        simple.next_state.spent_today_usd,
        full.next_state.spent_today_usd
    );
}
