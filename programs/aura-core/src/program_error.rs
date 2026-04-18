use anchor_lang::prelude::*;

use crate::TreasuryError;

/// Anchor `#[error_code]` enum for `aura-core`.
///
/// These are the on-chain error codes returned to clients. Each variant maps
/// to one or more `TreasuryError` variants via `map_treasury_error`. The
/// `#[msg]` strings are what appear in transaction logs and client SDKs.
///
/// Variants that have no direct `TreasuryError` counterpart (e.g.
/// `InvalidChain`, `InvalidCurve`) are produced by the serialization layer
/// in `program_accounts/` when decoding stored `u8` codes.
#[error_code]
pub enum AuraCoreError {
    #[msg("unauthorized ai signer")]
    UnauthorizedAi,
    #[msg("unauthorized owner")]
    UnauthorizedOwner,
    #[msg("unauthorized guardian")]
    UnauthorizedGuardian,
    #[msg("unauthorized executor")]
    UnauthorizedExecutor,
    #[msg("pending transaction already exists")]
    PendingTransactionExists,
    #[msg("no pending transaction")]
    NoPendingTransaction,
    #[msg("dwallet not configured for requested chain")]
    DWalletNotConfigured,
    #[msg("dwallet already registered for requested chain")]
    DWalletAlreadyRegistered,
    #[msg("policy graph mismatch")]
    PolicyGraphMismatch,
    #[msg("policy digest mismatch")]
    PolicyDigestMismatch,
    #[msg("decryption result is not ready")]
    DecryptionNotReady,
    #[msg("message approval is not ready")]
    MessageApprovalNotReady,
    #[msg("signature verification failed")]
    SignatureVerificationFailed,
    #[msg("invalid deployment configuration")]
    InvalidDeployment,
    #[msg("invalid external account data")]
    InvalidExternalAccountData,
    #[msg("confidential guardrails are not configured")]
    ConfidentialGuardrailsNotConfigured,
    #[msg("encrypted policy output is not ready yet")]
    PolicyOutputNotReady,
    #[msg("execution is paused")]
    ExecutionPaused,
    #[msg("pending transaction expired")]
    PendingTransactionExpired,
    #[msg("no active override")]
    NoActiveOverride,
    #[msg("invalid chain value")]
    InvalidChain,
    #[msg("invalid transaction type value")]
    InvalidTransactionType,
    #[msg("invalid curve value")]
    InvalidCurve,
    #[msg("invalid signature scheme value")]
    InvalidSignatureScheme,
    #[msg("invalid violation code")]
    InvalidViolationCode,
    #[msg("invalid proposal status")]
    InvalidProposalStatus,
    #[msg("invalid guardian configuration")]
    InvalidGuardianConfiguration,
}

/// Converts a `TreasuryError` from the domain layer into an Anchor `Error`.
///
/// Called at the boundary between domain functions (which return
/// `TreasuryError`) and Anchor instruction handlers (which return
/// `anchor_lang::Result`). Chain and detail information carried by
/// `TreasuryError` variants is dropped here — it was already recorded in
/// the audit trail before the error propagated.
pub fn map_treasury_error(error: TreasuryError) -> anchor_lang::error::Error {
    match error {
        TreasuryError::UnauthorizedAi => error!(AuraCoreError::UnauthorizedAi),
        TreasuryError::UnauthorizedOwner => error!(AuraCoreError::UnauthorizedOwner),
        TreasuryError::UnauthorizedGuardian => error!(AuraCoreError::UnauthorizedGuardian),
        TreasuryError::PendingTransactionExists => error!(AuraCoreError::PendingTransactionExists),
        TreasuryError::NoPendingTransaction => error!(AuraCoreError::NoPendingTransaction),
        TreasuryError::DWalletNotConfigured(_) => error!(AuraCoreError::DWalletNotConfigured),
        TreasuryError::DWalletAlreadyRegistered(_) => {
            error!(AuraCoreError::DWalletAlreadyRegistered)
        }
        TreasuryError::PolicyGraphMismatch => error!(AuraCoreError::PolicyGraphMismatch),
        TreasuryError::PolicyDigestMismatch => error!(AuraCoreError::PolicyDigestMismatch),
        TreasuryError::DecryptionNotReady => error!(AuraCoreError::DecryptionNotReady),
        TreasuryError::MessageApprovalNotReady => error!(AuraCoreError::MessageApprovalNotReady),
        TreasuryError::SignatureVerificationFailed => {
            error!(AuraCoreError::SignatureVerificationFailed)
        }
        TreasuryError::InvalidProgramId(_) | TreasuryError::InvalidEndpoint(_) => {
            error!(AuraCoreError::InvalidDeployment)
        }
        TreasuryError::InvalidAccountData(_) => error!(AuraCoreError::InvalidExternalAccountData),
        TreasuryError::ConfidentialGuardrailsNotConfigured => {
            error!(AuraCoreError::ConfidentialGuardrailsNotConfigured)
        }
        TreasuryError::PolicyOutputNotReady => error!(AuraCoreError::PolicyOutputNotReady),
        TreasuryError::ExecutionPaused => error!(AuraCoreError::ExecutionPaused),
        TreasuryError::PendingTransactionExpired => {
            error!(AuraCoreError::PendingTransactionExpired)
        }
        TreasuryError::NoActiveOverride => error!(AuraCoreError::NoActiveOverride),
    }
}
