/// On-chain account serialization layer for `aura-core`.
///
/// This module is intentionally split by persistence boundary: the treasury
/// root account, flat record codecs, auxiliary PDA accounts, and conversion
/// helpers live in separate files while this index preserves the historical
/// crate::program_accounts::* import surface.
use std::{collections::BTreeMap, str::FromStr};

use anchor_lang::prelude::*;
use aura_policy::{
    policy_config_hash, AnomalyAction, AnomalyConfig, ApprovalLadder, BudgetEnvelope,
    BudgetEnvelopeScope, BudgetEnvelopeSet, Chain, CheckMode, Condition, ConditionKind,
    CooldownConfig, FailureModeConfig, LivenessConfig, PauseScope, PolicyConfig, PolicyDecision,
    PolicyState, RecipientLimit, RecipientSpendRecord, ReputationPolicy, RiskFactor, RuleOutcome,
    ScopedPauseControls, ScopedPauseEntry, TransactionType, ViolationCode,
};

use crate::{
    audit::{AuditEvent, AuditKind},
    governance::{EmergencyMultisig, OverrideProposal},
    program_error::{map_treasury_error, AuraCoreError},
    state::{
        AgentAuthority, AgentLifecycleState, AgentReputation, AgentScope, AgentSwarm,
        AgentTreasury, ChainExecutionBinding, CircuitBreakerConfig, CircuitBreakerState,
        ComplianceMetadata, ConfidentialGuardrails, ConfigChangeKind, DWalletCurve,
        DWalletReference, DeadMansSwitch, FeeSchedule, FeeTier, FeeTypeRate, GuardianChangeAction,
        OracleFeed, OracleProvider, PendingAiRotation, PendingConfigChange,
        PendingDecryptionRequest, PendingGuardianChange, PendingOwnershipHandover,
        PendingSignatureRequest, PendingTransaction, ProposalStatus, ProtocolDeployment,
        ProtocolFees, RecoveryDestination, SignatureScheme, TransferDetails,
    },
};

mod analytics_records;
mod attestation_records;
mod auxiliary_accounts;
mod batch_records;
mod chain_profile_records;
mod codecs;
mod conditional_records;
mod confidential_records;
mod envelope_records;
mod fee_schedule_records;
mod governance_records;
mod liveness_records;
mod pending_records;
mod policy_canary_records;
mod policy_records;
mod protocol_config_records;
mod receipt_records;
mod role_records;
mod schedule_records;
mod template_records;
mod treasury;
mod treasury_records;
mod wallet_records;

pub use analytics_records::*;
pub use attestation_records::*;
pub use auxiliary_accounts::*;
pub mod trust_identity;
pub use batch_records::*;
pub use chain_profile_records::*;
pub use codecs::*;
pub use conditional_records::*;
pub use confidential_records::*;
pub use envelope_records::*;
pub use fee_schedule_records::*;
pub use governance_records::*;
pub use liveness_records::*;
pub use pending_records::*;
pub use policy_canary_records::*;
pub use policy_records::*;
pub use protocol_config_records::*;
pub use receipt_records::*;
pub use role_records::*;
pub use schedule_records::*;
pub use template_records::*;
pub use treasury::*;
pub use treasury_records::*;
pub use trust_identity::{TrustIdentityAccount, TRUST_IDENTITY_SPACE};
pub use wallet_records::*;

#[cfg(test)]
mod tests;
