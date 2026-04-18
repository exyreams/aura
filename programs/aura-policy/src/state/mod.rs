/// Mutable policy state counters for `aura-policy`.
///
/// `PolicyState` holds the spending counters that are updated after each
/// approved transaction and persisted in the `TreasuryAccount`. The engine
/// reads these via `normalize_state` (which resets expired windows) and
/// writes the updated values into `PolicyDecision::next_state`.
mod policy_state;

pub use policy_state::PolicyState;
