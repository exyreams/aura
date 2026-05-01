use crate::{state::PolicyState, violations::ViolationCode};

use super::rule_outcome::RuleOutcome;

/// One signal contributing to a composite transaction risk score.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RiskFactor {
    pub name: String,
    pub contribution: u8,
    pub detail: String,
}

/// The result of evaluating a transaction against the policy engine.
///
/// Returned by `evaluate_transaction`, `evaluate_public_precheck`, and
/// `evaluate_transaction_simple`. Stored on `PendingTransaction` and later
/// used by `finalize_signed_pending` to advance the treasury's policy state.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyDecision {
    /// Whether all rules passed and the transaction is approved.
    pub approved: bool,
    /// The first rule that failed; `ViolationCode::None` if approved.
    pub violation: ViolationCode,
    /// The policy state counters that should be committed if the transaction
    /// is executed. Not applied until `finalize_signed_pending` succeeds.
    pub next_state: PolicyState,
    /// The effective daily limit after applying the reputation multiplier,
    /// recorded for audit and receipt purposes.
    pub effective_daily_limit_usd: u64,
    /// Composite risk score from 0 (lowest risk) to 100 (highest risk).
    pub risk_score: u8,
    /// Signals that contributed to `risk_score`.
    pub risk_factors: Vec<RiskFactor>,
    /// Regulatory/compliance bitmask computed from transaction attributes.
    pub regulatory_flags: u8,
    /// Ordered list of rule outcomes, one per rule evaluated.
    pub trace: Vec<RuleOutcome>,
}
