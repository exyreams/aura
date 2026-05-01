/// Pure utility functions used by the policy engine.
///
/// - `protocol_allowed`   — bitmap check for DeFi protocol whitelisting
/// - `slippage_bps`       — computes slippage in basis points from expected/actual output
/// - `normalize_state`    — resets daily/hourly counters when their windows have elapsed
/// - `push_recent_amount` — appends to the velocity window, capping at 10 entries
/// - `active_hourly_limit` — selects daytime or nighttime hourly limit based on UTC hour
mod anomaly;
mod bitmap;
pub mod diff;
pub mod hash;
mod math;
mod state;
mod time;

pub use anomaly::{compute_stats_integer, isqrt, z_score_bps};
pub use bitmap::protocol_allowed;
pub use diff::{diff_policy_config, PolicyConfigDiff};
pub use hash::{confidential_commitment, policy_config_hash};
pub use math::slippage_bps;
pub use state::{address_hash, normalize_state, push_recent_amount, reset_recipient_windows};
pub use time::active_hourly_limit;
