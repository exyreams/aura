use super::*;

pub const BUDGET_ENVELOPE_SPACE: usize = 8 + 384;
pub const EXPOSURE_GROUP_SPACE: usize = 8 + 512;

#[account]
#[derive(InitSpace)]
pub struct BudgetEnvelopeAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub scope_kind: u8,
    pub chain: Option<u8>,
    pub tx_type: Option<u8>,
    pub protocol_id: Option<u8>,
    pub daily_limit_usd: u64,
    pub weekly_limit_usd: u64,
    pub spent_today_usd: u64,
    pub spent_week_usd: u64,
    pub last_reset_day: i64,
    pub created_at: i64,
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

    pub fn matches(&self, chain: u8, tx_type: u8, protocol_id: Option<u8>) -> bool {
        match self.scope_kind {
            0 => self.chain == Some(chain),
            1 => self.tx_type == Some(tx_type),
            2 => self.protocol_id == protocol_id,
            _ => false,
        }
    }

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

#[account]
#[derive(InitSpace)]
pub struct ExposureGroupAccount {
    pub bump: u8,
    pub authority: Pubkey,
    pub group_id: [u8; 16],
    pub daily_limit_usd: u64,
    pub spent_today_usd: u64,
    pub last_reset_day: i64,
    pub member_count: u16,
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

    pub fn assert_member(&self, treasury: Pubkey) -> Result<()> {
        require!(
            self.members.iter().any(|member| *member == treasury),
            AuraCoreError::ExposureGroupUnauthorized
        );
        Ok(())
    }

    pub fn assert_available(&self, amount_usd: u64, now: i64) -> Result<()> {
        require!(
            self.effective_spent_today_usd(now)
                .saturating_add(amount_usd)
                <= self.daily_limit_usd,
            AuraCoreError::ExposureGroupLimitExceeded
        );
        Ok(())
    }

    pub fn record_spend(&mut self, amount_usd: u64, now: i64) {
        let day = Self::current_day(now);
        if self.last_reset_day < day {
            self.spent_today_usd = 0;
            self.last_reset_day = day;
        }
        self.spent_today_usd = self.spent_today_usd.saturating_add(amount_usd);
    }
}
