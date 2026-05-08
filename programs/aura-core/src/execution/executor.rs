use aura_policy::{
    advanced_policy_graph, confidential_scalar_policy_graph, evaluate_batch,
    evaluate_public_precheck, evaluate_transaction, required_approval_level,
    transaction_policy_graph, ApprovalLevel, PolicyDecision, RuleOutcome, TransactionContext,
    ViolationCode,
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
    mut tx: TransactionContext,
    recipient_or_contract: impl Into<String>,
) -> Result<u64, TreasuryError> {
    if ai_signer != treasury.ai_authority {
        return Err(TreasuryError::UnauthorizedAi);
    }

    let recipient_or_contract = recipient_or_contract.into();
    tx.recipient_or_contract = Some(recipient_or_contract.clone());
    treasury.can_accept_proposal(tx.current_timestamp)?;
    enforce_cooldown(treasury, &tx)?;
    let submitted_at = tx.current_timestamp;
    let target_chain = tx.target_chain;
    let tx_type = tx.tx_type;
    let protocol_id = tx.protocol_id;
    let amount_usd = tx.amount_usd;
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

    let approval = pending_approval_requirements(treasury, &decision, amount_usd, submitted_at);
    let requires_guardian_cosign = treasury.high_risk_require_guardian
        && decision.risk_score >= treasury.high_risk_threshold
        || approval.required_level == ApprovalLevel::Guardian.code();
    treasury.push_pending(PendingTransaction {
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
        risk_score: decision.risk_score,
        required_approval_level: approval.required_level,
        satisfied_approval_level: approval.satisfied_level,
        earliest_execution_at: approval.earliest_execution_at,
        requires_guardian_cosign,
        policy_version: treasury.current_policy_version,
        compliance_metadata: Some(crate::state::ComplianceMetadata::from_policy_flags(
            0,
            decision.regulatory_flags,
        )),
        decision,
    })?;

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
    mut tx: TransactionContext,
    recipient_or_contract: impl Into<String>,
    amount_ciphertext_account: &str,
    policy_output_ciphertext_account: &str,
) -> Result<u64, TreasuryError> {
    if ai_signer != treasury.ai_authority {
        return Err(TreasuryError::UnauthorizedAi);
    }

    if treasury.confidential_guardrails.is_none() {
        return Err(TreasuryError::ConfidentialGuardrailsNotConfigured);
    }

    let recipient_or_contract = recipient_or_contract.into();
    tx.recipient_or_contract = Some(recipient_or_contract.clone());
    treasury.can_accept_proposal(tx.current_timestamp)?;
    enforce_cooldown(treasury, &tx)?;
    let submitted_at = tx.current_timestamp;
    let target_chain = tx.target_chain;
    let tx_type = tx.tx_type;
    let protocol_id = tx.protocol_id;
    let amount_usd = tx.amount_usd;
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

    let approval = pending_approval_requirements(treasury, &decision, amount_usd, submitted_at);
    let requires_guardian_cosign = treasury.high_risk_require_guardian
        && decision.risk_score >= treasury.high_risk_threshold
        || approval.required_level == ApprovalLevel::Guardian.code();
    treasury.push_pending(PendingTransaction {
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
        risk_score: decision.risk_score,
        required_approval_level: approval.required_level,
        satisfied_approval_level: approval.satisfied_level,
        earliest_execution_at: approval.earliest_execution_at,
        requires_guardian_cosign,
        policy_version: treasury.current_policy_version,
        compliance_metadata: Some(crate::state::ComplianceMetadata::from_policy_flags(
            0,
            decision.regulatory_flags,
        )),
        decision,
    })?;

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
            .active_pending_mut()
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
        treasury.pop_front_pending();
        treasury.audit_trail.record(
            AuditKind::ProposalExpired,
            format!("proposal {expired_id} expired before execution"),
            now,
        );
        return Err(TreasuryError::PendingTransactionExpired);
    }

    Ok(())
}

#[derive(Clone, Copy)]
struct PendingApprovalRequirements {
    required_level: u8,
    satisfied_level: u8,
    earliest_execution_at: i64,
}

fn pending_approval_requirements(
    treasury: &AgentTreasury,
    decision: &PolicyDecision,
    amount_usd: u64,
    submitted_at: i64,
) -> PendingApprovalRequirements {
    let Some(ladder) = treasury.policy_config.approval_ladder else {
        return PendingApprovalRequirements {
            required_level: ApprovalLevel::None.code(),
            satisfied_level: ApprovalLevel::None.code(),
            earliest_execution_at: 0,
        };
    };

    let level = required_approval_level(&ladder, amount_usd, u16::from(decision.risk_score) * 100);
    let earliest_execution_at = if level == ApprovalLevel::Timelock {
        submitted_at.saturating_add(ladder.timelock_secs)
    } else {
        0
    };
    let satisfied_level = match level {
        ApprovalLevel::None => ApprovalLevel::None.code(),
        ApprovalLevel::Timelock => ApprovalLevel::Timelock.code(),
        ApprovalLevel::Deny => ApprovalLevel::None.code(),
        ApprovalLevel::Guardian | ApprovalLevel::Multisig => ApprovalLevel::None.code(),
    };

    PendingApprovalRequirements {
        required_level: level.code(),
        satisfied_level,
        earliest_execution_at,
    }
}

pub fn approve_pending_execution(
    treasury: &mut AgentTreasury,
    approver: &str,
    proposal_id: u64,
    approval_level: ApprovalLevel,
    now: i64,
) -> Result<(), TreasuryError> {
    let owner = treasury.owner.clone();
    let is_guardian = treasury.multisig.as_ref().is_some_and(|multisig| {
        multisig
            .guardians
            .iter()
            .any(|guardian| guardian == approver)
    });
    let pending = treasury
        .active_pending_mut()
        .ok_or(TreasuryError::NoPendingTransaction)?;
    if pending.proposal_id != proposal_id {
        return Err(TreasuryError::InvalidAccountData(
            "approval proposal id does not match active pending proposal".to_string(),
        ));
    }
    let requested = approval_level.code();
    if requested > pending.required_approval_level {
        return Err(TreasuryError::InvalidAccountData(
            "approval level exceeds pending requirement".to_string(),
        ));
    }
    let authorized = match approval_level {
        ApprovalLevel::None => true,
        ApprovalLevel::Guardian => approver == owner || is_guardian,
        ApprovalLevel::Multisig | ApprovalLevel::Timelock => approver == owner,
        ApprovalLevel::Deny => false,
    };
    if !authorized {
        return Err(TreasuryError::UnauthorizedGuardian);
    }

    pending.satisfied_approval_level = pending.satisfied_approval_level.max(requested);
    pending.last_updated_at = now;
    let detail = format!(
        "proposal {proposal_id} approval level {} satisfied by {approver}",
        approval_level.code()
    );
    treasury
        .audit_trail
        .record(AuditKind::ConfigChangeExecuted, detail, now);
    treasury.sync_pending_front();
    Ok(())
}

pub fn enforce_pending_approval(
    pending: &PendingTransaction,
    now: i64,
) -> Result<(), TreasuryError> {
    if pending.earliest_execution_at > 0 && now < pending.earliest_execution_at {
        return Err(TreasuryError::PendingExecutionTimelockActive);
    }
    if pending.satisfied_approval_level < pending.required_approval_level {
        return Err(TreasuryError::ApprovalLevelNotSatisfied);
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
        .active_pending()
        .cloned()
        .ok_or(TreasuryError::NoPendingTransaction)?;
    if pending.decision.approved {
        return Err(TreasuryError::PolicyDigestMismatch);
    }

    treasury.pop_front_pending();
    treasury.reputation.record_failure();
    treasury.record_policy_violation(now);
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
        compliance_metadata: pending.compliance_metadata,
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
            .active_pending_mut()
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
    treasury.sync_pending_front();
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
            .active_pending_mut()
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
    treasury.sync_pending_front();
    Ok(())
}

/// Applies the decrypted FHE policy result to the pending transaction.
///
/// Interprets `violation_code` (0 = approved, 1 = per-tx limit, 2 = daily
/// limit) and updates `pending.decision.approved` and `violation` accordingly.
/// If approved and `decrypted_next_spent_today` is provided, it is validated
/// against the expected value and written into the next policy state. Normal
/// execution only reveals the small violation code; confidential guardrail
/// ciphertexts remain encrypted.
pub fn apply_confidential_policy_result(
    treasury: &mut AgentTreasury,
    violation_code: u64,
    decrypted_next_spent_today: Option<u64>,
    now: i64,
) -> Result<(), TreasuryError> {
    let pending = treasury
        .active_pending_mut()
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
    pending.decision.trace.push(if approved {
        RuleOutcome::passed("confidential_policy_result", detail)
    } else {
        RuleOutcome::failed("confidential_policy_result", detail)
    });
    treasury.sync_pending_front();
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
            .active_pending_mut()
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
    treasury.sync_pending_front();
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
        .active_pending()
        .cloned()
        .ok_or(TreasuryError::NoPendingTransaction)?;
    let signature_request = pending
        .signature_request
        .as_ref()
        .ok_or(TreasuryError::MessageApprovalNotReady)?;
    enforce_pending_approval(&pending, now)?;

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
    if let Some(cooldown) = treasury.policy_config.cooldown_config {
        if pending.amount_usd >= cooldown.threshold_usd {
            treasury.last_large_tx_at = Some(now);
            treasury.last_large_tx_amount_usd = pending.amount_usd;
        }
    }
    treasury.pop_front_pending();

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
        compliance_metadata: pending.compliance_metadata,
    })
}

fn enforce_cooldown(
    treasury: &AgentTreasury,
    tx: &TransactionContext,
) -> Result<(), TreasuryError> {
    let Some(cooldown) = treasury.policy_config.cooldown_config else {
        return Ok(());
    };

    if tx.amount_usd < cooldown.threshold_usd {
        return Ok(());
    }

    let Some(last_at) = treasury.last_large_tx_at else {
        return Ok(());
    };

    let elapsed = tx.current_timestamp.saturating_sub(last_at);
    if elapsed < cooldown.cooldown_secs {
        return Err(TreasuryError::CooldownNotElapsed {
            remaining_secs: cooldown.cooldown_secs - elapsed,
        });
    }

    Ok(())
}
