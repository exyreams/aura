//! On-chain program error codes for `aura-core`.
//!
//! The program defines all failures in its Anchor `#[error_code]` enum,
//! [`AuraCoreError`], which is re-exported here. Anchor assigns each variant a
//! numeric code starting at [`AURA_ERROR_CODE_OFFSET`] (6000); those are the
//! `custom program error` codes returned in failed transactions.
//!
//! This module exposes a lookup table ([`AURA_PROGRAM_ERRORS`]) plus helpers to
//! turn a raw transaction failure into a typed [`AuraProgramError`]:
//!
//! ```rust
//! use aura_sdk::program_errors::{program_error_by_code, AuraCoreError};
//!
//! let info = program_error_by_code(6001).unwrap();
//! assert_eq!(info.name, "UnauthorizedOwner");
//! assert_eq!(info.code, AuraCoreError::UnauthorizedOwner as u32 + 6000);
//! ```
//!
//! Unlike a hand-maintained list, the `code` of every entry is computed from
//! the real [`AuraCoreError`] variant, and the table references each variant by
//! name — so a renamed or removed program error fails to compile here.

pub use aura_core::AuraCoreError;

use crate::SdkError;

/// Anchor's base offset for user-defined `#[error_code]` errors.
pub const AURA_ERROR_CODE_OFFSET: u32 = 6000;

/// A single `aura-core` program error, resolved to its on-chain code, variant
/// name, and human-readable message.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AuraProgramError {
    /// On-chain custom error code (6000-based).
    pub code: u32,
    /// `AuraCoreError` variant name.
    pub name: &'static str,
    /// Human-readable message (the program's `#[msg(...)]` text).
    pub message: &'static str,
}

impl std::fmt::Display for AuraProgramError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{} ({}): {}", self.name, self.code, self.message)
    }
}

macro_rules! program_errors {
    ($($variant:ident => $message:literal),* $(,)?) => {
        /// Every `aura-core` program error, ordered by code.
        ///
        /// `code` is derived from the live [`AuraCoreError`] enum, so it can
        /// never drift from the deployed program's numbering.
        pub const AURA_PROGRAM_ERRORS: &[AuraProgramError] = &[
            $(
                AuraProgramError {
                    code: AuraCoreError::$variant as u32 + AURA_ERROR_CODE_OFFSET,
                    name: stringify!($variant),
                    message: $message,
                },
            )*
        ];
    };
}

program_errors! {
    UnauthorizedAi => "unauthorized ai signer",
    UnauthorizedOwner => "unauthorized owner",
    UnauthorizedGuardian => "unauthorized guardian",
    UnauthorizedExecutor => "unauthorized executor",
    PendingTransactionExists => "pending transaction already exists",
    NoPendingTransaction => "no pending transaction",
    DWalletNotConfigured => "dwallet not configured for requested chain",
    DWalletAlreadyRegistered => "dwallet already registered for requested chain",
    PolicyGraphMismatch => "policy graph mismatch",
    PolicyDigestMismatch => "policy digest mismatch",
    DecryptionNotReady => "decryption result is not ready",
    MessageApprovalNotReady => "message approval is not ready",
    SignatureVerificationFailed => "signature verification failed",
    InvalidDeployment => "invalid deployment configuration",
    InvalidExternalAccountData => "invalid external account data",
    ConfidentialGuardrailsNotConfigured => "confidential guardrails are not configured",
    PolicyOutputNotReady => "encrypted policy output is not ready yet",
    PolicyOutputAlreadyComputed => "encrypted policy output has already been computed",
    ExecutionPaused => "execution is paused",
    PendingTransactionExpired => "pending transaction expired",
    NoActiveOverride => "no active override",
    InvalidChain => "invalid chain value",
    InvalidTransactionType => "invalid transaction type value",
    InvalidCurve => "invalid curve value",
    InvalidSignatureScheme => "invalid signature scheme value",
    InvalidViolationCode => "invalid violation code",
    InvalidProposalStatus => "invalid proposal status",
    InvalidGuardianConfiguration => "invalid guardian configuration",
    TimelockNotElapsed => "timelock period has not elapsed yet",
    SanctionedAddress => "recipient address is on the sanctions list",
    RecipientBlacklisted => "recipient address is blacklisted",
    RecipientNotWhitelisted => "recipient address is not on the whitelist",
    CooldownNotElapsed => "cooldown period between large transactions has not elapsed",
    HighRiskTransactionRequiresGuardian => "high risk transaction requires guardian co-signature",
    InvalidStateTransition => "invalid agent state transition",
    ParentLimitExceeded => "parent treasury limit exceeded",
    AnomalyDetected => "anomaly detected in transaction pattern",
    SessionKeyInactive => "session key expired or revoked",
    SessionKeyScopeViolation => "session key scope does not allow this proposal",
    AccountStillActive => "account cannot be closed while still active",
    BudgetEnvelopeLimitExceeded => "budget envelope limit exceeded",
    ApprovalLevelNotSatisfied => "approval ladder level has not been satisfied",
    PendingExecutionTimelockActive => "pending execution timelock is still active",
    ExecutionScopePaused => "execution scope is paused",
    OperatorRoleMissing => "operator role is missing required permission",
    OperatorRoleExpired => "operator role has expired or was revoked",
    ExternalDependencyStale => "external dependency freshness check failed",
    InvalidPolicyPreset => "policy preset kind is invalid",
    PolicyAttestationMismatch => "policy attestation hash or version mismatch",
    EmptyBatch => "batch proposal cannot be empty",
    BatchTooLarge => "batch proposal exceeds maximum item count",
    ExposureGroupLimitExceeded => "cross-treasury exposure group limit exceeded",
    ExposureGroupUnauthorized => "treasury is not a member of the exposure group",
    BudgetEnvelopeNotFound => "budget envelope not found for the requested scope",
    BudgetEnvelopeInUse => "budget envelope is referenced by an active pending proposal",
    ExposureGroupNotEmpty => "exposure group still has members",
    SwarmNotEmpty => "swarm still has members",
    SwarmPoolUnsettled => "swarm pool balance is not settled",
    LivenessGateActive => "liveness dependency is an active hard gate on policy",
    RecipientLimitNotFound => "recipient limit not found for the requested chain and address",
    AddressListEntryNotFound => "address list entry not found",
    DWalletNotActive => "dwallet is not active",
    DWalletFrozen => "dwallet is frozen",
    DWalletHasActiveProposal => "dwallet has an active pending proposal on this chain",
    DWalletLimitExceeded => "per-wallet spending limit exceeded",
    DWalletNotEmpty => "dwallet still holds a balance",
    DefaultChainInUse => "default chain is in use",
    AssetNotTracked => "asset is not tracked on this dwallet",
    InsufficientWalletBalance => "insufficient available wallet balance",
    BalanceStale => "dwallet balance is stale",
    TooManyAssets => "dwallet asset ledger is full",
    ReservationUnderflow => "attempted to release more than is reserved",
    InvalidTemplateConfig => "policy template config is incoherent",
    TemplateNotShared => "policy template is not shared",
    UnknownPolicyVersion => "parameterized override references an unknown policy field",
    FailOpenBudgetExceeded => "fail-open budget exceeded for a softened check",
    IntentDisabled => "scheduled intent is disabled",
    IntentNotDue => "scheduled intent is not yet due",
    IntentBudgetExhausted => "scheduled intent lifetime budget exhausted",
    IntentRunsExhausted => "scheduled intent run count exhausted",
    IntentExpired => "scheduled intent has expired",
    UnauthorizedKeeper => "caller is not the authorized keeper",
    InvalidIntentConfig => "scheduled intent recurrence or budget is invalid",
    ConditionUnmet => "trigger conditions are not satisfied",
    ConditionExpired => "conditional proposal expired before its conditions were met",
    TooManyConditions => "too many trigger conditions",
    OracleStale => "oracle price feed is stale",
    OracleConfidenceTooWide => "oracle confidence interval is too wide",
    UntrustedOracleProvider => "oracle provider is not trusted",
    TrustedOracleRequired => "a trusted oracle provider is required",
    OracleAccountInvalid => "oracle account is invalid",
    OracleProviderNotAllowed => "oracle provider is not allowed",
    ChainReplayFieldsMissing => "chain replay-protection fields are missing or invalid",
    RecipientAddressInvalidForChain => "recipient address is invalid for the target chain",
    SettlementNotConfirmed => "settlement has not been confirmed",
    SettlementReorged => "settlement was reorged or failed",
    ChainProfileNotRegistered => "chain profile is not registered or enabled",
    TrustLockdownActive => "treasury is in trust lockdown; no proposals may be submitted",
    InvalidTrustPolicy => "trust policy configuration is invalid (thresholds must be monotonic, multipliers <= 1x)",
    TrustRestoreUnauthorized => "caller is not authorized to restore trust",
    SuccessorNotNominated => "no successor owner has been nominated",
    OwnershipHandoverTimelockActive => "ownership handover timelock has not elapsed",
    AgentScopeExceeded => "proposal exceeds what this agent's scope permits",
    AgentDisabled => "agent authority is disabled",
    TooManyAgents => "treasury already has the maximum number of agent authorities",
    UnauthorizedHandover => "caller is not authorized to execute the ownership handover",
    AgentAlreadyRegistered => "an agent with this key is already registered",
    AgentNotFound => "no agent with this key found on the treasury",
    NoRecoveryDestination => "no recovery destination registered for this chain",
    RecoveryTimelockActive => "recovery destination is locked; wait for the timelock to elapse",
    RecoveryPreconditionNotMet => "break-glass preconditions not met: treasury is not in shutdown or activation window has not elapsed",
    RecoveryDestinationImmutable => "recovery destination cannot be changed while an emergency shutdown is active",
    UnauthorizedRecovery => "caller is not authorized to initiate a recovery operation",
    DuplicateApprover => "approver has already approved this proposal",
    ApprovalThresholdNotMet => "multi-party approval quorum has not been reached",
    ApproverNotAuthorized => "signer is neither the owner nor a registered guardian",
    ApprovalWeightInsufficient => "weighted approval quorum has not been reached",
    AgentCapabilityExceeded => "action falls outside the agent's capability manifest",
    ForbiddenInstructionForAgent => "agent attempted a privileged instruction it lacks",
    AgentManifestLoosenTimelock => "manifest loosening attempted before its timelock elapsed",
    InvalidAgentTripwires => "invalid agent tripwire configuration",
    NoCandidatePolicy => "no candidate policy is staged for this treasury",
    CanaryAlreadyActive => "a candidate policy is already being trialed",
    CanarySampleFloorNotMet => "candidate has not collected the required number of samples",
    UnauthorizedProtocolAuthority => "caller is not the protocol authority",
    InvalidProtocolConfig => "protocol configuration values are invalid",
    NoPendingProtocolUpdate => "no protocol configuration update is staged",
    ProtocolUpdateTimelockActive => "protocol configuration update timelock has not elapsed",
    InvalidFeeSchedule => "fee schedule fails coherence validation",
    IntegratorFeeOutOfBounds => "integrator fee is outside the protocol-defined bounds",
    DiscountExceedsProtocolFloor => "discount would reduce the fee below the protocol floor",
    InsufficientFeeBalance => "prepaid fee balance cannot cover the fee",
    FeeSplitsInvalid => "fee splits must sum to 10000 bps",
    FeeConversionUnavailable => "fee conversion is unavailable (oracle stale)",
    FeeDebtOutstanding => "fee debt is outstanding; settle before closing",
    InvalidBillingTemplate => "billing template fails coherence validation",
    OrgProfileComponentMissing => "org profile is missing a required component",
    GuardrailEpochMismatch => "guardrail ciphertexts belong to a stale Encrypt epoch",
    ConfidentialGuardrailsDisabled => "confidential guardrails are disabled",
    GuardrailRotationRequired => "confidential guardrails require rotation before use",
}

/// Looks up a program error by its on-chain code.
pub fn program_error_by_code(code: u32) -> Option<&'static AuraProgramError> {
    AURA_PROGRAM_ERRORS.iter().find(|error| error.code == code)
}

/// Looks up a program error by its `AuraCoreError` variant name.
pub fn program_error_by_name(name: &str) -> Option<&'static AuraProgramError> {
    AURA_PROGRAM_ERRORS.iter().find(|error| error.name == name)
}

/// Extracts a custom program error code from a raw error/log string.
///
/// Recognizes both Solana's `custom program error: 0x<hex>` form and Anchor's
/// `Error Number: <dec>` log line.
pub fn extract_program_error_code(text: &str) -> Option<u32> {
    if let Some(rest) = text.split("custom program error: 0x").nth(1) {
        let hex: String = rest.chars().take_while(|c| c.is_ascii_hexdigit()).collect();
        if let Ok(code) = u32::from_str_radix(&hex, 16) {
            return Some(code);
        }
    }
    if let Some(rest) = text.split("Error Number: ").nth(1) {
        let dec: String = rest.chars().take_while(|c| c.is_ascii_digit()).collect();
        if let Ok(code) = dec.parse::<u32>() {
            return Some(code);
        }
    }
    None
}

/// Resolves a raw error/log string into a typed program error, if it carries a
/// recognized `aura-core` error code.
pub fn parse_program_error_text(text: &str) -> Option<&'static AuraProgramError> {
    extract_program_error_code(text).and_then(program_error_by_code)
}

/// Resolves an [`SdkError`] into the underlying `aura-core` program error, if
/// the failure originated from an on-chain custom error code.
pub fn parse_program_error(error: &SdkError) -> Option<&'static AuraProgramError> {
    match error {
        SdkError::Rpc(client_error) => parse_program_error_text(&client_error.to_string()),
        _ => None,
    }
}

/// Returns `true` if `error` is the given `aura-core` program error code.
pub fn is_program_error(error: &SdkError, code: u32) -> bool {
    parse_program_error(error).is_some_and(|info| info.code == code)
}

impl SdkError {
    /// Returns the underlying `aura-core` program error, if this failure was a
    /// recognized on-chain custom error.
    pub fn program_error(&self) -> Option<&'static AuraProgramError> {
        parse_program_error(self)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn table_is_complete_and_consecutive() {
        assert_eq!(AURA_PROGRAM_ERRORS.len(), 140);
        for (index, error) in AURA_PROGRAM_ERRORS.iter().enumerate() {
            assert_eq!(error.code, AURA_ERROR_CODE_OFFSET + index as u32);
        }
    }

    #[test]
    fn codes_match_the_live_enum() {
        assert_eq!(program_error_by_code(6000).unwrap().name, "UnauthorizedAi");
        assert_eq!(
            program_error_by_code(6001).unwrap().code,
            AuraCoreError::UnauthorizedOwner as u32 + AURA_ERROR_CODE_OFFSET
        );
        assert!(program_error_by_code(5999).is_none());
        assert!(program_error_by_code(9999).is_none());
    }

    #[test]
    fn lookup_by_name_works() {
        let info = program_error_by_name("BatchTooLarge").unwrap();
        assert_eq!(info.message, "batch proposal exceeds maximum item count");
    }

    #[test]
    fn extracts_hex_custom_program_error() {
        // 0x1770 == 6000 == UnauthorizedAi
        let text = "Transaction simulation failed: ... custom program error: 0x1770";
        let info = parse_program_error_text(text).unwrap();
        assert_eq!(info.code, 6000);
        assert_eq!(info.name, "UnauthorizedAi");
    }

    #[test]
    fn extracts_anchor_error_number() {
        let text = "Program log: AnchorError ... Error Number: 6049. Error Message: ...";
        let info = parse_program_error_text(text).unwrap();
        assert_eq!(info.code, 6049);
    }

    #[test]
    fn unrelated_text_yields_none() {
        assert!(extract_program_error_code("blockhash not found").is_none());
        assert!(parse_program_error_text("some other failure").is_none());
    }
}
