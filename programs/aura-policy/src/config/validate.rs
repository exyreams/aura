use super::PolicyConfig;

/// A specific coherence invariant that a [`PolicyConfig`] can violate.
///
/// Returned by [`validate_policy_config`] so callers can name the exact rule
/// that failed (used by the on-chain `InvalidTemplateConfig` error and by the
/// preset / config-change guards).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PolicyConfigInvariant {
    /// `per_tx_limit_usd` exceeds `daily_limit_usd`.
    PerTxAboveDaily,
    /// `daily_limit_usd` exceeds the optional `weekly_limit_usd`.
    DailyAboveWeekly,
    /// `weekly_limit_usd` exceeds the optional `monthly_limit_usd`.
    WeeklyAboveMonthly,
    /// `daily_limit_usd` exceeds `monthly_limit_usd` (no weekly cap set).
    DailyAboveMonthly,
    /// Approval-ladder thresholds are not monotonically non-decreasing.
    LadderNonMonotonic,
    /// `velocity_limit_usd` is below `per_tx_limit_usd`.
    VelocityBelowPerTx,
    /// A recipient per-tx cap exceeds the global `per_tx_limit_usd`.
    RecipientAbovePerTx,
    /// The degrade fallback ceiling exceeds the global `per_tx_limit_usd`.
    StaleFallbackAbovePerTx,
}

impl PolicyConfigInvariant {
    /// Stable identifier for logs / error context.
    pub fn as_str(self) -> &'static str {
        match self {
            Self::PerTxAboveDaily => "per_tx_limit_usd > daily_limit_usd",
            Self::DailyAboveWeekly => "daily_limit_usd > weekly_limit_usd",
            Self::WeeklyAboveMonthly => "weekly_limit_usd > monthly_limit_usd",
            Self::DailyAboveMonthly => "daily_limit_usd > monthly_limit_usd",
            Self::LadderNonMonotonic => "approval ladder thresholds not monotonic",
            Self::VelocityBelowPerTx => "velocity_limit_usd < per_tx_limit_usd",
            Self::RecipientAbovePerTx => "recipient per_tx_limit_usd > global per_tx_limit_usd",
            Self::StaleFallbackAbovePerTx => "stale_fallback_limit_usd > per_tx_limit_usd",
        }
    }
}

/// Validates that a [`PolicyConfig`] is internally coherent before it can govern
/// funds. Rejects configs whose limits or approval thresholds contradict each
/// other (which could otherwise create an unenforceable or trivially-bypassed
/// posture). Returns the first invariant that fails.
pub fn validate_policy_config(config: &PolicyConfig) -> Result<(), PolicyConfigInvariant> {
    // Monotonic money caps: per_tx <= daily <= weekly <= monthly (when set).
    if config.per_tx_limit_usd > config.daily_limit_usd {
        return Err(PolicyConfigInvariant::PerTxAboveDaily);
    }
    match (config.weekly_limit_usd, config.monthly_limit_usd) {
        (Some(weekly), monthly) => {
            if config.daily_limit_usd > weekly {
                return Err(PolicyConfigInvariant::DailyAboveWeekly);
            }
            if let Some(monthly) = monthly {
                if weekly > monthly {
                    return Err(PolicyConfigInvariant::WeeklyAboveMonthly);
                }
            }
        }
        (None, Some(monthly)) => {
            if config.daily_limit_usd > monthly {
                return Err(PolicyConfigInvariant::DailyAboveMonthly);
            }
        }
        (None, None) => {}
    }

    // Velocity must be able to cover a single max transaction.
    if config.velocity_limit_usd < config.per_tx_limit_usd {
        return Err(PolicyConfigInvariant::VelocityBelowPerTx);
    }

    // Approval-ladder thresholds must be monotonically non-decreasing.
    if let Some(ladder) = &config.approval_ladder {
        let monotonic = ladder.guardian_above_usd <= ladder.multisig_above_usd
            && ladder.multisig_above_usd <= ladder.timelock_above_usd
            && ladder.timelock_above_usd <= ladder.deny_above_usd;
        if !monotonic {
            return Err(PolicyConfigInvariant::LadderNonMonotonic);
        }
    }

    // Per-recipient caps cannot exceed the global per-tx cap.
    for limit in &config.recipient_limits {
        if let Some(per_tx) = limit.per_tx_limit_usd {
            if per_tx > config.per_tx_limit_usd {
                return Err(PolicyConfigInvariant::RecipientAbovePerTx);
            }
        }
    }

    // The degrade fallback ceiling must not exceed the global per-tx cap, or a
    // degraded transaction could pass above the hard limit.
    if config.failure_modes.stale_fallback_limit_usd > config.per_tx_limit_usd {
        return Err(PolicyConfigInvariant::StaleFallbackAbovePerTx);
    }

    Ok(())
}
