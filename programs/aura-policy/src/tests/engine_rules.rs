use crate::{
    config::PolicyConfig,
    context::{PolicyEvaluationContext, TransactionContext},
    engine::evaluate_transaction,
    state::PolicyState,
    types::{Chain, TransactionType},
    violations::ViolationCode,
};

/// Builds a standard approved transaction used as a baseline across engine tests.
/// Amount 500, Ethereum, DeFiSwap, protocol 1, noon UTC, within all default limits.
pub fn base_tx() -> TransactionContext {
    TransactionContext {
        amount_usd: 500,
        target_chain: Chain::Ethereum,
        tx_type: TransactionType::DeFiSwap,
        protocol_id: Some(1),
        current_timestamp: 43_200,
        expected_output_usd: Some(500),
        actual_output_usd: Some(498),
        quote_age_secs: Some(60),
        counterparty_risk_score: Some(20),
    }
}

#[test]
fn approves_transaction_within_limits() {
    let decision = evaluate_transaction(
        &PolicyConfig::default(),
        &PolicyState::default(),
        &PolicyEvaluationContext::from(base_tx()),
    );

    assert!(decision.approved);
    assert_eq!(decision.violation, ViolationCode::None);
    assert_eq!(decision.next_state.spent_today_usd, 500);
    assert!(decision.trace.iter().all(|outcome| outcome.passed));
}

#[test]
fn denies_transaction_above_per_tx_limit() {
    let mut tx = base_tx();
    tx.amount_usd = 2_001;

    let decision = evaluate_transaction(
        &PolicyConfig::default(),
        &PolicyState::default(),
        &PolicyEvaluationContext::from(tx),
    );

    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::PerTransactionLimit);
}

#[test]
fn resets_daily_state_after_twenty_four_hours() {
    let state = PolicyState {
        spent_today_usd: 9_500,
        last_reset_timestamp: 10,
        hourly_spent_usd: 400,
        hourly_bucket_started_at: 10,
        recent_amounts: vec![400, 250],
    };
    let mut tx = base_tx();
    tx.amount_usd = 900;
    tx.current_timestamp = 129_600;

    let decision = evaluate_transaction(
        &PolicyConfig::default(),
        &state,
        &PolicyEvaluationContext::from(tx),
    );

    assert!(decision.approved);
    assert_eq!(decision.next_state.spent_today_usd, 900);
}

#[test]
fn denies_unapproved_protocols_and_bad_slippage() {
    let config = PolicyConfig {
        allowed_protocol_bitmap: 0b0010,
        max_slippage_bps: 25,
        ..PolicyConfig::default()
    };
    let mut tx = base_tx();
    tx.protocol_id = Some(4);
    tx.actual_output_usd = Some(450);

    let decision = evaluate_transaction(
        &config,
        &PolicyState::default(),
        &PolicyEvaluationContext::from(tx),
    );
    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::ProtocolNotAllowed);

    let mut tx = base_tx();
    tx.protocol_id = Some(1);
    tx.actual_output_usd = Some(450);

    let decision = evaluate_transaction(
        &config,
        &PolicyState::default(),
        &PolicyEvaluationContext::from(tx),
    );
    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::SlippageExceeded);
}

#[test]
fn denies_stale_quotes_and_high_risk_counterparties() {
    let config = PolicyConfig {
        max_quote_age_secs: Some(120),
        max_counterparty_risk_score: Some(40),
        ..PolicyConfig::default()
    };

    let mut stale_tx = base_tx();
    stale_tx.quote_age_secs = Some(360);

    let decision = evaluate_transaction(
        &config,
        &PolicyState::default(),
        &PolicyEvaluationContext::from(stale_tx),
    );

    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::QuoteStale);

    let mut risky_tx = base_tx();
    risky_tx.counterparty_risk_score = Some(87);

    let decision = evaluate_transaction(
        &config,
        &PolicyState::default(),
        &PolicyEvaluationContext::from(risky_tx),
    );

    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::CounterpartyRisk);
}
