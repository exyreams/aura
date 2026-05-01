pub mod approval_ladder;
pub mod envelopes;
/// Policy configuration types for `aura-policy`.
///
/// - `PolicyConfig`     — the full set of spending rules for a treasury
/// - `ReputationPolicy` — thresholds and multipliers for reputation-adjusted limits
mod limits;
pub mod liveness;
pub mod presets;
mod reputation;
pub mod scoped_pause;

pub use approval_ladder::{required_approval_level, ApprovalLadder, ApprovalLevel};
pub use envelopes::{BudgetEnvelope, BudgetEnvelopeScope, BudgetEnvelopeSet};
pub use limits::{
    AnomalyAction, AnomalyConfig, CooldownConfig, PolicyConfig, RecipientLimit,
    TransactionTypeScope,
};
pub use liveness::{is_fresh, ExternalDependency, LivenessConfig};
pub use presets::{build_policy_preset, PolicyPresetKind};
pub use reputation::ReputationPolicy;
pub use scoped_pause::{PauseScope, ScopedPauseControls, ScopedPauseEntry};
