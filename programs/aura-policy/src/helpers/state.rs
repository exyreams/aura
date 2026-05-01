use crate::state::PolicyState;

const DAY_SECS: i64 = 86_400;
const HOUR_SECS: i64 = 3_600;
const THIRTY_DAYS_SECS: i64 = 30 * DAY_SECS;

/// Returns a copy of `previous_state` with daily and hourly counters reset
/// if their respective windows have elapsed.
///
/// - Daily window: 86,400 seconds. If `now - last_reset_timestamp ≥ 86_400`,
///   `spent_today_usd` is zeroed and `last_reset_timestamp` is set to `now`.
///   The 7-day bucket head advances at the same boundary.
/// - Hourly window: 3,600 seconds. If `now - hourly_bucket_started_at ≥ 3_600`,
///   `hourly_spent_usd` is zeroed and `hourly_bucket_started_at` is set to `now`.
/// - Thirty-day aggregate window resets after 30 days.
/// - Zero timestamps are treated as uninitialized and set to `now` on first call.
pub fn normalize_state(previous_state: &PolicyState, now: i64) -> PolicyState {
    let mut state = previous_state.clone();

    if state.last_reset_timestamp == 0 {
        state.last_reset_timestamp = now;
    }

    if state.seven_day_window_started_at == 0 {
        state.seven_day_window_started_at = state.last_reset_timestamp;
    }

    if state.thirty_day_window_started_at == 0 {
        state.thirty_day_window_started_at = now;
    }

    if state.hourly_bucket_started_at == 0 {
        state.hourly_bucket_started_at = now;
    }

    let elapsed_days = now.saturating_sub(state.last_reset_timestamp) / DAY_SECS;
    if elapsed_days > 0 {
        state.spent_today_usd = 0;
        state.last_reset_timestamp = now;
        for _ in 0..elapsed_days.min(7) {
            state.advance_daily_bucket(now);
        }
    }

    if now.saturating_sub(state.thirty_day_window_started_at) >= THIRTY_DAYS_SECS {
        state.thirty_day_spent_usd = 0;
        state.thirty_day_window_started_at = now;
    }

    if now.saturating_sub(state.hourly_bucket_started_at) >= HOUR_SECS {
        state.hourly_spent_usd = 0;
        state.hourly_bucket_started_at = now;
    }

    reset_recipient_windows(&mut state, now);

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

/// Deterministic compact hash used for per-recipient state lookup.
pub fn address_hash(address: &str) -> [u8; 8] {
    let mut hash = 0xcbf2_9ce4_8422_2325u64;
    for byte in address.as_bytes() {
        hash ^= u64::from(*byte);
        hash = hash.wrapping_mul(0x0000_0100_0000_01b3);
    }
    hash.to_le_bytes()
}

/// Resets per-recipient daily counters whose windows have elapsed.
pub fn reset_recipient_windows(state: &mut PolicyState, now: i64) {
    for recipient in &mut state.recipient_spend {
        if recipient.last_reset_at == 0 {
            recipient.last_reset_at = now;
        }

        if now.saturating_sub(recipient.last_reset_at) >= DAY_SECS {
            recipient.spent_today_usd = 0;
            recipient.last_reset_at = now;
        }
    }
}
