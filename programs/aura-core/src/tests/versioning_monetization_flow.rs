//! Tests for policy versioning primitives and the monetization control plane.

use anchor_lang::prelude::{borsh, Pubkey};
use aura_policy::{
    diff_policy_config, evaluate_policy_without_spend_mutation, policy_config_hash,
    rule_outcome_bitmap, Chain, PolicyConfig, PolicyEvaluationContext, TransactionContext,
    TransactionType,
};

use crate::{
    finalize_signed_pending,
    program_accounts::{
        snapshot_policy_config, validate_protocol_values, PendingProtocolConfig,
        PolicyCanaryAccount, PolicyConfigRecord, PolicyHistoryAccount, ProtocolConfigAccount,
    },
    propose_transaction,
};

use super::proposal_flow::{request_signature_for_pending, treasury};

fn eval_context(amount_usd: u64) -> (TransactionContext, PolicyEvaluationContext) {
    let tx = TransactionContext {
        amount_usd,
        target_chain: Chain::Ethereum,
        tx_type: TransactionType::Transfer,
        protocol_id: None,
        current_timestamp: 43_200,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
        recipient_or_contract: Some("0xAURA".to_string()),
    };
    let context = PolicyEvaluationContext {
        transaction: tx.clone(),
        reputation_score: Some(0),
        shared_spent_usd: None,
        tier_multiplier_bps: None,
    };
    (tx, context)
}

fn canary_for(
    treasury: Pubkey,
    candidate: PolicyConfigRecord,
    sample_cap: u32,
) -> PolicyCanaryAccount {
    let mut canary = PolicyCanaryAccount {
        bump: 1,
        treasury,
        enabled: false,
        started_at: 0,
        sample_cap: 0,
        candidate: candidate.clone(),
        samples: 0,
        agreements: 0,
        candidate_would_deny: 0,
        candidate_would_allow: 0,
        per_rule_divergence_bitmap: 0,
    };
    canary.arm(candidate, sample_cap, 1_000);
    canary
}

#[test]
fn fee_floor_takes_the_higher_of_treasury_and_protocol() {
    let mut fees = crate::ProtocolFees::default();

    // Owner zeroes their own schedule; the floor is still charged.
    fees.transaction_fee_bps = 0;
    assert_eq!(fees.fee_for_amount_with_floor(10_000, 10), 10);

    // Treasury rate above the floor wins.
    fees.transaction_fee_bps = 50;
    assert_eq!(fees.fee_for_amount_with_floor(10_000, 10), 50);

    // No floor and no rate means no fee.
    fees.transaction_fee_bps = 0;
    assert_eq!(fees.fee_for_amount_with_floor(10_000, 0), 0);
}

#[test]
fn protocol_floor_is_non_bypassable_on_execution() {
    let mut treasury = treasury();
    // Owner has opted out of their own fee entirely.
    treasury.protocol_fees.transaction_fee_bps = 0;
    let ai = treasury.ai_authority.clone();

    propose_transaction(
        &mut treasury,
        &ai,
        TransactionContext {
            amount_usd: 500,
            target_chain: Chain::Ethereum,
            tx_type: TransactionType::DeFiSwap,
            protocol_id: Some(1),
            current_timestamp: 43_200,
            expected_output_usd: Some(500),
            actual_output_usd: Some(497),
            quote_age_secs: Some(45),
            counterparty_risk_score: Some(25),
            recipient_or_contract: Some("0xUNISWAP".to_string()),
        },
        "0xUNISWAP",
    )
    .expect("proposal should succeed");

    let (message, _) = request_signature_for_pending(&mut treasury, 43_260);
    // 2% protocol floor on a $500 transaction is $10 despite the zeroed schedule.
    let receipt = finalize_signed_pending(&mut treasury, message, "ab".repeat(32), 200, 43_261)
        .expect("execution should finalize");
    assert_eq!(receipt.transaction_fee_usd, 10);
}

#[test]
fn snapshot_digest_commits_to_the_full_config() {
    let treasury = treasury();
    let owner = Pubkey::new_unique();
    let mut history = PolicyHistoryAccount {
        bump: 1,
        treasury: Pubkey::new_unique(),
        version_count: 0,
        ring_head: 0,
        snapshots: Vec::new(),
    };
    snapshot_policy_config(&mut history, &treasury.policy_config, owner, 200);
    let recorded = history.snapshots[0].snapshot_digest;

    // The exact recorded configuration hashes to the recorded fingerprint.
    let matching = PolicyConfigRecord::from_domain(&treasury.policy_config);
    assert_eq!(
        policy_config_hash(&borsh::to_vec(&matching).unwrap()),
        recorded
    );

    // Changing a non-headline field (a recipient limit) breaks the match, so
    // the digest is a commitment to the whole config and not just the scalars.
    let mut tampered_config = treasury.policy_config.clone();
    tampered_config
        .recipient_limits
        .push(aura_policy::RecipientLimit {
            chain: Chain::Ethereum,
            address: "0xBEEF".to_string(),
            daily_limit_usd: 1,
            per_tx_limit_usd: None,
        });
    let tampered = PolicyConfigRecord::from_domain(&tampered_config);
    assert_ne!(
        policy_config_hash(&borsh::to_vec(&tampered).unwrap()),
        recorded
    );
}

#[test]
fn diff_flags_loosening_for_rollback_routing() {
    let mut base = PolicyConfig::default();
    base.per_tx_limit_usd = 1_000;
    base.daily_limit_usd = 5_000;

    let mut tighter = base.clone();
    tighter.per_tx_limit_usd = 500;
    // Tightening (or unchanged) yields a non-positive risk delta → applies now.
    assert!(diff_policy_config(&base, &tighter).risk_delta_bps <= 0);

    let mut looser = base.clone();
    looser.per_tx_limit_usd = 2_000;
    // Loosening yields a positive risk delta → routes through the timelock.
    assert!(diff_policy_config(&base, &looser).risk_delta_bps > 0);
}

#[test]
fn canary_tallies_divergence_when_candidate_is_stricter() {
    let treasury = treasury();
    // Default policy approves a modest $500 transfer.
    let lenient = PolicyConfig::default();
    let mut strict = lenient.clone();
    strict.per_tx_limit_usd = 100;

    let (_, context) = eval_context(500);
    let enforced =
        evaluate_policy_without_spend_mutation(&lenient, &treasury.policy_state, &context);
    let candidate =
        evaluate_policy_without_spend_mutation(&strict, &treasury.policy_state, &context);
    assert!(enforced.approved);
    assert!(!candidate.approved);

    let mut canary = canary_for(
        Pubkey::new_unique(),
        PolicyConfigRecord::from_domain(&strict),
        0,
    );
    let divergence = rule_outcome_bitmap(&enforced) ^ rule_outcome_bitmap(&candidate);
    canary.record_sample(enforced.approved, candidate.approved, divergence);

    assert_eq!(canary.samples, 1);
    assert_eq!(canary.candidate_would_deny, 1);
    assert_eq!(canary.candidate_would_allow, 0);
    assert_eq!(canary.agreements, 0);
    assert_ne!(canary.per_rule_divergence_bitmap, 0);
}

#[test]
fn canary_sample_floor_gates_sampling_and_promotion() {
    let mut canary = canary_for(
        Pubkey::new_unique(),
        PolicyConfigRecord::from_domain(&PolicyConfig::default()),
        2,
    );
    assert!(canary.should_sample());
    assert!(!canary.sample_floor_met());

    canary.record_sample(true, true, 0);
    assert!(canary.should_sample());
    assert!(!canary.sample_floor_met());

    canary.record_sample(true, false, 1);
    // Cap reached: sampling stops and promotion is now permitted.
    assert!(!canary.should_sample());
    assert!(canary.sample_floor_met());
    assert_eq!(canary.agreements, 1);
}

#[test]
fn protocol_values_validation_enforces_bounds() {
    // Coherent values pass.
    assert!(validate_protocol_values(500, 10, 20, 0).is_ok());
    // Fee above the protocol cap is rejected.
    assert!(validate_protocol_values(501, 10, 20, 0).is_err());
    // Inverted integrator bounds are rejected.
    assert!(validate_protocol_values(10, 30, 20, 0).is_err());
    // Unknown settlement asset is rejected.
    assert!(validate_protocol_values(10, 10, 20, 9).is_err());
}

#[test]
fn disabled_protocol_config_charges_no_floor() {
    let pending = PendingProtocolConfig {
        protocol_authority: Pubkey::new_unique(),
        protocol_recipient: Pubkey::new_unique(),
        protocol_fee_bps: 25,
        creation_fee_usd: 100,
        min_integrator_bps: 0,
        max_integrator_bps: 50,
        settlement_asset: 0,
        enabled: true,
        executable_after: 0,
    };
    assert!(pending.validate().is_ok());

    let mut config = ProtocolConfigAccount {
        bump: 1,
        protocol_authority: pending.protocol_authority,
        protocol_recipient: pending.protocol_recipient,
        protocol_fee_bps: 25,
        creation_fee_usd: 100,
        min_integrator_bps: 0,
        max_integrator_bps: 50,
        settlement_asset: 0,
        enabled: false,
        updated_at: 0,
        pending: None,
    };
    assert_eq!(config.floor_bps(), 0);
    config.enabled = true;
    assert_eq!(config.floor_bps(), 25);
}
