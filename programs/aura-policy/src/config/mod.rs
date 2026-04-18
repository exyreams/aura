/// Policy configuration types for `aura-policy`.
///
/// - `PolicyConfig`     — the full set of spending rules for a treasury
/// - `ReputationPolicy` — thresholds and multipliers for reputation-adjusted limits
mod limits;
mod reputation;

pub use limits::PolicyConfig;
pub use reputation::ReputationPolicy;
