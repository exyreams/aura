#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ExposureGroupState {
    pub group_id: [u8; 16],
    pub daily_limit_usd: u64,
    pub spent_today_usd: u64,
    pub last_reset_day: i64,
}

impl ExposureGroupState {
    pub fn available_for(&self, amount_usd: u64) -> bool {
        self.spent_today_usd.saturating_add(amount_usd) <= self.daily_limit_usd
    }

    pub fn record_spend(&mut self, amount_usd: u64) {
        self.spent_today_usd = self.spent_today_usd.saturating_add(amount_usd);
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct GroupMembership {
    pub treasury: String,
    pub group_id: [u8; 16],
    pub active: bool,
}
