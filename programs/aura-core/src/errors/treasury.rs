use std::fmt::{Display, Formatter};

use aura_policy::Chain;

/// Errors produced by treasury operations in `aura-core`.
///
/// Returned by instruction handlers and CPI helpers as `TreasuryResult<T>`.
/// Variants that carry a `String` include a detail message with the
/// offending value or context; fixed variants have a constant display string.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum TreasuryError {
    /// The caller does not hold the AI authority key for this treasury.
    UnauthorizedAi,
    /// The caller does not hold the owner key for this treasury.
    UnauthorizedOwner,
    /// The caller is not a registered guardian on the emergency multisig.
    UnauthorizedGuardian,
    /// A proposal is already pending; only one may be active at a time.
    PendingTransactionExists,
    /// An operation requires a pending transaction but none exists.
    NoPendingTransaction,
    /// No dWallet has been registered for the given chain.
    DWalletNotConfigured(Chain),
    /// A dWallet is already registered for the given chain and cannot be
    /// registered again without first removing the existing entry.
    DWalletAlreadyRegistered(Chain),
    /// The policy graph name on the pending transaction does not match the
    /// graph name recorded in the confidential guardrails configuration.
    PolicyGraphMismatch,
    /// The policy output digest stored on the pending transaction does not
    /// match the digest recomputed from the decrypted decision.
    PolicyDigestMismatch,
    /// The Encrypt decryption request has not yet been fulfilled by the network.
    DecryptionNotReady,
    /// The dWallet `MessageApproval` account has not yet been signed by the network.
    MessageApprovalNotReady,
    /// A signature or digest comparison failed during finalization.
    SignatureVerificationFailed,
    /// A program ID supplied at runtime does not match the expected value.
    InvalidProgramId(String),
    /// An RPC or service endpoint is malformed or not reachable.
    InvalidEndpoint(String),
    /// An external account's byte layout or field values are unexpected.
    /// Carries a detail string identifying the offending field or account.
    InvalidAccountData(String),
    /// `execute_pending` was called but no confidential guardrails have been
    /// configured on this treasury.
    ConfidentialGuardrailsNotConfigured,
    /// The Encrypt ciphertext output account has not yet been written by the network.
    PolicyOutputNotReady,
    /// The treasury owner has paused execution; no proposals can be executed.
    ExecutionPaused,
    /// The pending transaction's TTL elapsed before it could be executed.
    PendingTransactionExpired,
    /// An operation requires an active override proposal but none exists.
    NoActiveOverride,
}

impl Display for TreasuryError {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::UnauthorizedAi => write!(f, "unauthorized ai signer"),
            Self::UnauthorizedOwner => write!(f, "unauthorized owner"),
            Self::UnauthorizedGuardian => write!(f, "unauthorized guardian"),
            Self::PendingTransactionExists => write!(f, "pending transaction already exists"),
            Self::NoPendingTransaction => write!(f, "no pending transaction"),
            Self::DWalletNotConfigured(chain) => write!(f, "dwallet not configured for {chain}"),
            Self::DWalletAlreadyRegistered(chain) => {
                write!(f, "dwallet already configured for {chain}")
            }
            Self::PolicyGraphMismatch => write!(f, "policy graph mismatch during decryption"),
            Self::PolicyDigestMismatch => write!(f, "policy digest mismatch during verification"),
            Self::DecryptionNotReady => write!(f, "decryption result is not ready yet"),
            Self::MessageApprovalNotReady => {
                write!(f, "message approval signature is not ready yet")
            }
            Self::SignatureVerificationFailed => write!(f, "signature verification failed"),
            Self::InvalidProgramId(detail) => write!(f, "invalid program id: {detail}"),
            Self::InvalidEndpoint(detail) => write!(f, "invalid endpoint: {detail}"),
            Self::InvalidAccountData(detail) => {
                write!(f, "invalid external account data: {detail}")
            }
            Self::ConfidentialGuardrailsNotConfigured => {
                write!(f, "confidential guardrails are not configured")
            }
            Self::PolicyOutputNotReady => write!(f, "encrypted policy output is not ready yet"),
            Self::ExecutionPaused => write!(f, "treasury execution is paused"),
            Self::PendingTransactionExpired => write!(f, "pending transaction expired"),
            Self::NoActiveOverride => write!(f, "no active override"),
        }
    }
}

impl std::error::Error for TreasuryError {}
