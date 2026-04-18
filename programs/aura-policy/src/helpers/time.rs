use crate::config::PolicyConfig;

/// Returns the active hourly spending limit based on the UTC hour of `current_timestamp`.
///
/// - Hours 22–23 and 0–6 (nighttime) → `nighttime_hourly_limit_usd`
/// - Hours 7–21 (daytime)            → `daytime_hourly_limit_usd`
pub fn active_hourly_limit(config: &PolicyConfig, current_timestamp: i64) -> u64 {
    let hour = current_hour_utc(current_timestamp);

    if hour >= 22 || hour <= 6 {
        config.nighttime_hourly_limit_usd
    } else {
        config.daytime_hourly_limit_usd
    }
}

/// Returns the UTC hour (0–23) for `timestamp` seconds since Unix epoch.
fn current_hour_utc(timestamp: i64) -> i64 {
    let normalized = timestamp.rem_euclid(86_400);
    normalized / 3_600
}
