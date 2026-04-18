use anchor_lang::prelude::*;

use crate::{
    audit::AuditEvent,
    program_accounts::{proposal_status_code, violation_code},
    ExecutionReceipt, PendingTransaction,
};

/// Emitted once per audit event after every instruction that mutates treasury state.
///
/// Clients and indexers subscribe to this event to build an off-chain audit log
/// without reading the full account data.
#[event]
pub struct TreasuryAuditEvent {
    /// The treasury account this event belongs to.
    pub treasury: Pubkey,
    /// Snake_case label identifying the action category (e.g. `"proposal_created"`).
    pub kind: String,
    /// Human-readable description with relevant identifiers or amounts.
    pub detail: String,
    /// Unix timestamp (seconds) when the action occurred.
    pub timestamp: i64,
}

/// Emitted after every proposal state change (propose, execute, deny, cancel, expire).
///
/// Allows clients to track proposal lifecycle without polling the account.
#[event]
pub struct ProposalLifecycleEvent {
    /// The treasury account this proposal belongs to.
    pub treasury: Pubkey,
    /// Monotonically increasing proposal identifier.
    pub proposal_id: u64,
    /// Deterministic digest of the proposal's key fields.
    pub proposal_digest: String,
    /// Current `ProposalStatus` encoded as a `u8` (see `proposal_status_code`).
    pub status: u8,
    /// Whether the policy engine approved this proposal.
    pub approved: bool,
    /// `ViolationCode` encoded as a `u8` (see `violation_code`); `0` if approved.
    pub violation: u8,
}

/// Emitted after `finalize_execution` or `deny_pending_transaction` completes.
///
/// Carries the full execution outcome including signature and decryption
/// account references for off-chain verification.
#[event]
pub struct ExecutionLifecycleEvent {
    /// The treasury account this receipt belongs to.
    pub treasury: Pubkey,
    /// The proposal ID this receipt corresponds to.
    pub proposal_id: u64,
    /// Deterministic digest of the proposal's key fields.
    pub proposal_digest: String,
    /// Final `ProposalStatus` encoded as a `u8`.
    pub final_status: u8,
    /// Whether the proposal was approved and executed.
    pub approved: bool,
    /// `ViolationCode` encoded as a `u8`; `0` if approved.
    pub violation: u8,
    /// Stable identifier for the `MessageApproval` account, if signing occurred.
    pub message_approval_id: Option<String>,
    /// Address of the `MessageApproval` PDA account, if signing occurred.
    pub message_approval_account: Option<String>,
    /// Decryption request account ID, if FHE decryption was performed.
    pub decryption_request_id: Option<String>,
    /// Address of the decryption request PDA account, if FHE decryption was performed.
    pub decryption_request_account: Option<String>,
}

/// Emits one `TreasuryAuditEvent` for each event in `events`.
pub fn emit_audit_events(treasury: Pubkey, events: &[AuditEvent]) {
    for event in events {
        emit!(TreasuryAuditEvent {
            treasury,
            kind: event.kind.to_string(),
            detail: event.detail.clone(),
            timestamp: event.timestamp,
        });
    }
}

/// Emits a `ProposalLifecycleEvent` for the current state of `pending`.
pub fn emit_proposal_event(treasury: Pubkey, pending: &PendingTransaction) {
    emit!(ProposalLifecycleEvent {
        treasury,
        proposal_id: pending.proposal_id,
        proposal_digest: pending.proposal_digest.clone(),
        status: proposal_status_code(pending.status),
        approved: pending.decision.approved,
        violation: violation_code(pending.decision.violation),
    });
}

/// Emits an `ExecutionLifecycleEvent` from an `ExecutionReceipt`.
pub fn emit_execution_event(treasury: Pubkey, receipt: &ExecutionReceipt) {
    emit!(ExecutionLifecycleEvent {
        treasury,
        proposal_id: receipt.proposal_id,
        proposal_digest: receipt.proposal_digest.clone(),
        final_status: proposal_status_code(receipt.final_status),
        approved: receipt.approved,
        violation: violation_code(receipt.violation),
        message_approval_id: receipt.message_approval_id.clone(),
        message_approval_account: receipt.message_approval_account.clone(),
        decryption_request_id: receipt.decryption_request_id.clone(),
        decryption_request_account: receipt.decryption_request_account.clone(),
    });
}
