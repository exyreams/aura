/// Compact per-recipient mutable spend counter.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub struct RecipientSpendRecord {
    pub chain_code: u8,
    pub address_hash: [u8; 8],
    pub spent_today_usd: u64,
    pub last_reset_at: i64,
}

/// Mutable spending counters for one agent treasury.
///
/// Updated by the policy engine on every approved transaction and committed
/// to the on-chain account via `PolicyDecision::next_state`. All fields
/// default to `0`; `normalize_state` treats zero timestamps as uninitialized
/// and sets them to the current time on first use.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Default)]
pub struct PolicyState {
    /// Total USD spent in the current 24-hour rolling window.
    pub spent_today_usd: u64,
    /// Unix timestamp when the current daily window started (or 0 if uninitialized).
    pub last_reset_timestamp: i64,
    /// Total USD spent in the current 1-hour rolling window.
    pub hourly_spent_usd: u64,
    /// Unix timestamp when the current hourly bucket started (or 0 if uninitialized).
    pub hourly_bucket_started_at: i64,
    /// Amounts of the most recent approved transactions, capped at 10 entries.
    /// Used by the velocity limit rule.
    pub recent_amounts: Vec<u64>,
    /// Seven daily buckets in a circular window. The current day is
    /// `daily_bucket_head`.
    pub daily_buckets: [u64; 7],
    /// Index of the active daily bucket.
    pub daily_bucket_head: u8,
    /// Unix timestamp when the active 7-day bucket started.
    pub seven_day_window_started_at: i64,
    /// Aggregate spend in the current 30-day window.
    pub thirty_day_spent_usd: u64,
    /// Unix timestamp when the current 30-day window started.
    pub thirty_day_window_started_at: i64,
    /// Largest single transaction observed in the current schema.
    pub peak_single_tx_usd: u64,
    /// Largest single-day spend observed in the current schema.
    pub peak_day_spend_usd: u64,
    /// Per-recipient spend counters keyed by compact address hash.
    pub recipient_spend: Vec<RecipientSpendRecord>,
    /// USD passed via Warn/Degrade in the current fail-open window.
    pub fail_open_spent_usd: u64,
    /// Count of softened transactions in the current fail-open window.
    pub fail_open_count: u16,
    /// Unix timestamp when the current fail-open window started (0 if uninitialized).
    pub fail_open_window_start: i64,
}

impl PolicyState {
    /// Rolls the fail-open window if `window_secs` has elapsed, returning the
    /// in-window `(spent_usd, count)` to test new softening against.
    pub fn fail_open_window(&mut self, now: i64, window_secs: i64) -> (u64, u16) {
        if self.fail_open_window_start == 0 {
            self.fail_open_window_start = now;
        } else if window_secs > 0 && now.saturating_sub(self.fail_open_window_start) >= window_secs
        {
            self.fail_open_spent_usd = 0;
            self.fail_open_count = 0;
            self.fail_open_window_start = now;
        }
        (self.fail_open_spent_usd, self.fail_open_count)
    }

    /// Records a softened (Warn/Degrade) pass against the fail-open budget.
    pub fn record_fail_open(&mut self, amount_usd: u64) {
        self.fail_open_spent_usd = self.fail_open_spent_usd.saturating_add(amount_usd);
        self.fail_open_count = self.fail_open_count.saturating_add(1);
    }
}

impl PolicyState {
    pub fn seven_day_total(&self) -> u64 {
        self.daily_buckets
            .iter()
            .fold(0u64, |acc, value| acc.saturating_add(*value))
    }

    pub fn advance_daily_bucket(&mut self, now: i64) {
        self.daily_bucket_head = (self.daily_bucket_head + 1) % 7;
        self.daily_buckets[self.daily_bucket_head as usize] = 0;
        self.seven_day_window_started_at = now;
    }

    pub fn record_spend(&mut self, amount_usd: u64) {
        let head = self.daily_bucket_head as usize;
        self.daily_buckets[head] = self.daily_buckets[head].saturating_add(amount_usd);
        self.thirty_day_spent_usd = self.thirty_day_spent_usd.saturating_add(amount_usd);
        self.peak_single_tx_usd = self.peak_single_tx_usd.max(amount_usd);
        self.peak_day_spend_usd = self.peak_day_spend_usd.max(self.daily_buckets[head]);
    }
}
