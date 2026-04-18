use super::reputation::ReputationPolicy;

/// The complete set of spending rules configured on an agent treasury.
///
/// All monetary values are in USD. The default configuration is conservative:
/// $10k daily, $1k per transaction, with slippage and quote-age guards enabled.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyConfig {
    /// Maximum total USD the agent may spend in a 24-hour rolling window.
    pub daily_limit_usd: u64,
    /// Maximum USD for a single transaction.
    pub per_tx_limit_usd: u64,
    /// Maximum USD per hour during daytime (06:00–22:00 UTC).
    pub daytime_hourly_limit_usd: u64,
    /// Maximum USD per hour during nighttime (22:00–06:00 UTC).
    pub nighttime_hourly_limit_usd: u64,
    /// Maximum total USD across the recent-amounts velocity window.
    pub velocity_limit_usd: u64,
    /// Bitmask of allowed DeFi protocol IDs. Bit `n` set means protocol `n` is allowed.
    pub allowed_protocol_bitmap: u64,
    /// Maximum acceptable slippage in basis points (100 bps = 1%).
    pub max_slippage_bps: u64,
    /// Maximum age of a price quote in seconds before it is considered stale.
    /// `None` disables the quote-freshness check.
    pub max_quote_age_secs: Option<u64>,
    /// Maximum counterparty risk score (0–100) allowed without denial.
    /// `None` disables the counterparty risk check.
    pub max_counterparty_risk_score: Option<u8>,
    /// Bitcoin transactions above this USD threshold require manual review.
    pub bitcoin_manual_review_threshold_usd: u64,
    /// Maximum total USD that all swarm members may spend collectively.
    /// `None` means no swarm pool limit is enforced.
    pub shared_pool_limit_usd: Option<u64>,
    /// Reputation-based multiplier policy applied to `daily_limit_usd`.
    pub reputation_policy: ReputationPolicy,
}

impl Default for PolicyConfig {
    fn default() -> Self {
        Self {
            daily_limit_usd: 10_000,
            per_tx_limit_usd: 1_000,
            daytime_hourly_limit_usd: 2_500,
            nighttime_hourly_limit_usd: 500,
            velocity_limit_usd: 5_000,
            allowed_protocol_bitmap: 0b1_1111,
            max_slippage_bps: 100,
            max_quote_age_secs: Some(300),
            max_counterparty_risk_score: Some(70),
            bitcoin_manual_review_threshold_usd: 5_000,
            shared_pool_limit_usd: None,
            reputation_policy: ReputationPolicy::default(),
        }
    }
}

impl PolicyConfig {
    /// Returns the effective daily limit after applying the reputation multiplier.
    ///
    /// If `reputation_score` is `None` (no reputation data), the base
    /// `daily_limit_usd` is returned unchanged.
    pub fn effective_daily_limit_usd(&self, reputation_score: Option<u64>) -> u64 {
        let Some(score) = reputation_score else {
            return self.daily_limit_usd;
        };

        self.daily_limit_usd
            .saturating_mul(self.reputation_policy.multiplier_bps(score))
            / 10_000
    }
}
