/// Unit tests for `aura-policy`.
///
/// - `engine_rules`       — core rule evaluation (per-tx, daily, protocol, slippage, etc.)
/// - `time_and_velocity`  — hourly time-window limits, velocity window, state normalization
/// - `advanced_rules`     — reputation scaling, swarm pool limits, batch evaluation
/// - `confidential_rules` — FHE graph structure, mock execution, public pre-check
/// - `policy_control_rules` — envelopes, approval ladder, liveness, receipts, presets
mod advanced_rules;
mod confidential_rules;
mod engine_rules;
mod policy_control_rules;
mod time_and_velocity;
