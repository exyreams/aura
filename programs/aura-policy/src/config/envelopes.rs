use crate::{context::TransactionContext, types::Chain, violations::ViolationCode};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum BudgetEnvelopeScope {
    Chain { chain: Chain },
    Category { tx_type_code: u8 },
    Protocol { protocol_id: u8 },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BudgetEnvelope {
    pub scope: BudgetEnvelopeScope,
    pub daily_limit_usd: u64,
    pub weekly_limit_usd: u64,
    pub spent_today_usd: u64,
    pub spent_week_usd: u64,
    pub last_reset_day: i64,
}

impl BudgetEnvelope {
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

    pub fn matches(&self, tx: &TransactionContext) -> bool {
        match self.scope {
            BudgetEnvelopeScope::Chain { chain } => tx.target_chain == chain,
            BudgetEnvelopeScope::Category { tx_type_code } => tx.tx_type as u8 == tx_type_code,
            BudgetEnvelopeScope::Protocol { protocol_id } => tx.protocol_id == Some(protocol_id),
        }
    }

    pub fn check(&self, tx: &TransactionContext) -> Result<(), ViolationCode> {
        if !self.matches(tx) {
            return Ok(());
        }
        if self
            .effective_spent_today_usd(tx.current_timestamp)
            .saturating_add(tx.amount_usd)
            > self.daily_limit_usd
        {
            return Err(ViolationCode::BudgetEnvelopeDailyLimit);
        }
        if self.weekly_limit_usd > 0
            && self
                .effective_spent_week_usd(tx.current_timestamp)
                .saturating_add(tx.amount_usd)
                > self.weekly_limit_usd
        {
            return Err(ViolationCode::BudgetEnvelopeWeeklyLimit);
        }
        Ok(())
    }

    pub fn record_spend(&mut self, tx: &TransactionContext) {
        if self.matches(tx) {
            let day = Self::current_day(tx.current_timestamp);
            if self.last_reset_day < day {
                self.spent_today_usd = 0;
                if day.saturating_sub(self.last_reset_day) >= 7 {
                    self.spent_week_usd = 0;
                }
                self.last_reset_day = day;
            }
            self.spent_today_usd = self.spent_today_usd.saturating_add(tx.amount_usd);
            self.spent_week_usd = self.spent_week_usd.saturating_add(tx.amount_usd);
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub struct BudgetEnvelopeSet {
    pub envelopes: Vec<BudgetEnvelope>,
}

impl BudgetEnvelopeSet {
    pub fn check(&self, tx: &TransactionContext) -> Result<(), ViolationCode> {
        for envelope in &self.envelopes {
            envelope.check(tx)?;
        }
        Ok(())
    }
}
