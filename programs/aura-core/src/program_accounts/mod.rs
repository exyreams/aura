/// On-chain account serialization layer for ura-core.
///
/// This module is intentionally split by persistence boundary: the treasury
/// root account, flat record codecs, auxiliary PDA accounts, and conversion
/// helpers live in separate files while this index preserves the historical
/// crate::program_accounts::* import surface.
use std::{collections::BTreeMap, str::FromStr};

use anchor_lang::prelude::*;
use aura_policy::{
    AnomalyAction, AnomalyConfig, Chain, CooldownConfig, PolicyConfig, PolicyDecision, PolicyState,
    RecipientLimit, RecipientSpendRecord, ReputationPolicy, RiskFactor, RuleOutcome,
    TransactionType, ViolationCode,
};

use crate::{
    audit::{AuditEvent, AuditKind},
    governance::{EmergencyMultisig, OverrideProposal},
    program_error::{map_treasury_error, AuraCoreError},
    state::{
        AgentLifecycleState, AgentReputation, AgentSwarm, AgentTreasury, CircuitBreakerConfig,
        CircuitBreakerState, ComplianceMetadata, ConfidentialGuardrails, ConfigChangeKind,
        DWalletCurve, DWalletReference, DeadMansSwitch, GuardianChangeAction, PendingAiRotation,
        PendingConfigChange, PendingDecryptionRequest, PendingGuardianChange,
        PendingSignatureRequest, PendingTransaction, ProposalStatus, ProtocolDeployment,
        ProtocolFees, SignatureScheme,
    },
};

mod auxiliary_accounts;
mod codecs;
mod governance_records;
mod pending_records;
mod policy_records;
mod treasury;
mod treasury_records;
mod wallet_records;

pub use auxiliary_accounts::*;
pub use codecs::*;
pub use governance_records::*;
pub use pending_records::*;
pub use policy_records::*;
pub use treasury::*;
pub use treasury_records::*;
pub use wallet_records::*;

#[cfg(test)]
mod tests;
