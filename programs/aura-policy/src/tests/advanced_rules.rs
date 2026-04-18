use crate::{
    config::PolicyConfig,
    context::{PolicyEvaluationContext, TransactionContext},
    engine::{evaluate_batch, evaluate_transaction},
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
