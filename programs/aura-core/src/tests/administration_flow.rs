//! Tests for account lifecycle completion (domain-level surface).
//!
//! Instruction wrappers that only edit standalone PDAs (operator role, fee
//! recipient, session key, address list, exposure group, swarm pool) are
//! verified by compilation + account constraints; the domain-mutating
//! operations are exercised here through their `AgentTreasury` methods.

use aura_policy::{Chain, TransactionType};

use crate::propose_transaction;

use super::proposal_flow::treasury;

#[test]
fn update_settings_only_changes_supplied_fields() {
    let mut treasury = treasury();
    let original_threshold = treasury.high_risk_threshold;

    treasury
        .update_settings(Some(1_800), None, Some(true), None, 1_000)
        .expect("settings update should succeed");
    assert_eq!(treasury.pending_transaction_ttl_secs, 1_800);
    assert!(treasury.high_risk_require_guardian);
    // untouched fields keep their prior values
    assert_eq!(treasury.high_risk_threshold, original_threshold);
    assert!(!treasury.sanctions_check_enabled);

    treasury
        .update_settings(None, Some(95), None, Some(true), 1_010)
        .expect("partial update should succeed");
    assert_eq!(treasury.high_risk_threshold, 95);
    assert!(treasury.sanctions_check_enabled);
    assert_eq!(treasury.pending_transaction_ttl_secs, 1_800);
}

#[test]
fn update_settings_rejects_non_positive_ttl() {
    let mut treasury = treasury();
    assert!(treasury
        .update_settings(Some(0), None, None, None, 1_000)
        .is_err());
    assert!(treasury
        .update_settings(Some(-5), None, None, None, 1_000)
        .is_err());
}

#[test]
fn recipient_limit_upsert_inserts_then_updates_in_place() {
    let mut treasury = treasury();
    let version_before = treasury.current_policy_version;

    treasury
        .upsert_recipient_limit(
            Chain::Ethereum,
            "0xrecipient".to_string(),
            100,
            Some(50),
            1_000,
        )
        .expect("insert should succeed");
    assert_eq!(treasury.policy_config.recipient_limits.len(), 1);
    assert!(treasury.current_policy_version > version_before);

    // same (chain, address) updates the existing entry rather than appending
    treasury
        .upsert_recipient_limit(Chain::Ethereum, "0xrecipient".to_string(), 250, None, 1_010)
        .expect("update should succeed");
    assert_eq!(treasury.policy_config.recipient_limits.len(), 1);
    let limit = &treasury.policy_config.recipient_limits[0];
    assert_eq!(limit.daily_limit_usd, 250);
    assert_eq!(limit.per_tx_limit_usd, None);
}

#[test]
fn recipient_limit_upsert_validates_input_and_capacity() {
    let mut treasury = treasury();
    assert!(treasury
        .upsert_recipient_limit(Chain::Ethereum, "0xabc".to_string(), 0, None, 1_000)
        .is_err());

    for index in 0..16 {
        treasury
            .upsert_recipient_limit(Chain::Ethereum, format!("0x{index:040x}"), 100, None, 1_000)
            .expect("up to the cap should succeed");
    }
    assert_eq!(treasury.policy_config.recipient_limits.len(), 16);
    assert!(treasury
        .upsert_recipient_limit(Chain::Ethereum, "0xoverflow".to_string(), 100, None, 1_000)
        .is_err());
}

#[test]
fn recipient_limit_remove_reports_presence() {
    let mut treasury = treasury();
    treasury
        .upsert_recipient_limit(Chain::Ethereum, "0xrecipient".to_string(), 100, None, 1_000)
        .expect("insert");

    assert!(treasury.remove_recipient_limit(Chain::Ethereum, "0xrecipient", 1_010));
    assert!(treasury.policy_config.recipient_limits.is_empty());
    // removing a non-existent entry reports false (maps to RecipientLimitNotFound)
    assert!(!treasury.remove_recipient_limit(Chain::Ethereum, "0xrecipient", 1_020));
}

#[test]
fn recipient_per_tx_limit_is_enforced_by_the_evaluator() {
    let mut treasury = treasury();
    treasury
        .upsert_recipient_limit(
            Chain::Ethereum,
            "0xrecipient".to_string(),
            1_000,
            Some(50),
            1_000,
        )
        .expect("insert");

    let ai = treasury.ai_authority.clone();
    let context = aura_policy::TransactionContext {
        amount_usd: 60,
        target_chain: Chain::Ethereum,
        tx_type: TransactionType::Transfer,
        protocol_id: None,
        current_timestamp: 43_200,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
        recipient_or_contract: Some("0xrecipient".to_string()),
    };
    propose_transaction(&mut treasury, &ai, context, "0xrecipient").expect("queued");

    let pending = treasury.pending.as_ref().expect("pending");
    // 60 > the per-recipient per-tx cap of 50 → policy denies even though it is
    // under the global per-tx limit.
    assert!(!pending.decision.approved);
}
