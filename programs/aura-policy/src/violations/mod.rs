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
    /// Projected 7-day spend would exceed `weekly_limit_usd`.
    WeeklyLimit,
    /// Projected 30-day spend would exceed `monthly_limit_usd`.
    MonthlyLimit,
    /// Recipient-specific daily exposure would be exceeded.
    RecipientDailyLimit,
    /// Recipient-specific per-transaction exposure would be exceeded.
    RecipientPerTransactionLimit,
    /// Statistical anomaly detection flagged the amount as an outlier.
    AnomalyDetected,
    /// A cooldown rule blocked a large transaction.
    CooldownNotElapsed,
    /// A scoped budget envelope daily cap would be exceeded.
    BudgetEnvelopeDailyLimit,
    /// A scoped budget envelope weekly cap would be exceeded.
    BudgetEnvelopeWeeklyLimit,
    /// Approval ladder denied the transaction outright.
    ApprovalLadderDenied,
    /// A scoped pause blocked the transaction.
    ExecutionScopePaused,
    /// Required external dependency liveness is stale.
    ExternalDependencyStale,
    /// Policy attestation is missing or stale.
    PolicyAttestationMissing,
    /// Batch proposal contained no items.
    EmptyBatch,
    /// Batch proposal exceeded the maximum item count.
    BatchTooLarge,
    /// Cross-treasury exposure group cap would be exceeded.
    ExposureGroupLimitExceeded,
    /// Pending execution timelock is still active.
    PendingExecutionTimelockActive,
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
            Self::WeeklyLimit => "weekly_limit",
            Self::MonthlyLimit => "monthly_limit",
            Self::RecipientDailyLimit => "recipient_daily_limit",
            Self::RecipientPerTransactionLimit => "recipient_per_transaction_limit",
            Self::AnomalyDetected => "anomaly_detected",
            Self::CooldownNotElapsed => "cooldown_not_elapsed",
            Self::BudgetEnvelopeDailyLimit => "budget_envelope_daily_limit",
            Self::BudgetEnvelopeWeeklyLimit => "budget_envelope_weekly_limit",
            Self::ApprovalLadderDenied => "approval_ladder_denied",
            Self::ExecutionScopePaused => "execution_scope_paused",
            Self::ExternalDependencyStale => "external_dependency_stale",
            Self::PolicyAttestationMissing => "policy_attestation_missing",
            Self::EmptyBatch => "empty_batch",
            Self::BatchTooLarge => "batch_too_large",
            Self::ExposureGroupLimitExceeded => "exposure_group_limit_exceeded",
            Self::PendingExecutionTimelockActive => "pending_execution_timelock_active",
        };

        write!(f, "{label}")
    }
}
