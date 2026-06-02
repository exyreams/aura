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
    #[msg("encrypted policy output has already been computed")]
    PolicyOutputAlreadyComputed,
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
    #[msg("timelock period has not elapsed yet")]
    TimelockNotElapsed,
    #[msg("recipient address is on the sanctions list")]
    SanctionedAddress,
    #[msg("recipient address is blacklisted")]
    RecipientBlacklisted,
    #[msg("recipient address is not on the whitelist")]
    RecipientNotWhitelisted,
    #[msg("cooldown period between large transactions has not elapsed")]
    CooldownNotElapsed,
    #[msg("high risk transaction requires guardian co-signature")]
    HighRiskTransactionRequiresGuardian,
    #[msg("invalid agent state transition")]
    InvalidStateTransition,
    #[msg("parent treasury limit exceeded")]
    ParentLimitExceeded,
    #[msg("anomaly detected in transaction pattern")]
    AnomalyDetected,
    #[msg("session key expired or revoked")]
    SessionKeyInactive,
    #[msg("session key scope does not allow this proposal")]
    SessionKeyScopeViolation,
    #[msg("account cannot be closed while still active")]
    AccountStillActive,
    #[msg("budget envelope limit exceeded")]
    BudgetEnvelopeLimitExceeded,
    #[msg("approval ladder level has not been satisfied")]
    ApprovalLevelNotSatisfied,
    #[msg("pending execution timelock is still active")]
    PendingExecutionTimelockActive,
    #[msg("execution scope is paused")]
    ExecutionScopePaused,
    #[msg("operator role is missing required permission")]
    OperatorRoleMissing,
    #[msg("operator role has expired or was revoked")]
    OperatorRoleExpired,
    #[msg("external dependency freshness check failed")]
    ExternalDependencyStale,
    #[msg("policy preset kind is invalid")]
    InvalidPolicyPreset,
    #[msg("policy attestation hash or version mismatch")]
    PolicyAttestationMismatch,
    #[msg("batch proposal cannot be empty")]
    EmptyBatch,
    #[msg("batch proposal exceeds maximum item count")]
    BatchTooLarge,
    #[msg("cross-treasury exposure group limit exceeded")]
    ExposureGroupLimitExceeded,
    #[msg("treasury is not a member of the exposure group")]
    ExposureGroupUnauthorized,
    #[msg("budget envelope not found for the requested scope")]
    BudgetEnvelopeNotFound,
    #[msg("budget envelope is referenced by an active pending proposal")]
    BudgetEnvelopeInUse,
    #[msg("exposure group still has members")]
    ExposureGroupNotEmpty,
    #[msg("swarm still has members")]
    SwarmNotEmpty,
    #[msg("swarm pool balance is not settled")]
    SwarmPoolUnsettled,
    #[msg("liveness dependency is an active hard gate on policy")]
    LivenessGateActive,
    #[msg("recipient limit not found for the requested chain and address")]
    RecipientLimitNotFound,
    #[msg("address list entry not found")]
    AddressListEntryNotFound,
    #[msg("dwallet is not active")]
    DWalletNotActive,
    #[msg("dwallet is frozen")]
    DWalletFrozen,
    #[msg("dwallet has an active pending proposal on this chain")]
    DWalletHasActiveProposal,
    #[msg("per-wallet spending limit exceeded")]
    DWalletLimitExceeded,
    #[msg("dwallet still holds a balance")]
    DWalletNotEmpty,
    #[msg("default chain is in use")]
    DefaultChainInUse,
    #[msg("asset is not tracked on this dwallet")]
    AssetNotTracked,
    #[msg("insufficient available wallet balance")]
    InsufficientWalletBalance,
    #[msg("dwallet balance is stale")]
    BalanceStale,
    #[msg("dwallet asset ledger is full")]
    TooManyAssets,
    #[msg("attempted to release more than is reserved")]
    ReservationUnderflow,
    #[msg("policy template config is incoherent")]
    InvalidTemplateConfig,
    #[msg("policy template is not shared")]
    TemplateNotShared,
    #[msg("parameterized override references an unknown policy field")]
    UnknownPolicyVersion,
    #[msg("fail-open budget exceeded for a softened check")]
    FailOpenBudgetExceeded,
    #[msg("scheduled intent is disabled")]
    IntentDisabled,
    #[msg("scheduled intent is not yet due")]
    IntentNotDue,
    #[msg("scheduled intent lifetime budget exhausted")]
    IntentBudgetExhausted,
    #[msg("scheduled intent run count exhausted")]
    IntentRunsExhausted,
    #[msg("scheduled intent has expired")]
    IntentExpired,
    #[msg("caller is not the authorized keeper")]
    UnauthorizedKeeper,
    #[msg("scheduled intent recurrence or budget is invalid")]
    InvalidIntentConfig,
    #[msg("trigger conditions are not satisfied")]
    ConditionUnmet,
    #[msg("conditional proposal expired before its conditions were met")]
    ConditionExpired,
    #[msg("too many trigger conditions")]
    TooManyConditions,
    #[msg("oracle price feed is stale")]
    OracleStale,
    #[msg("oracle confidence interval is too wide")]
    OracleConfidenceTooWide,
    #[msg("oracle provider is not trusted")]
    UntrustedOracleProvider,
    #[msg("a trusted oracle provider is required")]
    TrustedOracleRequired,
    #[msg("oracle account is invalid")]
    OracleAccountInvalid,
    #[msg("oracle provider is not allowed")]
    OracleProviderNotAllowed,
    #[msg("chain replay-protection fields are missing or invalid")]
    ChainReplayFieldsMissing,
    #[msg("recipient address is invalid for the target chain")]
    RecipientAddressInvalidForChain,
    #[msg("settlement has not been confirmed")]
    SettlementNotConfirmed,
    #[msg("settlement was reorged or failed")]
    SettlementReorged,
    #[msg("chain profile is not registered or enabled")]
    ChainProfileNotRegistered,
    #[msg("treasury is in trust lockdown; no proposals may be submitted")]
    TrustLockdownActive,
    #[msg(
        "trust policy configuration is invalid (thresholds must be monotonic, multipliers ≤ 1×)"
    )]
    InvalidTrustPolicy,
    #[msg("caller is not authorized to restore trust")]
    TrustRestoreUnauthorized,
    #[msg("no successor owner has been nominated")]
    SuccessorNotNominated,
    #[msg("ownership handover timelock has not elapsed")]
    OwnershipHandoverTimelockActive,
    #[msg("proposal exceeds what this agent's scope permits")]
    AgentScopeExceeded,
    #[msg("agent authority is disabled")]
    AgentDisabled,
    #[msg("treasury already has the maximum number of agent authorities")]
    TooManyAgents,
    #[msg("caller is not authorized to execute the ownership handover")]
    UnauthorizedHandover,
    #[msg("an agent with this key is already registered")]
    AgentAlreadyRegistered,
    #[msg("no agent with this key found on the treasury")]
    AgentNotFound,
    #[msg("no recovery destination registered for this chain")]
    NoRecoveryDestination,
    #[msg("recovery destination is locked; wait for the timelock to elapse")]
    RecoveryTimelockActive,
    #[msg("break-glass preconditions not met: treasury is not in shutdown or activation window has not elapsed")]
    RecoveryPreconditionNotMet,
    #[msg("recovery destination cannot be changed while an emergency shutdown is active")]
    RecoveryDestinationImmutable,
    #[msg("caller is not authorized to initiate a recovery operation")]
    UnauthorizedRecovery,
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
        TreasuryError::TimelockNotElapsed => error!(AuraCoreError::TimelockNotElapsed),
        TreasuryError::CooldownNotElapsed { .. } => error!(AuraCoreError::CooldownNotElapsed),
        TreasuryError::HighRiskTransactionRequiresGuardian => {
            error!(AuraCoreError::HighRiskTransactionRequiresGuardian)
        }
        TreasuryError::ApprovalLevelNotSatisfied => {
            error!(AuraCoreError::ApprovalLevelNotSatisfied)
        }
        TreasuryError::PendingExecutionTimelockActive => {
            error!(AuraCoreError::PendingExecutionTimelockActive)
        }
        TreasuryError::ExecutionScopePaused => error!(AuraCoreError::ExecutionScopePaused),
        TreasuryError::ExternalDependencyStale => error!(AuraCoreError::ExternalDependencyStale),
        TreasuryError::InvalidStateTransition => error!(AuraCoreError::InvalidStateTransition),
        TreasuryError::ParentLimitExceeded => error!(AuraCoreError::ParentLimitExceeded),
        TreasuryError::RecipientRejected => error!(AuraCoreError::RecipientBlacklisted),
        TreasuryError::AnomalyDetected => error!(AuraCoreError::AnomalyDetected),
        TreasuryError::TrustLockdownActive => error!(AuraCoreError::TrustLockdownActive),
        TreasuryError::InvalidTrustPolicy => error!(AuraCoreError::InvalidTrustPolicy),
        TreasuryError::TrustRestoreUnauthorized => error!(AuraCoreError::TrustRestoreUnauthorized),
        TreasuryError::SuccessorNotNominated => error!(AuraCoreError::SuccessorNotNominated),
        TreasuryError::OwnershipHandoverTimelockActive => {
            error!(AuraCoreError::OwnershipHandoverTimelockActive)
        }
        TreasuryError::AgentScopeExceeded => error!(AuraCoreError::AgentScopeExceeded),
        TreasuryError::AgentDisabled => error!(AuraCoreError::AgentDisabled),
        TreasuryError::TooManyAgents => error!(AuraCoreError::TooManyAgents),
        TreasuryError::UnauthorizedHandover => error!(AuraCoreError::UnauthorizedHandover),
        TreasuryError::AgentAlreadyRegistered => error!(AuraCoreError::AgentAlreadyRegistered),
        TreasuryError::AgentNotFound => error!(AuraCoreError::AgentNotFound),
        TreasuryError::NoRecoveryDestination => error!(AuraCoreError::NoRecoveryDestination),
        TreasuryError::RecoveryTimelockActive => error!(AuraCoreError::RecoveryTimelockActive),
        TreasuryError::RecoveryPreconditionNotMet => {
            error!(AuraCoreError::RecoveryPreconditionNotMet)
        }
        TreasuryError::RecoveryDestinationImmutable => {
            error!(AuraCoreError::RecoveryDestinationImmutable)
        }
        TreasuryError::UnauthorizedRecovery => error!(AuraCoreError::UnauthorizedRecovery),
    }
}
