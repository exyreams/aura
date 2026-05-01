/// Policy evaluation engine for `aura-policy`.
///
/// Exposes three entry points:
/// - `evaluate_transaction`       — full rule set for public (non-confidential) proposals
/// - `evaluate_public_precheck`   — subset of rules safe to run publicly before FHE evaluation;
///   skips per-tx and daily limits (those are checked by Encrypt)
/// - `evaluate_transaction_simple` — convenience wrapper for tests and off-chain tooling
/// - `evaluate_batch`             — evaluates a slice of transactions sequentially, threading
///   state forward between each decision
mod batch;
pub mod batch_policy;
mod evaluator;
pub mod simulation;

pub use batch::evaluate_batch;
pub use batch_policy::{evaluate_batch_policy, BatchPolicyDecision, BatchProposalItem};
pub use evaluator::{
    compute_regulatory_flags, evaluate_public_precheck, evaluate_transaction,
    evaluate_transaction_simple, REG_FLAG_CROSS_BORDER, REG_FLAG_CTR_THRESHOLD,
    REG_FLAG_HIGH_RISK_COUNTERPARTY, REG_FLAG_REQUIRES_KYC,
};
pub use simulation::evaluate_policy_without_spend_mutation;
