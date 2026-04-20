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
}
