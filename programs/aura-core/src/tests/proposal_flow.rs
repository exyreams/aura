use anchor_lang::prelude::Pubkey;
use aura_policy::{Chain, PolicyConfig, TransactionContext, TransactionType, ViolationCode};

use crate::{
    build_chain_message, build_message_approval_request, deny_pending_transaction,
    expire_pending_transaction, finalize_signed_pending, mark_signature_requested,
    pending_signature_request_from_live, propose_transaction, AgentTreasury,
    DWalletMessageApprovalLayout, ProposalStatus, ProtocolDeployment, SignatureScheme,
    TreasuryError, DWALLET_DEVNET_PROGRAM_ID, ENCRYPT_DEVNET_PROGRAM_ID,
};

/// Builds a standard treasury used across proposal flow tests.
/// Registers one Ethereum dWallet with runtime metadata pre-configured.
pub fn treasury() -> AgentTreasury {
    let deployment = ProtocolDeployment::local_testing("proposal-flow");
    let owner = Pubkey::new_unique();
    let ai = Pubkey::new_unique();
    let mut treasury = AgentTreasury::new(
        "agent-01",
        owner.to_string(),
        ai.to_string(),
        1_700_000_000,
        PolicyConfig::default(),
        deployment,
    );
    treasury
        .register_dwallet(
            Chain::Ethereum,
            "dw-eth-01",
            "0xAURA",
            25_000,
            1_700_000_000,
        )
        .expect("dwallet registration should succeed");
    treasury
        .configure_dwallet_runtime(
            Chain::Ethereum,
            Some(Pubkey::new_unique().to_string()),
            Some(Pubkey::new_unique().to_string()),
            None,
            None,
            1_700_000_001,
        )
        .expect("dwallet runtime metadata should be configured");
    treasury
}

/// Simulates the off-chain step of building a message approval request and
/// recording it as a `PendingSignatureRequest` on the treasury.
/// Returns the canonical chain message string and its hex digest.
pub fn request_signature_for_pending(treasury: &mut AgentTreasury, now: i64) -> (String, String) {
    let pending = treasury.pending.clone().expect("pending proposal");
    let dwallet = treasury
        .dwallets
        .get(&pending.target_chain)
        .cloned()
        .expect("registered dwallet");
    let dwallet_program: Pubkey = treasury
        .deployment
        .dwallet_program_id
        .parse()
        .expect("valid local dwallet program id");
    let approval_request = build_message_approval_request(
        &pending,
        &dwallet,
        &dwallet_program,
        treasury.deployment.dwallet_message_approval_layout,
    )
    .expect("message approval request should build");
    let dwallet_account: Pubkey = dwallet
        .dwallet_account
        .clone()
        .expect("dwallet runtime account")
        .parse()
        .expect("valid dwallet account");
    let signature_request =
        pending_signature_request_from_live(&approval_request, &dwallet_account, now);
    mark_signature_requested(treasury, signature_request, now)
        .expect("signature request should be stored");

    (
        approval_request.message,
        approval_request.message_digest_hex,
    )
}

#[test]
fn happy_path_propose_and_finalize_execution() {
    let mut treasury = treasury();
    let ai = treasury.ai_authority.clone();

    let proposal_id = propose_transaction(
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
        },
        "0xUNISWAP",
    )
    .expect("proposal should succeed");

    let (message, message_digest) = request_signature_for_pending(&mut treasury, 43_260);
    let receipt =
        finalize_signed_pending(&mut treasury, message.clone(), "abcd".repeat(16), 43_261)
            .expect("execution should finalize");

    assert_eq!(proposal_id, receipt.proposal_id);
    assert!(receipt.approved);
    assert_eq!(receipt.final_status, ProposalStatus::Executed);
    assert!(receipt.message_approval_id.is_some());
    assert!(receipt.message_approval_account.is_some());
    assert_eq!(
        receipt.message_digest.as_deref(),
        Some(message_digest.as_str())
    );
    assert_eq!(
        receipt.signature_scheme,
        Some(SignatureScheme::EcdsaKeccak256)
    );
    assert_eq!(receipt.signed_message.as_deref(), Some(message.as_str()));
    assert_eq!(treasury.total_transactions, 1);
    assert!(treasury.pending.is_none());
}

#[test]
fn denied_transactions_clear_pending_state() {
    let mut treasury = treasury();
    let ai = treasury.ai_authority.clone();

    propose_transaction(
        &mut treasury,
        &ai,
        TransactionContext {
            amount_usd: 2_500,
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

    let receipt = deny_pending_transaction(&mut treasury, 43_260)
        .expect("denial should still return receipt");

    assert!(!receipt.approved);
    assert_eq!(receipt.violation, ViolationCode::PerTransactionLimit);
    assert_eq!(receipt.final_status, ProposalStatus::Denied);
    assert!(receipt.message_approval_id.is_none());
    assert!(treasury.pending.is_none());
    assert_eq!(treasury.reputation.failed_transactions, 1);
}

#[test]
fn rejects_invalid_program_id_configuration() {
    let result = ProtocolDeployment::devnet_pre_alpha("TODO");

    assert!(matches!(result, Err(TreasuryError::InvalidProgramId(_))));
}

#[test]
fn devnet_pre_alpha_uses_official_encrypt_and_dwallet_ids() {
    let deployment =
        ProtocolDeployment::devnet_pre_alpha("CntR1111111111111111111111111111111111111111")
            .expect("official devnet deployment should validate");

    assert_eq!(deployment.encrypt_program_id, ENCRYPT_DEVNET_PROGRAM_ID);
    assert_eq!(deployment.dwallet_program_id, DWALLET_DEVNET_PROGRAM_ID);
    assert_eq!(
        deployment.dwallet_message_approval_layout,
        DWalletMessageApprovalLayout::MetadataV2
    );
}

#[test]
fn proposal_expires_before_execution_if_ttl_passes() {
    let mut treasury = treasury();
    treasury.pending_transaction_ttl_secs = 30;
    let ai = treasury.ai_authority.clone();

    propose_transaction(
        &mut treasury,
        &ai,
        TransactionContext {
            amount_usd: 500,
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

    let result = expire_pending_transaction(&mut treasury, 43_400);

    assert!(matches!(
        result,
        Err(TreasuryError::PendingTransactionExpired)
    ));
    assert!(treasury.pending.is_none());
}

#[test]
fn owner_can_pause_and_cancel_pending_transactions() {
    let mut treasury = treasury();
    let owner = treasury.owner.clone();
    let ai = treasury.ai_authority.clone();
    treasury
        .set_execution_paused(&owner, true, 43_210)
        .expect("owner should be able to pause execution");

    let result = propose_transaction(
        &mut treasury,
        &ai,
        TransactionContext {
            amount_usd: 250,
            target_chain: Chain::Ethereum,
            tx_type: TransactionType::Transfer,
            protocol_id: None,
            current_timestamp: 43_220,
            expected_output_usd: None,
            actual_output_usd: None,
            quote_age_secs: None,
            counterparty_risk_score: None,
        },
        "0xrecipient",
    );

    assert!(matches!(result, Err(TreasuryError::ExecutionPaused)));

    treasury
        .set_execution_paused(&owner, false, 43_230)
        .expect("owner should be able to resume execution");

    propose_transaction(
        &mut treasury,
        &ai,
        TransactionContext {
            amount_usd: 250,
            target_chain: Chain::Ethereum,
            tx_type: TransactionType::Transfer,
            protocol_id: None,
            current_timestamp: 43_240,
            expected_output_usd: None,
            actual_output_usd: None,
            quote_age_secs: None,
            counterparty_risk_score: None,
        },
        "0xrecipient",
    )
    .expect("proposal should be created after resume");

    let cancelled = treasury
        .cancel_pending(&owner, 43_250)
        .expect("owner should be able to cancel pending");

    assert!(cancelled);
    assert!(treasury.pending.is_none());
}

#[test]
fn signed_message_matches_live_message_builder() {
    let mut treasury = treasury();
    let ai = treasury.ai_authority.clone();
    propose_transaction(
        &mut treasury,
        &ai,
        TransactionContext {
            amount_usd: 500,
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
    .expect("proposal should succeed");

    let pending = treasury.pending.clone().expect("pending");
    let dwallet = treasury
        .dwallets
        .get(&Chain::Ethereum)
        .cloned()
        .expect("dwallet");
    let message = build_chain_message(&pending, &dwallet);

    let (requested_message, _) = request_signature_for_pending(&mut treasury, 43_220);
    assert_eq!(requested_message, message);
}
