#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyDecisionReceiptFields {
    pub decision: u8,
    pub primary_violation: u16,
    pub risk_score_bps: u16,
    pub rule_outcome_bitmap: u128,
    pub required_approval_level: u8,
    pub effective_limit_usd: u64,
    pub remaining_daily_usd: u64,
}
