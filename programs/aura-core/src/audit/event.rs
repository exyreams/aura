use std::fmt::{Display, Formatter};

/// Classifies the type of action recorded in the audit trail.
///
/// Each variant maps to a snake_case string label used in serialized output
/// and on-chain event logs. New variants should be added here whenever a
/// new category of treasury action is introduced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum AuditKind {
    /// Emitted once when the treasury is first initialized.
    TreasuryCreated,
    /// Emitted on both first registration of a dWallet and subsequent
    /// runtime metadata updates (dwallet account, authorized user, etc.).
    DWalletRegistered,
    /// Emitted when FHE guardrails are configured, whether scalar or vector mode.
    ConfidentialGuardrailsConfigured,
    /// Emitted when the AI authority submits a new transaction proposal.
    ProposalCreated,
    /// Emitted when the treasury owner explicitly cancels a pending proposal.
    ProposalCancelled,
    /// Emitted when a pending proposal is cleared because its TTL elapsed.
    ProposalExpired,
    /// Emitted when a decryption request is submitted to the Encrypt service.
    DecryptionRequested,
    /// Emitted when the decrypted policy result is verified and accepted.
    DecryptionVerified,
    /// Emitted when the policy engine denies a proposal.
    ProposalDenied,
    /// Emitted when `approve_message` is called to request a dWallet signature.
    SignatureRequested,
    /// Emitted when the dWallet signature is committed to the pending transaction.
    SignatureCommitted,
    /// Emitted when the proposal is finalized and the transaction executed.
    ProposalExecuted,
    /// Emitted when the owner pauses execution on the treasury.
    ExecutionPaused,
    /// Emitted when the owner resumes execution after a pause.
    ExecutionResumed,
    /// Emitted when an emergency multisig configuration is attached.
    MultisigAttached,
    /// Emitted when a swarm shared-pool configuration is attached.
    SwarmAttached,
    /// Emitted when a multisig override proposal reaches quorum and is applied.
    OverrideExecuted,
}

impl Display for AuditKind {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let label = match self {
            Self::TreasuryCreated => "treasury_created",
            Self::DWalletRegistered => "dwallet_registered",
            Self::ConfidentialGuardrailsConfigured => "confidential_guardrails_configured",
            Self::ProposalCreated => "proposal_created",
            Self::ProposalCancelled => "proposal_cancelled",
            Self::ProposalExpired => "proposal_expired",
            Self::DecryptionRequested => "decryption_requested",
            Self::DecryptionVerified => "decryption_verified",
            Self::ProposalDenied => "proposal_denied",
            Self::SignatureRequested => "signature_requested",
            Self::SignatureCommitted => "signature_committed",
            Self::ProposalExecuted => "proposal_executed",
            Self::ExecutionPaused => "execution_paused",
            Self::ExecutionResumed => "execution_resumed",
            Self::MultisigAttached => "multisig_attached",
            Self::SwarmAttached => "swarm_attached",
            Self::OverrideExecuted => "override_executed",
        };

        write!(f, "{label}")
    }
}

/// A single immutable record in the treasury audit trail.
///
/// Events are appended by `AuditTrail::record` and never modified after
/// creation. The `kind` field identifies the action category; `detail`
/// carries a human-readable description with relevant identifiers or
/// amounts; `timestamp` is the Unix timestamp (seconds) at the time the
/// action occurred.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct AuditEvent {
    /// The category of action that produced this event.
    pub kind: AuditKind,
    /// Human-readable description, optionally including identifiers or amounts.
    pub detail: String,
    /// Unix timestamp (seconds) when the action occurred.
    pub timestamp: i64,
}

impl AuditEvent {
    pub fn new(kind: AuditKind, detail: impl Into<String>, timestamp: i64) -> Self {
        Self {
            kind,
            detail: detail.into(),
            timestamp,
        }
    }
}
