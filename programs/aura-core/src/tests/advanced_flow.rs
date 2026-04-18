use aura_policy::{Chain, TransactionContext, TransactionType, ViolationCode};

use crate::{
    deny_pending_transaction, evaluate_batch_preview, finalize_signed_pending, propose_transaction,
    AgentReputation, AgentSwarm, EmergencyMultisig, TreasuryError,
};

use super::proposal_flow::{request_signature_for_pending, treasury};

#[test]
fn multisig_override_can_raise_daily_limit() {
    let mut treasury = treasury();
    let mut multisig = EmergencyMultisig {
        required_signatures: 2,
        guardians: vec!["g1".to_string(), "g2".to_string(), "g3".to_string()],
        pending_override: None,
    };

    multisig.propose("g1", 25_000, 1_700_000_000).unwrap();
    multisig.collect_signature("g2").unwrap();
    treasury.attach_multisig(multisig, 1_700_000_000);

    let applied = treasury.apply_ready_override(1_700_000_500).unwrap();

    assert!(applied);
    assert_eq!(treasury.policy_config.daily_limit_usd, 25_000);
}

#[test]
fn swarm_limit_constrains_shared_pool_spend() {
    let mut treasury = treasury();
    let mut swarm = AgentSwarm::new("swarm-01", vec!["agent-02".to_string()], 800);
    swarm.total_swarm_spent_usd = 700; // 700 already spent; adding 200 would exceed the 800 pool limit.
    treasury.attach_swarm(swarm, 1_700_000_000);

    let ai = treasury.ai_authority.clone();
    propose_transaction(
        &mut treasury,
        &ai,
        TransactionContext {
            amount_usd: 200,
            target_chain: Chain::Ethereum,
            tx_type: TransactionType::Transfer,
            protocol_id: None,
            current_timestamp: 43_200,
            expected_output_usd: None,
            actual_output_usd: None,
            quote_age_secs: None,
            counterparty_risk_score: None,
        },
        "0xrecipient",
    )
    .expect("proposal should be stored");

    let receipt =
        deny_pending_transaction(&mut treasury, 43_260).expect("denial should return a receipt");

    assert!(!receipt.approved);
    assert_eq!(receipt.violation, ViolationCode::SharedPoolLimit);
}

#[test]
fn reputation_adjusts_effective_daily_limit() {
    let mut treasury = treasury();
    treasury.policy_config.per_tx_limit_usd = 3_000;
    treasury.policy_state.spent_today_usd = 10_500;
    treasury.policy_state.last_reset_timestamp = 43_200;
    treasury.policy_state.hourly_bucket_started_at = 43_200;
    treasury.reputation = AgentReputation {
        total_transactions: 10,
        successful_transactions: 9,
        failed_transactions: 1,
        total_volume_usd: 40_000,
    };
    // Score = 9/10 * 100 = 90 → high tier → 150% of base 10_000 = 15_000.
    // spent_today is 10_500, so the 2_000 tx fits within the 15_000 effective limit.

    let ai = treasury.ai_authority.clone();
    propose_transaction(
        &mut treasury,
        &ai,
        TransactionContext {
            amount_usd: 2_000,
            target_chain: Chain::Ethereum,
            tx_type: TransactionType::Transfer,
            protocol_id: None,
            current_timestamp: 43_200,
            expected_output_usd: None,
            actual_output_usd: None,
            quote_age_secs: None,
            counterparty_risk_score: None,
        },
        "0xrecipient",
    )
    .expect("proposal should be stored");

    let (message, _) = request_signature_for_pending(&mut treasury, 43_240);
    let receipt = finalize_signed_pending(&mut treasury, message, "ef".repeat(64), 43_260)
        .expect("execution should succeed");

    assert!(receipt.approved);
    assert_eq!(receipt.effective_daily_limit_usd, 15_000);
}

#[test]
fn batch_evaluation_uses_current_stateful_context() {
    let mut treasury = treasury();
    treasury.policy_config.per_tx_limit_usd = 800;
    treasury.policy_config.daily_limit_usd = 1_200;

    let decisions = evaluate_batch_preview(
        &treasury,
        &[
            TransactionContext {
                amount_usd: 700,
                target_chain: Chain::Ethereum,
                tx_type: TransactionType::Transfer,
                protocol_id: None,
                current_timestamp: 43_200,
                expected_output_usd: None,
                actual_output_usd: None,
                quote_age_secs: None,
                counterparty_risk_score: None,
            },
            TransactionContext {
                amount_usd: 700,
                target_chain: Chain::Ethereum,
                tx_type: TransactionType::Transfer,
                protocol_id: None,
                current_timestamp: 43_500,
                expected_output_usd: None,
                actual_output_usd: None,
                quote_age_secs: None,
                counterparty_risk_score: None,
            },
        ],
    );

    assert_eq!(decisions.len(), 2);
    assert!(decisions[0].approved);
    assert!(!decisions[1].approved);
    assert_eq!(decisions[1].violation, ViolationCode::DailyLimit);
}

#[test]
fn duplicate_dwallet_registration_is_rejected() {
    let mut treasury = treasury();

    let result = treasury.register_dwallet(
        Chain::Ethereum,
        "dw-eth-02",
        "0xAURA2",
        10_000,
        1_700_000_500,
    );

    assert!(matches!(
        result,
        Err(TreasuryError::DWalletAlreadyRegistered(Chain::Ethereum))
    ));
}
