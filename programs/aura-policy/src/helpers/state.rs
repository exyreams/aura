use crate::state::PolicyState;

/// Returns a copy of `previous_state` with daily and hourly counters reset
/// if their respective windows have elapsed.
///
/// - Daily window: 86,400 seconds. If `now - last_reset_timestamp ≥ 86_400`,
///   `spent_today_usd` is zeroed and `last_reset_timestamp` is set to `now`.
/// - Hourly window: 3,600 seconds. If `now - hourly_bucket_started_at ≥ 3_600`,
///   `hourly_spent_usd` is zeroed and `hourly_bucket_started_at` is set to `now`.
/// - Zero timestamps are treated as uninitialized and set to `now` on first call.
pub fn normalize_state(previous_state: &PolicyState, now: i64) -> PolicyState {
    let mut state = previous_state.clone();

    if state.last_reset_timestamp == 0 {
        state.last_reset_timestamp = now;
    }

    if state.hourly_bucket_started_at == 0 {
        state.hourly_bucket_started_at = now;
    }

    if now.saturating_sub(state.last_reset_timestamp) >= 86_400 {
        state.spent_today_usd = 0;
        state.last_reset_timestamp = now;
    }

    if now.saturating_sub(state.hourly_bucket_started_at) >= 3_600 {
        state.hourly_spent_usd = 0;
        state.hourly_bucket_started_at = now;
    }

    state
}

/// Appends `amount_usd` to the velocity window in `state.recent_amounts`,
/// keeping at most the 10 most recent entries by dropping the oldest.
pub fn push_recent_amount(state: &mut PolicyState, amount_usd: u64) {
    state.recent_amounts.push(amount_usd);

    if state.recent_amounts.len() > 10 {
        let overflow = state.recent_amounts.len() - 10;
        state.recent_amounts.drain(0..overflow);
    }
}
