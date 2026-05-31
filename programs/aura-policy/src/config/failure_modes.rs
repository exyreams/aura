//! Per-check failure handling: how the evaluator reacts when a *softenable*
//! check fails (a stale quote, an unreachable risk feed, …).
//!
//! The default for every check is [`CheckMode::Enforce`], so a default config
//! behaves exactly as a fail-closed evaluator. Softening is opt-in and is always
//! bounded by the fail-open budget below, so it can never drain a treasury or be
//! ground past a persistent outage. Hard money caps, pauses, approvals, frozen
//! wallets, and sanctions have **no field here** — that omission is the safety
//! contract (they can never be softened).

/// How a softenable check behaves when it fails.
#[repr(u8)]
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum CheckMode {
    /// Violation denies the transaction (fail-closed). Default for everything.
    #[default]
    Enforce = 0,
    /// Record the violation + raise risk, but allow the transaction.
    Warn = 1,
    /// Allow only up to a clamped fallback ceiling; deny above it.
    Degrade = 2,
    /// Do not evaluate the check (explicit, audited opt-out).
    Skip = 3,
}

impl CheckMode {
    pub fn from_code(code: u8) -> Option<Self> {
        match code {
            0 => Some(Self::Enforce),
            1 => Some(Self::Warn),
            2 => Some(Self::Degrade),
            3 => Some(Self::Skip),
            _ => None,
        }
    }

    pub fn code(self) -> u8 {
        self as u8
    }
}

/// The set of checks whose failure handling is configurable.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SoftenableCheck {
    QuoteFreshness,
    CounterpartyRisk,
    Slippage,
    Anomaly,
    BalanceOracleStale,
    ComplianceOracle,
    EncryptLiveness,
    DwalletLiveness,
}

/// Per-check failure modes plus the bounds that keep fail-open safe.
///
/// Defaults to all-`Enforce` with zero fail-open budget, i.e. fully fail-closed:
/// softening a check has no effect until both its mode *and* the relevant budget
/// fields are configured.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub struct FailureModeConfig {
    pub quote_freshness: CheckMode,
    pub counterparty_risk: CheckMode,
    pub slippage: CheckMode,
    /// Supersedes `AnomalyConfig.action`; `FlagForReview` ⇒ `Warn`.
    pub anomaly: CheckMode,
    pub balance_oracle_stale: CheckMode,
    pub compliance_oracle: CheckMode,
    pub encrypt_liveness: CheckMode,
    pub dwallet_liveness: CheckMode,
    /// A degraded/warned tx above this USD amount is force-`Enforce`d.
    pub max_fail_open_usd: u64,
    /// Rolling window for the fail-open budget.
    pub fail_open_window_secs: i64,
    /// Total USD allowed to pass softened per window.
    pub fail_open_budget_usd: u64,
    /// Count cap on softened transactions per window.
    pub fail_open_max_per_window: u16,
    /// Clamped per-tx ceiling used by `Degrade`.
    pub stale_fallback_limit_usd: u64,
}

impl FailureModeConfig {
    /// The configured mode for `check`.
    pub fn mode_for(&self, check: SoftenableCheck) -> CheckMode {
        match check {
            SoftenableCheck::QuoteFreshness => self.quote_freshness,
            SoftenableCheck::CounterpartyRisk => self.counterparty_risk,
            SoftenableCheck::Slippage => self.slippage,
            SoftenableCheck::Anomaly => self.anomaly,
            SoftenableCheck::BalanceOracleStale => self.balance_oracle_stale,
            SoftenableCheck::ComplianceOracle => self.compliance_oracle,
            SoftenableCheck::EncryptLiveness => self.encrypt_liveness,
            SoftenableCheck::DwalletLiveness => self.dwallet_liveness,
        }
    }

    /// Whether softening `amount_usd` is allowed under the current window
    /// counters. Returns `false` (⇒ force-`Enforce`) when any bound is hit.
    pub fn fail_open_allows(
        &self,
        amount_usd: u64,
        windowed_spent_usd: u64,
        windowed_count: u16,
    ) -> bool {
        amount_usd <= self.max_fail_open_usd
            && windowed_spent_usd.saturating_add(amount_usd) <= self.fail_open_budget_usd
            && windowed_count < self.fail_open_max_per_window
    }
}
