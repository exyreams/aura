#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ExternalDependency {
    Encrypt = 1,
    DWallet = 2,
    BalanceOracle = 3,
    ComplianceOracle = 4,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct LivenessConfig {
    pub require_encrypt_freshness: bool,
    pub require_dwallet_freshness: bool,
    pub require_balance_oracle_freshness: bool,
    pub require_compliance_oracle_freshness: bool,
    pub max_staleness_secs: i64,
}

impl Default for LivenessConfig {
    fn default() -> Self {
        Self {
            require_encrypt_freshness: false,
            require_dwallet_freshness: false,
            require_balance_oracle_freshness: false,
            require_compliance_oracle_freshness: false,
            max_staleness_secs: 3_600,
        }
    }
}

pub fn is_fresh(last_verified_at: i64, max_age: i64, now: i64) -> bool {
    last_verified_at > 0 && now.saturating_sub(last_verified_at) <= max_age
}
