use crate::config::PolicyConfig;

pub const FIELD_PER_TX_LIMIT: u8 = 0;
pub const FIELD_DAILY_LIMIT: u8 = 1;
pub const FIELD_WEEKLY_LIMIT: u8 = 2;
pub const FIELD_MONTHLY_LIMIT: u8 = 3;
pub const FIELD_COUNTERPARTY_RISK: u8 = 4;

#[derive(Clone, Debug, Default, PartialEq, Eq)]
pub struct PolicyConfigDiff {
    pub tightened_bitmap: u128,
    pub loosened_bitmap: u128,
    pub high_impact_bitmap: u128,
    pub risk_delta_bps: i16,
}

impl PolicyConfigDiff {
    fn mark_tightened(&mut self, field: u8) {
        self.tightened_bitmap |= 1u128 << field;
    }

    fn mark_loosened(&mut self, field: u8) {
        self.loosened_bitmap |= 1u128 << field;
        self.high_impact_bitmap |= 1u128 << field;
    }

    fn compare_limit(&mut self, field: u8, old: u64, new: u64) {
        if new < old {
            self.mark_tightened(field);
        } else if new > old {
            self.mark_loosened(field);
        }
    }
}

pub fn diff_policy_config(old: &PolicyConfig, new: &PolicyConfig) -> PolicyConfigDiff {
    let mut diff = PolicyConfigDiff::default();
    diff.compare_limit(
        FIELD_PER_TX_LIMIT,
        old.per_tx_limit_usd,
        new.per_tx_limit_usd,
    );
    diff.compare_limit(FIELD_DAILY_LIMIT, old.daily_limit_usd, new.daily_limit_usd);
    diff.compare_limit(
        FIELD_WEEKLY_LIMIT,
        old.weekly_limit_usd.unwrap_or(u64::MAX),
        new.weekly_limit_usd.unwrap_or(u64::MAX),
    );
    diff.compare_limit(
        FIELD_MONTHLY_LIMIT,
        old.monthly_limit_usd.unwrap_or(u64::MAX),
        new.monthly_limit_usd.unwrap_or(u64::MAX),
    );

    match (
        old.max_counterparty_risk_score,
        new.max_counterparty_risk_score,
    ) {
        (Some(old), Some(new)) if new < old => diff.mark_tightened(FIELD_COUNTERPARTY_RISK),
        (Some(old), Some(new)) if new > old => diff.mark_loosened(FIELD_COUNTERPARTY_RISK),
        (Some(_), None) => diff.mark_loosened(FIELD_COUNTERPARTY_RISK),
        (None, Some(_)) => diff.mark_tightened(FIELD_COUNTERPARTY_RISK),
        _ => {}
    }

    let loosened = diff.loosened_bitmap.count_ones() as i16;
    let tightened = diff.tightened_bitmap.count_ones() as i16;
    diff.risk_delta_bps = loosened.saturating_mul(500) - tightened.saturating_mul(250);
    diff
}
