//! Anchor account records for budget envelopes and exposure groups.
//!
//! Budget envelopes track scoped spend limits for one treasury. Exposure groups
//! track shared aggregate limits across multiple treasury accounts.

use super::*;

/// Allocated size for a `BudgetEnvelopeAccount`.
pub const BUDGET_ENVELOPE_SPACE: usize = 8 + 384;
/// Allocated size for an `ExposureGroupAccount`.
pub const EXPOSURE_GROUP_SPACE: usize = 8 + 512;

/// Scoped spend counter for a chain, category, or protocol.
#[account]
#[derive(InitSpace)]
pub struct BudgetEnvelopeAccount {
    /// PDA bump for the envelope account.
    pub bump: u8,
    /// Treasury this envelope belongs to.
    pub treasury: Pubkey,
    /// Scope code: 0 chain, 1 category, 2 protocol.
    pub scope_kind: u8,
    /// Chain code when `scope_kind == 0`.
    pub chain: Option<u8>,
    /// Transaction type code when `scope_kind == 1`.
    pub tx_type: Option<u8>,
    /// Protocol identifier when `scope_kind == 2`.
    pub protocol_id: Option<u8>,
    /// Maximum spend for the current day.
    pub daily_limit_usd: u64,
    /// Optional maximum spend for the current week; zero disables the weekly cap.
    pub weekly_limit_usd: u64,
    /// Spend recorded for the current day.
    pub spent_today_usd: u64,
    /// Spend recorded for the current week.
    pub spent_week_usd: u64,
    /// Day index used for daily/weekly reset logic.
    pub last_reset_day: i64,
    /// Unix timestamp when this envelope was created.
    pub created_at: i64,
    /// Unix timestamp when counters were last updated.
    pub updated_at: i64,
}

impl BudgetEnvelopeAccount {
    fn current_day(now: i64) -> i64 {
        now.div_euclid(86_400)
    }

    fn effective_spent_today_usd(&self, now: i64) -> u64 {
        if self.last_reset_day < Self::current_day(now) {
            0
        } else {
            self.spent_today_usd
        }
    }

    fn effective_spent_week_usd(&self, now: i64) -> u64 {
        if Self::current_day(now).saturating_sub(self.last_reset_day) >= 7 {
            0
        } else {
            self.spent_week_usd
        }
    }

    /// Returns true when a transaction belongs to this envelope's scope.
    pub fn matches(&self, chain: u8, tx_type: u8, protocol_id: Option<u8>) -> bool {
        match self.scope_kind {
            0 => self.chain == Some(chain),
            1 => self.tx_type == Some(tx_type),
            2 => self.protocol_id == protocol_id,
            _ => false,
        }
    }

    /// Validates that `amount_usd` can be spent without exceeding this envelope.
    pub fn assert_available(
        &self,
        amount_usd: u64,
        chain: u8,
        tx_type: u8,
        protocol_id: Option<u8>,
        now: i64,
    ) -> Result<()> {
        if !self.matches(chain, tx_type, protocol_id) {
            return Ok(());
        }
        require!(
            self.effective_spent_today_usd(now)
                .saturating_add(amount_usd)
                <= self.daily_limit_usd,
            AuraCoreError::BudgetEnvelopeLimitExceeded
        );
        if self.weekly_limit_usd > 0 {
            require!(
                self.effective_spent_week_usd(now)
                    .saturating_add(amount_usd)
                    <= self.weekly_limit_usd,
                AuraCoreError::BudgetEnvelopeLimitExceeded
            );
        }
        Ok(())
    }

    /// Records approved spend and resets daily/weekly counters when needed.
    pub fn record_spend(&mut self, amount_usd: u64, now: i64) {
        let day = Self::current_day(now);
        if self.last_reset_day < day {
            self.spent_today_usd = 0;
            if day.saturating_sub(self.last_reset_day) >= 7 {
                self.spent_week_usd = 0;
            }
            self.last_reset_day = day;
        }
        self.spent_today_usd = self.spent_today_usd.saturating_add(amount_usd);
        self.spent_week_usd = self.spent_week_usd.saturating_add(amount_usd);
        self.updated_at = now;
    }
}

/// Shared exposure cap across multiple treasuries.
#[account]
#[derive(InitSpace)]
pub struct ExposureGroupAccount {
    /// PDA bump for the exposure group.
    pub bump: u8,
    /// Authority allowed to manage membership.
    pub authority: Pubkey,
    /// Caller-defined group identifier.
    pub group_id: [u8; 16],
    /// Maximum aggregate daily spend for all members.
    pub daily_limit_usd: u64,
    /// Aggregate spend recorded for the current day.
    pub spent_today_usd: u64,
    /// Day index used for daily reset logic.
    pub last_reset_day: i64,
    /// Cached member count.
    pub member_count: u16,
    /// Treasury accounts participating in this exposure group.
    #[max_len(16)]
    pub members: Vec<Pubkey>,
}

impl ExposureGroupAccount {
    fn current_day(now: i64) -> i64 {
        now.div_euclid(86_400)
    }

    fn effective_spent_today_usd(&self, now: i64) -> u64 {
        if self.last_reset_day < Self::current_day(now) {
            0
        } else {
            self.spent_today_usd
        }
    }

    /// Ensures `treasury` is an authorized member of this group.
    pub fn assert_member(&self, treasury: Pubkey) -> Result<()> {
        require!(
            self.members.contains(&treasury),
            AuraCoreError::ExposureGroupUnauthorized
        );
        Ok(())
    }

    /// Validates that group spend can absorb `amount_usd`.
    pub fn assert_available(&self, amount_usd: u64, now: i64) -> Result<()> {
        require!(
            self.effective_spent_today_usd(now)
                .saturating_add(amount_usd)
                <= self.daily_limit_usd,
            AuraCoreError::ExposureGroupLimitExceeded
        );
        Ok(())
    }

    /// Records approved group spend and resets the daily counter when needed.
    pub fn record_spend(&mut self, amount_usd: u64, now: i64) {
        let day = Self::current_day(now);
        if self.last_reset_day < day {
            self.spent_today_usd = 0;
            self.last_reset_day = day;
        }
        self.spent_today_usd = self.spent_today_usd.saturating_add(amount_usd);
    }
}
