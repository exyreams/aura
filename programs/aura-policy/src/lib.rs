//! `aura-policy` — the pure Rust policy engine for AURA.
//!
//! This crate is a plain library (no Anchor dependency, no `cdylib`) used by
//! `aura-core` instruction handlers and off-chain tooling. It owns all policy
//! evaluation logic, FHE graph definitions, and the types shared between the
//! on-chain and off-chain layers.
//!
//! ## Module layout
//!
//! - `config/`     — `PolicyConfig` and `ReputationPolicy`
//! - `context/`    — `TransactionContext` and `PolicyEvaluationContext`
//! - `decision/`   — `PolicyDecision` and `RuleOutcome`
//! - `engine/`     — `evaluate_transaction`, `evaluate_public_precheck`, `evaluate_batch`
//! - `graphs/`     — FHE graph specs and compiled graph bytes
//! - `helpers/`    — pure utility functions (bitmap, math, state, time)
//! - `state/`      — `PolicyState` (mutable spending counters)
//! - `types/`      — `Chain` and `TransactionType` enums
//! - `violations/` — `ViolationCode` enum
#![forbid(unsafe_code)]

pub mod config;
pub mod context;
pub mod decision;
pub mod engine;
pub mod graphs;
pub mod helpers;
pub mod state;
pub mod types;
pub mod violations;

pub use config::{
    build_policy_preset, is_fresh, required_approval_level, AnomalyAction, AnomalyConfig,
    ApprovalLadder, ApprovalLevel, BudgetEnvelope, BudgetEnvelopeScope, BudgetEnvelopeSet,
    CooldownConfig, ExternalDependency, LivenessConfig, PauseScope, PolicyConfig, PolicyPresetKind,
    RecipientLimit, ReputationPolicy, ScopedPauseControls, ScopedPauseEntry, TransactionTypeScope,
};
pub use context::{PolicyEvaluationContext, TransactionContext};
pub use decision::{
    explain_decision, rule_outcome_bitmap, PolicyDecision, PolicyDecisionReceiptFields, RiskFactor,
    RuleOutcome,
};
pub use engine::{
    compute_regulatory_flags, evaluate_batch, evaluate_batch_policy,
    evaluate_policy_without_spend_mutation, evaluate_public_precheck, evaluate_transaction,
    BatchPolicyDecision, BatchProposalItem, REG_FLAG_CROSS_BORDER, REG_FLAG_CTR_THRESHOLD,
    REG_FLAG_HIGH_RISK_COUNTERPARTY, REG_FLAG_REQUIRES_KYC,
};
pub use graphs::{
    advanced_policy_graph, batch_policy_graph, confidential_policy_graph,
    confidential_scalar_policy_graph, confidential_spend_guardrails_graph_bytes,
    confidential_spend_guardrails_vector_graph_bytes, execute_confidential_spend_guardrails_graph,
    execute_confidential_spend_guardrails_vector_graph, transaction_policy_graph, PolicyGraphSpec,
};
pub use helpers::{
    active_hourly_limit, confidential_commitment, diff_policy_config, policy_config_hash,
    protocol_allowed, slippage_bps, PolicyConfigDiff,
};
pub use state::{ExposureGroupState, GroupMembership, PolicyState, RecipientSpendRecord};
pub use types::{Chain, TransactionType};
pub use violations::ViolationCode;

#[cfg(test)]
pub mod tests;
