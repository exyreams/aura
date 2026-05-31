use super::{
    approval_ladder::ApprovalLadder, envelopes::BudgetEnvelopeSet,
    failure_modes::FailureModeConfig, liveness::LivenessConfig, reputation::ReputationPolicy,
    scoped_pause::ScopedPauseControls,
};

use crate::types::{Chain, TransactionType};

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
    /// Optional 7-day aggregate limit using the on-chain rolling daily buckets.
    pub weekly_limit_usd: Option<u64>,
    /// Optional 30-day aggregate limit.
    pub monthly_limit_usd: Option<u64>,
    /// Per-recipient exposure limits for exact chain/address matches.
    pub recipient_limits: Vec<RecipientLimit>,
    /// Optional cooldown rule for large transactions.
    pub cooldown_config: Option<CooldownConfig>,
    /// Optional statistical outlier detection configuration.
    pub anomaly_config: Option<AnomalyConfig>,
    /// Reputation-based multiplier policy applied to `daily_limit_usd`.
    pub reputation_policy: ReputationPolicy,
    /// Optional scoped budget envelopes by chain/category/protocol.
    pub budget_envelopes: BudgetEnvelopeSet,
    /// Optional risk and amount based approval escalation ladder.
    pub approval_ladder: Option<ApprovalLadder>,
    /// Optional scoped pause controls.
    pub scoped_pause: ScopedPauseControls,
    /// External dependency freshness requirements.
    pub liveness_config: LivenessConfig,
    /// Per-check failure handling (Enforce/Warn/Degrade/Skip) + fail-open bounds.
    pub failure_modes: FailureModeConfig,
}

/// Per-recipient exposure rule.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RecipientLimit {
    pub chain: Chain,
    pub address: String,
    pub daily_limit_usd: u64,
    pub per_tx_limit_usd: Option<u64>,
}

/// Minimum delay between transactions at or above `threshold_usd`.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct CooldownConfig {
    pub threshold_usd: u64,
    pub cooldown_secs: i64,
}

/// Action taken when anomaly detection flags an outlier.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AnomalyAction {
    Deny,
    FlagForReview,
    RequireGuardianCosign,
}

/// Integer-only anomaly detection configuration.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct AnomalyConfig {
    pub enabled: bool,
    pub z_score_threshold_bps: u64,
    pub min_sample_size: usize,
    pub action: AnomalyAction,
}

/// Optional transaction type allow-list for delegated/session contexts.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TransactionTypeScope {
    pub allowed_tx_types: Vec<TransactionType>,
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
            weekly_limit_usd: None,
            monthly_limit_usd: None,
            recipient_limits: Vec::new(),
            cooldown_config: None,
            anomaly_config: None,
            reputation_policy: ReputationPolicy::default(),
            budget_envelopes: BudgetEnvelopeSet::default(),
            approval_ladder: None,
            scoped_pause: ScopedPauseControls::default(),
            liveness_config: LivenessConfig::default(),
            failure_modes: FailureModeConfig::default(),
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
