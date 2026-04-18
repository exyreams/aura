use std::fmt::{Display, Formatter};

/// The reason a policy evaluation denied a transaction.
///
/// Stored in `PolicyDecision::violation` and serialized as a `u8` in the
/// on-chain account. `None` means the transaction was approved. The
/// `Display` implementation produces the snake_case label used in audit
/// events and program logs.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum ViolationCode {
    /// Transaction was approved; no rule failed.
    None,
    /// Amount exceeded `per_tx_limit_usd`.
    PerTransactionLimit,
    /// Projected daily spend would exceed the effective daily limit.
    DailyLimit,
    /// Bitcoin transaction exceeded `bitcoin_manual_review_threshold_usd`.
    BitcoinManualReview,
    /// Projected hourly spend would exceed the active hourly limit.
    TimeWindowLimit,
    /// Recent-amounts velocity window sum would exceed `velocity_limit_usd`.
    VelocityLimit,
    /// Protocol ID is not set in `allowed_protocol_bitmap`.
    ProtocolNotAllowed,
    /// Computed slippage exceeded `max_slippage_bps`.
    SlippageExceeded,
    /// Quote age exceeded `max_quote_age_secs`.
    QuoteStale,
    /// Counterparty risk score exceeded `max_counterparty_risk_score`.
    CounterpartyRisk,
    /// Projected swarm pool spend would exceed `shared_pool_limit_usd`.
    SharedPoolLimit,
}

impl Display for ViolationCode {
    fn fmt(&self, f: &mut Formatter<'_>) -> std::fmt::Result {
        let label = match self {
            Self::None => "none",
            Self::PerTransactionLimit => "per_transaction_limit",
            Self::DailyLimit => "daily_limit",
            Self::BitcoinManualReview => "bitcoin_manual_review",
            Self::TimeWindowLimit => "time_window_limit",
            Self::VelocityLimit => "velocity_limit",
            Self::ProtocolNotAllowed => "protocol_not_allowed",
            Self::SlippageExceeded => "slippage_exceeded",
            Self::QuoteStale => "quote_stale",
            Self::CounterpartyRisk => "counterparty_risk",
            Self::SharedPoolLimit => "shared_pool_limit",
        };

        write!(f, "{label}")
    }
}
