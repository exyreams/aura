use anchor_lang::prelude::Pubkey;
use aura_policy::{Chain, TransactionContext, TransactionType, ViolationCode};

use crate::{
    apply_confidential_policy_result, confirm_pending_decryption, deny_pending_transaction,
    finalize_signed_pending, mark_pending_decryption_request, propose_confidential_transaction,
    propose_confidential_vector_transaction, AuditKind, PendingDecryptionRequest, ProposalStatus,
    TreasuryError,
};

use super::proposal_flow::{request_signature_for_pending, treasury};

/// Configures scalar FHE guardrails (three separate u64 ciphertext accounts).
fn configure_guardrails(treasury: &mut crate::AgentTreasury, now: i64) {
    treasury.configure_confidential_guardrails(
        Pubkey::new_unique().to_string(),
        Pubkey::new_unique().to_string(),
        Pubkey::new_unique().to_string(),
        now,
    );
}

/// Configures vector FHE guardrails (single EUint64Vector ciphertext account).
fn configure_vector_guardrails(treasury: &mut crate::AgentTreasury, now: i64) {
    treasury.configure_confidential_vector_guardrails(Pubkey::new_unique().to_string(), now);
}

/// Submits a confidential scalar proposal that passes the public pre-check
/// (amount 500 is within default limits).
fn propose_approved_confidential(treasury: &mut crate::AgentTreasury, now: i64) -> u64 {
    let ai = treasury.ai_authority.clone();
    propose_confidential_transaction(
        treasury,
        &ai,
        TransactionContext {
            amount_usd: 500,
            target_chain: Chain::Ethereum,
            tx_type: TransactionType::Transfer,
            protocol_id: None,
            current_timestamp: now,
            expected_output_usd: None,
            actual_output_usd: None,
            quote_age_secs: None,
            counterparty_risk_score: None,
        },
        "0xrecipient",
        &Pubkey::new_unique().to_string(),
        &Pubkey::new_unique().to_string(),
    )
    .expect("confidential proposal should succeed")
}

/// Submits a confidential vector proposal using the currently configured
/// guardrail vector ciphertext.
fn propose_approved_confidential_vector(treasury: &mut crate::AgentTreasury, now: i64) -> u64 {
    let ai = treasury.ai_authority.clone();
    let guardrail_vector = treasury
        .confidential_guardrails
        .as_ref()
        .and_then(|guardrails| guardrails.guardrail_vector_ciphertext.clone())
        .expect("guardrail vector should be configured");
    propose_confidential_vector_transaction(
        treasury,
        &ai,
        TransactionContext {
            amount_usd: 500,
            target_chain: Chain::Ethereum,
            tx_type: TransactionType::Transfer,
            protocol_id: None,
            current_timestamp: now,
            expected_output_usd: None,
            actual_output_usd: None,
            quote_age_secs: None,
            counterparty_risk_score: None,
        },
        "0xrecipient",
        &guardrail_vector,
        &Pubkey::new_unique().to_string(),
        &Pubkey::new_unique().to_string(),
    )
    .expect("vector confidential proposal should succeed")
}

/// Records a decryption request and immediately confirms it with a synthetic
/// plaintext digest, simulating the Encrypt network completing decryption.
fn mark_and_confirm_decryption(
    treasury: &mut crate::AgentTreasury,
    request_account: &str,
    now: i64,
) {
    let ciphertext_account = treasury
        .pending
        .as_ref()
        .and_then(|pending| pending.policy_output_ciphertext_account.clone())
        .expect("pending ciphertext account");
    mark_pending_decryption_request(
        treasury,
        PendingDecryptionRequest {
            ciphertext_account,
            request_account: request_account.to_string(),
            expected_digest: hex::encode([0x77u8; 32]),
            requested_at: now,
            verified_at: None,
            plaintext_sha256: None,
        },
        now,
    )
    .expect("decryption request should be stored");
    confirm_pending_decryption(
        treasury,
        request_account,
        hex::encode([0x88u8; 32]),
        now + 1,
    )
    .expect("decryption should verify");
}

#[test]
fn confidential_guardrail_configuration_records_dedicated_audit_event() {
    let mut treasury = treasury();
    configure_guardrails(&mut treasury, 1_700_000_100);

    let last = treasury
        .audit_trail
        .events()
        .last()
        .expect("audit event should be recorded");

    assert_eq!(last.kind, AuditKind::ConfidentialGuardrailsConfigured);
    assert_eq!(last.detail, "confidential guardrails configured");
}

#[test]
fn confidential_execution_requires_verified_decryption_before_finalize() {
    let mut treasury = treasury();
    configure_guardrails(&mut treasury, 1_700_000_100);
    let proposal_id = propose_approved_confidential(&mut treasury, 43_200);

    let ciphertext_account = treasury
        .pending
        .as_ref()
        .and_then(|pending| pending.policy_output_ciphertext_account.clone())
        .expect("pending ciphertext account");
    mark_pending_decryption_request(
        &mut treasury,
        PendingDecryptionRequest {
            ciphertext_account,
            request_account: Pubkey::new_unique().to_string(),
            expected_digest: hex::encode([0x11u8; 32]),
            requested_at: 43_210,
            verified_at: None,
            plaintext_sha256: None,
        },
        43_210,
    )
    .expect("decryption request should be stored");
    apply_confidential_policy_result(&mut treasury, 0, None, 43_211)
        .expect("approved confidential result should apply");

    let (message, _) = request_signature_for_pending(&mut treasury, 43_220);
    let result = finalize_signed_pending(&mut treasury, message, "ab".repeat(64), 43_221);

    assert!(matches!(result, Err(TreasuryError::DecryptionNotReady)));
    assert_eq!(
        treasury.pending.as_ref().map(|pending| pending.proposal_id),
        Some(proposal_id)
    );
}

#[test]
fn confidential_approved_flow_finalizes_after_verified_decryption() {
    let mut treasury = treasury();
    configure_guardrails(&mut treasury, 1_700_000_100);
    let proposal_id = propose_approved_confidential(&mut treasury, 43_200);

    let request_account = Pubkey::new_unique().to_string();
    mark_and_confirm_decryption(&mut treasury, &request_account, 43_210);
    apply_confidential_policy_result(&mut treasury, 0, None, 43_212)
        .expect("approved confidential result should apply");
    assert_eq!(
        treasury
            .pending
            .as_ref()
            .map(|pending| pending.decision.next_state.spent_today_usd),
        Some(500)
    );

    let (message, digest) = request_signature_for_pending(&mut treasury, 43_220);
    let receipt = finalize_signed_pending(&mut treasury, message.clone(), "cd".repeat(64), 43_221)
        .expect("execution should finalize");

    assert_eq!(receipt.proposal_id, proposal_id);
    assert_eq!(receipt.final_status, ProposalStatus::Executed);
    assert!(receipt.approved);
    assert_eq!(receipt.violation, ViolationCode::None);
    assert_eq!(
        receipt.decryption_request_account.as_deref(),
        Some(request_account.as_str())
    );
    assert_eq!(receipt.message_digest.as_deref(), Some(digest.as_str()));
    assert_eq!(receipt.signed_message.as_deref(), Some(message.as_str()));
}

#[test]
fn confidential_denial_after_decrypted_violation_clears_pending_state() {
    let mut treasury = treasury();
    configure_guardrails(&mut treasury, 1_700_000_100);
    let proposal_id = propose_approved_confidential(&mut treasury, 43_200);

    let request_account = Pubkey::new_unique().to_string();
    mark_and_confirm_decryption(&mut treasury, &request_account, 43_210);
    apply_confidential_policy_result(&mut treasury, 2, None, 43_212)
        .expect("daily-limit confidential result should apply");

    let receipt = deny_pending_transaction(&mut treasury, 43_220)
        .expect("denied confidential proposal should return a receipt");

    assert_eq!(receipt.proposal_id, proposal_id);
    assert_eq!(receipt.final_status, ProposalStatus::Denied);
    assert!(!receipt.approved);
    assert_eq!(receipt.violation, ViolationCode::DailyLimit);
    assert_eq!(
        receipt.decryption_request_account.as_deref(),
        Some(request_account.as_str())
    );
    assert!(receipt
        .trace
        .iter()
        .any(|outcome| outcome.rule_name == "confidential_policy_result" && !outcome.passed));
    assert!(treasury.pending.is_none());
}

#[test]
fn vector_confidential_flow_uses_decrypted_next_spent_today_lane() {
    let mut treasury = treasury();
    configure_vector_guardrails(&mut treasury, 1_700_000_100);
    let proposal_id = propose_approved_confidential_vector(&mut treasury, 43_200);
    let expected_guardrail_vector = treasury
        .pending
        .as_ref()
        .and_then(|pending| pending.policy_output_ciphertext_account.clone())
        .expect("vector output account should be staged");

    let request_account = Pubkey::new_unique().to_string();
    mark_and_confirm_decryption(&mut treasury, &request_account, 43_210);
    apply_confidential_policy_result(&mut treasury, 0, Some(500), 43_212)
        .expect("vector confidential result should apply");
    assert_eq!(
        treasury
            .confidential_guardrails
            .as_ref()
            .and_then(|guardrails| guardrails.guardrail_vector_ciphertext.clone())
            .as_deref(),
        Some(expected_guardrail_vector.as_str())
    );

    let (message, digest) = request_signature_for_pending(&mut treasury, 43_220);
    let receipt = finalize_signed_pending(&mut treasury, message.clone(), "ef".repeat(64), 43_221)
        .expect("vector confidential execution should finalize");

    assert_eq!(receipt.proposal_id, proposal_id);
    assert!(receipt.approved);
    assert_eq!(receipt.final_status, ProposalStatus::Executed);
    assert_eq!(receipt.message_digest.as_deref(), Some(digest.as_str()));
}

#[test]
fn vector_confidential_result_rejects_mismatched_next_spent_today_lane() {
    let mut treasury = treasury();
    configure_vector_guardrails(&mut treasury, 1_700_000_100);
    propose_approved_confidential_vector(&mut treasury, 43_200);

    let err = apply_confidential_policy_result(&mut treasury, 0, Some(999), 43_210)
        .expect_err("mismatched decrypted lane should be rejected");

    assert!(matches!(err, TreasuryError::InvalidAccountData(_)));
}
