use aura_policy::{
    advanced_policy_graph, confidential_policy_graph, confidential_scalar_policy_graph,
    evaluate_batch, evaluate_public_precheck, evaluate_transaction, transaction_policy_graph,
    PolicyDecision, RuleOutcome, TransactionContext, ViolationCode,
};

use crate::{
    audit::AuditKind,
    errors::TreasuryError,
    execution::generate_proposal_digest,
    ext_cpi::decision_digest,
    state::{
        AgentTreasury, ExecutionReceipt, PendingDecryptionRequest, PendingSignatureRequest,
        PendingTransaction, ProposalStatus,
    },
};

/// Returns policy decisions for a batch of transactions without mutating treasury state.
///
/// Useful for off-chain previewing or simulation — the AI can check which
/// transactions would be approved before committing to a proposal.
pub fn evaluate_batch_preview(
    treasury: &AgentTreasury,
    transactions: &[TransactionContext],
) -> Vec<PolicyDecision> {
    let contexts: Vec<_> = transactions
        .iter()
        .cloned()
        .map(|transaction| treasury.policy_context(transaction))
        .collect();

    evaluate_batch(&treasury.policy_config, &treasury.policy_state, &contexts)
}

/// Creates a new public (non-confidential) pending transaction.
///
/// Runs the full policy engine against `tx`, records the decision, derives
/// the proposal digest, and stores the `PendingTransaction` on the treasury.
/// Returns the new `proposal_id`.
///
/// Fails with:
/// - `UnauthorizedAi` if `ai_signer` does not match `treasury.ai_authority`
/// - `ExecutionPaused` if the treasury is paused
/// - `PendingTransactionExists` if a proposal is already pending
pub fn propose_transaction(
    treasury: &mut AgentTreasury,
    ai_signer: &str,
    tx: TransactionContext,
    recipient_or_contract: impl Into<String>,
) -> Result<u64, TreasuryError> {
    if ai_signer != treasury.ai_authority {
        return Err(TreasuryError::UnauthorizedAi);
    }

    if treasury.execution_paused {
        return Err(TreasuryError::ExecutionPaused);
    }

    if treasury.pending.is_some() {
        return Err(TreasuryError::PendingTransactionExists);
    }

    let submitted_at = tx.current_timestamp;
    let target_chain = tx.target_chain;
    let tx_type = tx.tx_type;
    let protocol_id = tx.protocol_id;
    let amount_usd = tx.amount_usd;
    let recipient_or_contract = recipient_or_contract.into();
    let decision = evaluate_transaction(
        &treasury.policy_config,
        &treasury.policy_state,
        &treasury.policy_context(tx),
    );
    let policy_graph_name = transaction_policy_graph().name.to_string();
    let policy_output_digest = decision_digest(&decision);
    let proposal_id = treasury.next_proposal_id;
    treasury.next_proposal_id = treasury.next_proposal_id.saturating_add(1);
    let proposal_digest = generate_proposal_digest(
        proposal_id,
        target_chain,
        tx_type,
        &recipient_or_contract,
        amount_usd,
        submitted_at,
        &policy_output_digest,
    );

    treasury.pending = Some(PendingTransaction {
        proposal_id,
        proposal_digest,
        policy_graph_name: policy_graph_name.clone(),
        policy_output_digest,
        policy_output_ciphertext_account: None,
        policy_output_fhe_type: None,
        target_chain,
        tx_type,
        amount_usd,
        recipient_or_contract,
        protocol_id,
        submitted_at,
        expires_at: submitted_at + treasury.pending_transaction_ttl_secs,
        last_updated_at: submitted_at,
        execution_attempts: 0,
        status: ProposalStatus::Proposed,
        decryption_request: None,
        signature_request: None,
        decision,
    });

    treasury.audit_trail.record(
        AuditKind::ProposalCreated,
        format!("proposal {proposal_id} submitted on {target_chain} via graph {policy_graph_name}"),
        submitted_at,
    );

    Ok(proposal_id)
}

/// Creates a new confidential (scalar FHE) pending transaction.
///
/// Runs the public pre-check policy first. If the pre-check approves, the
/// proposal uses the `confidential_scalar_policy_graph` and records the
/// ciphertext account for later decryption. If the pre-check denies, the
/// proposal falls back to the `advanced_policy_graph` and the decision is
/// recorded immediately without waiting for FHE decryption.
///
/// Fails with the same conditions as `propose_transaction`, plus
/// `ConfidentialGuardrailsNotConfigured` if no guardrails are set up.
pub fn propose_confidential_transaction(
    treasury: &mut AgentTreasury,
    ai_signer: &str,
    tx: TransactionContext,
    recipient_or_contract: impl Into<String>,
    amount_ciphertext_account: &str,
    policy_output_ciphertext_account: &str,
) -> Result<u64, TreasuryError> {
    if ai_signer != treasury.ai_authority {
        return Err(TreasuryError::UnauthorizedAi);
    }

    if treasury.execution_paused {
        return Err(TreasuryError::ExecutionPaused);
    }

    if treasury.pending.is_some() {
        return Err(TreasuryError::PendingTransactionExists);
    }

    if treasury.confidential_guardrails.is_none() {
        return Err(TreasuryError::ConfidentialGuardrailsNotConfigured);
    }

    let submitted_at = tx.current_timestamp;
    let target_chain = tx.target_chain;
    let tx_type = tx.tx_type;
    let protocol_id = tx.protocol_id;
    let amount_usd = tx.amount_usd;
    let recipient_or_contract = recipient_or_contract.into();
    let decision = evaluate_public_precheck(
        &treasury.policy_config,
        &treasury.policy_state,
        &treasury.policy_context(tx),
    );
    let policy_graph_name = if decision.approved {
        confidential_scalar_policy_graph().name.to_string()
    } else {
        advanced_policy_graph().name.to_string()
    };
    let policy_output_digest = if decision.approved {
        crate::hash_message(&format!(
            "{}:{}:{}:{}",
            policy_graph_name,
            amount_ciphertext_account,
            policy_output_ciphertext_account,
            submitted_at
        ))
    } else {
        decision_digest(&decision)
    };
    let proposal_id = treasury.next_proposal_id;
    treasury.next_proposal_id = treasury.next_proposal_id.saturating_add(1);
    let proposal_digest = generate_proposal_digest(
        proposal_id,
        target_chain,
        tx_type,
        &recipient_or_contract,
        amount_usd,
        submitted_at,
        &policy_output_digest,
    );

    treasury.pending = Some(PendingTransaction {
        proposal_id,
        proposal_digest,
        policy_graph_name: policy_graph_name.clone(),
        policy_output_digest,
        policy_output_ciphertext_account: decision
            .approved
            .then(|| policy_output_ciphertext_account.to_string()),
        policy_output_fhe_type: decision.approved.then_some(4),
        target_chain,
        tx_type,
        amount_usd,
        recipient_or_contract,
        protocol_id,
        submitted_at,
        expires_at: submitted_at + treasury.pending_transaction_ttl_secs,
        last_updated_at: submitted_at,
        execution_attempts: 0,
        status: ProposalStatus::Proposed,
        decryption_request: None,
        signature_request: None,
        decision,
    });

    treasury.audit_trail.record(
        AuditKind::ProposalCreated,
        format!("proposal {proposal_id} submitted on {target_chain} via graph {policy_graph_name}"),
        submitted_at,
    );

    Ok(proposal_id)
}

/// Creates a new confidential vector FHE pending transaction.
///
/// Like `propose_confidential_transaction` but uses the vector FHE graph
/// (`confidential_policy_graph`) which evaluates against an encrypted
/// guardrail vector ciphertext. The guardrail vector account is validated
/// against the treasury's configured value before the proposal is accepted.
///
/// On approval the output ciphertext becomes the new guardrail vector for
/// the next proposal, rotating the encrypted state forward.
pub fn propose_confidential_vector_transaction(
    treasury: &mut AgentTreasury,
    ai_signer: &str,
    tx: TransactionContext,
    recipient_or_contract: impl Into<String>,
    guardrail_vector_ciphertext_account: &str,
    amount_vector_ciphertext_account: &str,
    policy_output_ciphertext_account: &str,
) -> Result<u64, TreasuryError> {
    if ai_signer != treasury.ai_authority {
        return Err(TreasuryError::UnauthorizedAi);
    }

    if treasury.execution_paused {
        return Err(TreasuryError::ExecutionPaused);
    }

    if treasury.pending.is_some() {
        return Err(TreasuryError::PendingTransactionExists);
    }

    let guardrails = treasury
        .confidential_guardrails
        .as_ref()
        .ok_or(TreasuryError::ConfidentialGuardrailsNotConfigured)?;
    if guardrails.guardrail_vector_ciphertext.as_deref()
        != Some(guardrail_vector_ciphertext_account)
    {
        return Err(TreasuryError::InvalidAccountData(
            "confidential guardrail vector account does not match configured treasury state"
                .to_string(),
        ));
    }

    let submitted_at = tx.current_timestamp;
    let target_chain = tx.target_chain;
    let tx_type = tx.tx_type;
    let protocol_id = tx.protocol_id;
    let amount_usd = tx.amount_usd;
    let recipient_or_contract = recipient_or_contract.into();
    let decision = evaluate_public_precheck(
        &treasury.policy_config,
        &treasury.policy_state,
        &treasury.policy_context(tx),
    );
    let policy_graph_name = if decision.approved {
        confidential_policy_graph().name.to_string()
    } else {
        advanced_policy_graph().name.to_string()
    };
    let policy_output_digest = if decision.approved {
        crate::hash_message(&format!(
            "{}:{}:{}:{}:{}",
            policy_graph_name,
            guardrail_vector_ciphertext_account,
            amount_vector_ciphertext_account,
            policy_output_ciphertext_account,
            submitted_at
        ))
    } else {
        decision_digest(&decision)
    };
    let proposal_id = treasury.next_proposal_id;
    treasury.next_proposal_id = treasury.next_proposal_id.saturating_add(1);
    let proposal_digest = generate_proposal_digest(
        proposal_id,
        target_chain,
        tx_type,
        &recipient_or_contract,
        amount_usd,
        submitted_at,
        &policy_output_digest,
    );

    treasury.pending = Some(PendingTransaction {
        proposal_id,
        proposal_digest,
        policy_graph_name: policy_graph_name.clone(),
        policy_output_digest,
        policy_output_ciphertext_account: decision
            .approved
            .then(|| policy_output_ciphertext_account.to_string()),
        policy_output_fhe_type: decision.approved.then_some(35),
        target_chain,
        tx_type,
        amount_usd,
        recipient_or_contract,
        protocol_id,
        submitted_at,
        expires_at: submitted_at + treasury.pending_transaction_ttl_secs,
        last_updated_at: submitted_at,
        execution_attempts: 0,
        status: ProposalStatus::Proposed,
        decryption_request: None,
        signature_request: None,
        decision,
    });

    treasury.audit_trail.record(
        AuditKind::ProposalCreated,
        format!("proposal {proposal_id} submitted on {target_chain} via graph {policy_graph_name}"),
        submitted_at,
    );

    Ok(proposal_id)
}

/// Increments the execution attempt counter and clears the pending transaction
/// if its TTL has elapsed.
///
/// Called at the start of `execute_pending` before any CPI is attempted.
/// Returns `PendingTransactionExpired` (and removes the pending slot) if
/// `now >= pending.expires_at`. Returns `NoPendingTransaction` if there is
/// nothing pending.
pub fn expire_pending_transaction(
    treasury: &mut AgentTreasury,
    now: i64,
) -> Result<(), TreasuryError> {
    let expired_id = {
        let pending = treasury
            .pending
            .as_mut()
            .ok_or(TreasuryError::NoPendingTransaction)?;
        pending.execution_attempts = pending.execution_attempts.saturating_add(1);
        pending.last_updated_at = now;

        if pending.expires_at < now {
            Some(pending.proposal_id)
        } else {
            None
        }
    };

    if let Some(expired_id) = expired_id {
        treasury.pending = None;
        treasury.audit_trail.record(
            AuditKind::ProposalExpired,
            format!("proposal {expired_id} expired before execution"),
            now,
        );
        return Err(TreasuryError::PendingTransactionExpired);
    }

    Ok(())
}

/// Clears the pending transaction and produces a denial receipt.
///
/// Called when the policy decision is `approved == false`. Records a
/// reputation failure and emits a `ProposalDenied` audit event.
///
/// Returns `PolicyDigestMismatch` if the stored decision is actually approved
/// (guards against calling this on the wrong proposal).
pub fn deny_pending_transaction(
    treasury: &mut AgentTreasury,
    now: i64,
) -> Result<ExecutionReceipt, TreasuryError> {
    let pending = treasury
        .pending
        .clone()
        .ok_or(TreasuryError::NoPendingTransaction)?;
    if pending.decision.approved {
        return Err(TreasuryError::PolicyDigestMismatch);
    }

    treasury.pending = None;
    treasury.reputation.record_failure();
    treasury.audit_trail.record(
        AuditKind::ProposalDenied,
        format!(
            "proposal {} denied with {}",
            pending.proposal_id, pending.decision.violation
        ),
        now,
    );

    Ok(ExecutionReceipt {
        proposal_id: pending.proposal_id,
        proposal_digest: pending.proposal_digest,
        policy_graph_name: pending.policy_graph_name,
        policy_output_digest: pending.policy_output_digest,
        decryption_request_id: pending
            .decryption_request
            .as_ref()
            .map(|request| request.request_account.clone()),
        decryption_request_account: pending
            .decryption_request
            .as_ref()
            .map(|request| request.request_account.clone()),
        decryption_ciphertext_account: pending
            .decryption_request
            .as_ref()
            .map(|request| request.ciphertext_account.clone()),
        final_status: ProposalStatus::Denied,
        approved: false,
        violation: pending.decision.violation,
        message_approval_id: pending
            .signature_request
            .as_ref()
            .map(|request| request.approval_id.clone()),
        message_approval_account: pending
            .signature_request
            .as_ref()
            .map(|request| request.message_approval_account.clone()),
        message_digest: None,
        message_metadata_digest: None,
        signed_message: None,
        signature: None,
        signature_scheme: None,
        transaction_fee_usd: 0,
        effective_daily_limit_usd: pending.decision.effective_daily_limit_usd,
        trace: pending.decision.trace.clone(),
    })
}

/// Records a submitted decryption request on the pending transaction.
///
/// Transitions the proposal status to `DecryptionRequested` and stores the
/// `PendingDecryptionRequest` so that `confirm_pending_decryption` can later
/// verify the result. Emits a `DecryptionRequested` audit event.
pub fn mark_pending_decryption_request(
    treasury: &mut AgentTreasury,
    request: PendingDecryptionRequest,
    now: i64,
) -> Result<(), TreasuryError> {
    let proposal_id = {
        let pending = treasury
            .pending
            .as_mut()
            .ok_or(TreasuryError::NoPendingTransaction)?;
        pending.status = ProposalStatus::DecryptionRequested;
        pending.last_updated_at = now;
        pending.decryption_request = Some(request.clone());
        pending.proposal_id
    };
    treasury.audit_trail.record(
        AuditKind::DecryptionRequested,
        format!(
            "decryption requested for proposal {} via {}",
            proposal_id, request.request_account
        ),
        now,
    );
    Ok(())
}

/// Marks the decryption request as verified once the Encrypt network has
/// written the plaintext.
///
/// Validates that `request_account` matches the stored request, then records
/// the verification timestamp and plaintext SHA-256 digest. Emits a
/// `DecryptionVerified` audit event.
pub fn confirm_pending_decryption(
    treasury: &mut AgentTreasury,
    request_account: &str,
    plaintext_sha256: String,
    now: i64,
) -> Result<(), TreasuryError> {
    let proposal_id = {
        let pending = treasury
            .pending
            .as_mut()
            .ok_or(TreasuryError::NoPendingTransaction)?;
        let request = pending
            .decryption_request
            .as_mut()
            .ok_or(TreasuryError::NoPendingTransaction)?;
        if request.request_account != request_account {
            return Err(TreasuryError::InvalidAccountData(
                "decryption request account does not match pending request".to_string(),
            ));
        }

        request.verified_at = Some(now);
        request.plaintext_sha256 = Some(plaintext_sha256.clone());
        pending.last_updated_at = now;
        pending.proposal_id
    };
    treasury.audit_trail.record(
        AuditKind::DecryptionVerified,
        format!(
            "decryption verified for proposal {} via {} ({plaintext_sha256})",
            proposal_id, request_account
        ),
        now,
    );
    Ok(())
}

/// Applies the decrypted FHE policy result to the pending transaction.
///
/// Interprets `violation_code` (0 = approved, 1 = per-tx limit, 2 = daily
/// limit) and updates `pending.decision.approved` and `violation` accordingly.
/// If approved and `decrypted_next_spent_today` is provided, it is validated
/// against the expected value and written into the next policy state.
///
/// For vector FHE proposals (`fhe_type == 35`), the output ciphertext account
/// is promoted to the treasury's new guardrail vector ciphertext, rotating
/// the encrypted state forward.
pub fn apply_confidential_policy_result(
    treasury: &mut AgentTreasury,
    violation_code: u64,
    decrypted_next_spent_today: Option<u64>,
    now: i64,
) -> Result<(), TreasuryError> {
    let mut next_guardrail_vector_ciphertext = None;
    let pending = treasury
        .pending
        .as_mut()
        .ok_or(TreasuryError::NoPendingTransaction)?;

    let (approved, violation, detail) = match violation_code {
        0 => (
            true,
            ViolationCode::None,
            "decrypted violation code 0 (approved)".to_string(),
        ),
        1 => (
            false,
            ViolationCode::PerTransactionLimit,
            "decrypted violation code 1 (per-transaction limit exceeded)".to_string(),
        ),
        2 => (
            false,
            ViolationCode::DailyLimit,
            "decrypted violation code 2 (daily limit exceeded)".to_string(),
        ),
        other => {
            return Err(TreasuryError::InvalidAccountData(format!(
                "unsupported confidential violation code {other}"
            )))
        }
    };

    if approved {
        let expected_next_spent_today = pending
            .decision
            .next_state
            .spent_today_usd
            .saturating_add(pending.amount_usd);
        if let Some(decrypted_next_spent_today) = decrypted_next_spent_today {
            if decrypted_next_spent_today != expected_next_spent_today {
                return Err(TreasuryError::InvalidAccountData(format!(
                    "decrypted next spent-today {} does not match expected {}",
                    decrypted_next_spent_today, expected_next_spent_today
                )));
            }
            pending.decision.next_state.spent_today_usd = decrypted_next_spent_today;
        } else {
            pending.decision.next_state.spent_today_usd = expected_next_spent_today;
        }
    }

    pending.decision.approved = approved;
    pending.decision.violation = violation;
    pending.last_updated_at = now;
    if pending.policy_output_fhe_type == Some(35) {
        next_guardrail_vector_ciphertext = pending.policy_output_ciphertext_account.clone();
    }
    pending.decision.trace.push(if approved {
        RuleOutcome::passed("confidential_policy_result", detail)
    } else {
        RuleOutcome::failed("confidential_policy_result", detail)
    });
    if let Some(next_guardrail_vector_ciphertext) = next_guardrail_vector_ciphertext {
        if let Some(guardrails) = treasury.confidential_guardrails.as_mut() {
            guardrails.guardrail_vector_ciphertext = Some(next_guardrail_vector_ciphertext);
        }
    }
    Ok(())
}

/// Records a submitted dWallet signature request on the pending transaction.
///
/// Transitions the proposal status to `SignaturePending` and stores the
/// `PendingSignatureRequest`. Emits a `SignatureRequested` audit event.
pub fn mark_signature_requested(
    treasury: &mut AgentTreasury,
    request: PendingSignatureRequest,
    now: i64,
) -> Result<(), TreasuryError> {
    let proposal_id = {
        let pending = treasury
            .pending
            .as_mut()
            .ok_or(TreasuryError::NoPendingTransaction)?;
        pending.status = ProposalStatus::SignaturePending;
        pending.last_updated_at = now;
        pending.signature_request = Some(request.clone());
        pending.proposal_id
    };
    treasury.audit_trail.record(
        AuditKind::SignatureRequested,
        format!(
            "message approval {} requested for proposal {}",
            request.message_approval_account, proposal_id
        ),
        now,
    );
    Ok(())
}

/// Finalizes an approved, signed pending transaction and produces an execution receipt.
///
/// Validates that any confidential decryption request has been verified, then:
/// - Advances `treasury.policy_state` to the decision's next state
/// - Increments `total_transactions` and updates reputation
/// - Records swarm pool spend if a swarm is configured
/// - Clears the pending slot
/// - Emits `SignatureCommitted` and `ProposalExecuted` audit events
///
/// Returns `MessageApprovalNotReady` if no signature request is recorded, or
/// `DecryptionNotReady` if a decryption request exists but has not been verified.
pub fn finalize_signed_pending(
    treasury: &mut AgentTreasury,
    signed_message: String,
    signature_hex: String,
    now: i64,
) -> Result<ExecutionReceipt, TreasuryError> {
    let pending = treasury
        .pending
        .clone()
        .ok_or(TreasuryError::NoPendingTransaction)?;
    let signature_request = pending
        .signature_request
        .as_ref()
        .ok_or(TreasuryError::MessageApprovalNotReady)?;

    if let Some(decryption_request) = &pending.decryption_request {
        if decryption_request.verified_at.is_none() || decryption_request.plaintext_sha256.is_none()
        {
            return Err(TreasuryError::DecryptionNotReady);
        }
    }

    let fee = treasury.protocol_fees.fee_for_amount(pending.amount_usd);
    treasury.policy_state = pending.decision.next_state.clone();
    treasury.total_transactions += 1;
    treasury.reputation.record_success(pending.amount_usd);
    if let Some(swarm) = treasury.swarm.as_mut() {
        swarm.record_spend(pending.amount_usd);
    }
    treasury.pending = None;

    treasury.audit_trail.record(
        AuditKind::SignatureCommitted,
        format!(
            "signature committed for {}",
            signature_request.message_approval_account
        ),
        now,
    );
    treasury.audit_trail.record(
        AuditKind::ProposalExecuted,
        format!(
            "proposal {} executed on {}",
            pending.proposal_id, pending.target_chain
        ),
        now,
    );

    Ok(ExecutionReceipt {
        proposal_id: pending.proposal_id,
        proposal_digest: pending.proposal_digest,
        policy_graph_name: pending.policy_graph_name,
        policy_output_digest: pending.policy_output_digest,
        decryption_request_id: pending
            .decryption_request
            .as_ref()
            .map(|request| request.request_account.clone()),
        decryption_request_account: pending
            .decryption_request
            .as_ref()
            .map(|request| request.request_account.clone()),
        decryption_ciphertext_account: pending
            .decryption_request
            .as_ref()
            .map(|request| request.ciphertext_account.clone()),
        final_status: ProposalStatus::Executed,
        approved: true,
        violation: ViolationCode::None,
        message_approval_id: Some(signature_request.approval_id.clone()),
        message_approval_account: Some(signature_request.message_approval_account.clone()),
        message_digest: Some(signature_request.message_digest.clone()),
        message_metadata_digest: Some(signature_request.message_metadata_digest.clone()),
        signed_message: Some(signed_message),
        signature: Some(signature_hex),
        signature_scheme: Some(signature_request.signature_scheme),
        transaction_fee_usd: fee,
        effective_daily_limit_usd: pending.decision.effective_daily_limit_usd,
        trace: pending.decision.trace.clone(),
    })
}
