/// Unit tests for `aura-policy`.
///
/// - `engine_rules`       — core rule evaluation (per-tx, daily, protocol, slippage, etc.)
/// - `time_and_velocity`  — hourly time-window limits, velocity window, state normalization
/// - `advanced_rules`     — reputation scaling, swarm pool limits, batch evaluation
/// - `confidential_rules` — FHE graph structure, mock execution, public pre-check
mod advanced_rules;
mod confidential_rules;
mod engine_rules;
mod time_and_velocity;
