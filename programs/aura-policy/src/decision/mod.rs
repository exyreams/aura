/// Output types produced by the policy engine.
///
/// - `PolicyDecision` — the full result of evaluating one transaction
/// - `RuleOutcome`    — a single rule's pass/fail result within a decision trace
mod policy_decision;
mod rule_outcome;

pub use policy_decision::PolicyDecision;
pub use rule_outcome::RuleOutcome;
