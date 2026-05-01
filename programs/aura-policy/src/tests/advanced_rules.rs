use crate::{
    config::{AnomalyAction, AnomalyConfig, PolicyConfig, RecipientLimit},
    context::{PolicyEvaluationContext, TransactionContext},
    engine::{
        evaluate_batch, evaluate_transaction, REG_FLAG_CROSS_BORDER, REG_FLAG_CTR_THRESHOLD,
        REG_FLAG_HIGH_RISK_COUNTERPARTY, REG_FLAG_REQUIRES_KYC,
    },
    graphs::{advanced_policy_graph, batch_policy_graph, transaction_policy_graph},
    state::PolicyState,
    types::{Chain, TransactionType},
    violations::ViolationCode,
};

use super::engine_rules::base_tx;

#[test]
fn reputation_policy_scales_the_daily_limit() {
    let config = PolicyConfig {
        per_tx_limit_usd: 3_000,
        ..PolicyConfig::default()
    };
    let state = PolicyState {
        spent_today_usd: 10_200,
        last_reset_timestamp: 10,
        hourly_spent_usd: 0,
        hourly_bucket_started_at: 43_200,
        recent_amounts: Vec::new(),
        ..PolicyState::default()
    };
    // Score 90 → high tier → 150% of base 10_000 = 15_000 effective limit.
    // spent_today is 10_200, so 10_200 + 2_000 = 12_200 ≤ 15_000 → approved.
    let mut tx = base_tx();
    tx.amount_usd = 2_000;

    let decision = evaluate_transaction(
        &config,
        &state,
        &PolicyEvaluationContext {
            transaction: tx,
            reputation_score: Some(90),
            shared_spent_usd: None,
        },
    );

    assert!(decision.approved);
    assert_eq!(decision.effective_daily_limit_usd, 15_000);
}

#[test]
fn rolling_weekly_and_monthly_limits_block_projected_spend() {
    let mut state = PolicyState::default();
    state.daily_buckets = [100, 100, 100, 100, 100, 100, 100];
    state.thirty_day_spent_usd = 900;
    let config = PolicyConfig {
        weekly_limit_usd: Some(750),
        monthly_limit_usd: Some(1_200),
        ..PolicyConfig::default()
    };
    let mut tx = base_tx();
    tx.amount_usd = 100;

    let decision = evaluate_transaction(&config, &state, &PolicyEvaluationContext::from(tx));

    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::WeeklyLimit);

    let config = PolicyConfig {
        weekly_limit_usd: Some(1_000),
        monthly_limit_usd: Some(950),
        ..PolicyConfig::default()
    };
    let mut tx = base_tx();
    tx.amount_usd = 100;
    let decision = evaluate_transaction(&config, &state, &PolicyEvaluationContext::from(tx));

    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::MonthlyLimit);
}

#[test]
fn recipient_limits_and_risk_metadata_are_enforced() {
    let recipient = "0xBRIDGE".to_string();
    let config = PolicyConfig {
        recipient_limits: vec![RecipientLimit {
            chain: Chain::Ethereum,
            address: recipient.clone(),
            daily_limit_usd: 600,
            per_tx_limit_usd: Some(400),
        }],
        ..PolicyConfig::default()
    };
    let mut tx = base_tx();
    tx.recipient_or_contract = Some(recipient.clone());
    tx.amount_usd = 450;

    let decision = evaluate_transaction(
        &config,
        &PolicyState::default(),
        &PolicyEvaluationContext::from(tx),
    );

    assert!(!decision.approved);
    assert_eq!(
        decision.violation,
        ViolationCode::RecipientPerTransactionLimit
    );
    assert!(decision.risk_score > 0);

    let mut tx = base_tx();
    tx.recipient_or_contract = Some(recipient);
    tx.amount_usd = 300;
    let decision = evaluate_transaction(
        &config,
        &PolicyState::default(),
        &PolicyEvaluationContext::from(tx),
    );

    assert!(decision.approved);
    assert_eq!(decision.next_state.recipient_spend.len(), 1);
}

#[test]
fn anomaly_detection_can_deny_outliers() {
    let config = PolicyConfig {
        anomaly_config: Some(AnomalyConfig {
            enabled: true,
            z_score_threshold_bps: 30_000,
            min_sample_size: 4,
            action: AnomalyAction::Deny,
        }),
        per_tx_limit_usd: 10_000,
        ..PolicyConfig::default()
    };
    let state = PolicyState {
        recent_amounts: vec![100, 105, 95, 100, 102],
        ..PolicyState::default()
    };
    let mut tx = base_tx();
    tx.amount_usd = 2_000;

    let decision = evaluate_transaction(&config, &state, &PolicyEvaluationContext::from(tx));

    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::AnomalyDetected);
    assert!(decision
        .risk_factors
        .iter()
        .any(|factor| factor.name == "anomaly_detection"));
}

#[test]
fn composite_risk_score_and_regulatory_flags_are_reported() {
    let mut tx = base_tx();
    tx.amount_usd = 10_000;
    tx.target_chain = Chain::Ethereum;
    tx.counterparty_risk_score = Some(80);

    let decision = evaluate_transaction(
        &PolicyConfig {
            daily_limit_usd: 25_000,
            per_tx_limit_usd: 20_000,
            daytime_hourly_limit_usd: 20_000,
            nighttime_hourly_limit_usd: 20_000,
            velocity_limit_usd: 20_000,
            max_counterparty_risk_score: Some(90),
            ..PolicyConfig::default()
        },
        &PolicyState::default(),
        &PolicyEvaluationContext::from(tx),
    );

    assert!(decision.approved);
    assert!(decision.risk_score > 0);
    assert!(decision
        .risk_factors
        .iter()
        .any(|factor| factor.name == "counterparty_risk"));
    assert_eq!(
        decision.regulatory_flags
            & (REG_FLAG_CTR_THRESHOLD
                | REG_FLAG_CROSS_BORDER
                | REG_FLAG_HIGH_RISK_COUNTERPARTY
                | REG_FLAG_REQUIRES_KYC),
        REG_FLAG_CTR_THRESHOLD
            | REG_FLAG_CROSS_BORDER
            | REG_FLAG_HIGH_RISK_COUNTERPARTY
            | REG_FLAG_REQUIRES_KYC
    );
}

#[test]
fn shared_pool_limit_blocks_swarm_overspend() {
    let config = PolicyConfig {
        shared_pool_limit_usd: Some(3_000),
        ..PolicyConfig::default()
    };
    let mut tx = base_tx();
    tx.amount_usd = 600;

    // shared_spent_usd is 2_700; adding 600 = 3_300 > 3_000 pool limit.
    let decision = evaluate_transaction(
        &config,
        &PolicyState::default(),
        &PolicyEvaluationContext {
            transaction: tx,
            reputation_score: None,
            shared_spent_usd: Some(2_700),
        },
    );

    assert!(!decision.approved);
    assert_eq!(decision.violation, ViolationCode::SharedPoolLimit);
}

#[test]
fn batch_evaluation_carries_policy_state_forward() {
    let txs = vec![
        PolicyEvaluationContext::from(base_tx()),
        PolicyEvaluationContext::from(TransactionContext {
            amount_usd: 4_800,
            target_chain: Chain::Ethereum,
            tx_type: TransactionType::Transfer,
            protocol_id: None,
            current_timestamp: 43_500,
            expected_output_usd: None,
            actual_output_usd: None,
            quote_age_secs: None,
            counterparty_risk_score: None,
            recipient_or_contract: Some("0xrecipient".to_string()),
        }),
    ];

    let decisions = evaluate_batch(&PolicyConfig::default(), &PolicyState::default(), &txs);

    assert_eq!(decisions.len(), 2);
    assert!(decisions[0].approved);
    assert!(!decisions[1].approved);
    assert_eq!(decisions[1].violation, ViolationCode::PerTransactionLimit);
}

#[test]
fn policy_graph_specs_expose_expected_metadata() {
    let transaction = transaction_policy_graph();
    let advanced = advanced_policy_graph();
    let batch = batch_policy_graph();

    assert_eq!(transaction.name, "evaluate_agent_transaction");
    assert!(advanced.requires_decryption);
    assert!(batch.uses_update_mode);
}
