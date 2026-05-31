pub mod approval_ladder;
pub mod conditions;
pub mod envelopes;
pub mod failure_modes;
/// Policy configuration types for `aura-policy`.
///
/// - `PolicyConfig`     — the full set of spending rules for a treasury
/// - `ReputationPolicy` — thresholds and multipliers for reputation-adjusted limits
mod limits;
pub mod liveness;
pub mod presets;
mod reputation;
pub mod scoped_pause;
mod validate;

pub use approval_ladder::{required_approval_level, ApprovalLadder, ApprovalLevel};
pub use conditions::{
    evaluate_conditions, Condition, ConditionCombinator, ConditionContext, ConditionKind,
};
pub use envelopes::{BudgetEnvelope, BudgetEnvelopeScope, BudgetEnvelopeSet};
pub use failure_modes::{CheckMode, FailureModeConfig, SoftenableCheck};
pub use limits::{
    AnomalyAction, AnomalyConfig, CooldownConfig, PolicyConfig, RecipientLimit,
    TransactionTypeScope,
};
pub use liveness::{is_fresh, ExternalDependency, LivenessConfig};
pub use presets::{build_policy_preset, PolicyPresetKind};
pub use reputation::ReputationPolicy;
pub use scoped_pause::{PauseScope, ScopedPauseControls, ScopedPauseEntry};
pub use validate::{validate_policy_config, PolicyConfigInvariant};
