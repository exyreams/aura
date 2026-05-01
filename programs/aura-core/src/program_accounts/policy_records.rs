use super::*;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct RecipientLimitRecord {
    pub chain: u8,
    #[max_len(128)]
    pub address: String,
    pub daily_limit_usd: u64,
    pub per_tx_limit_usd: Option<u64>,
}

impl RecipientLimitRecord {
    pub fn from_domain(domain: &RecipientLimit) -> Self {
        Self {
            chain: chain_code(domain.chain),
            address: domain.address.clone(),
            daily_limit_usd: domain.daily_limit_usd,
            per_tx_limit_usd: domain.per_tx_limit_usd,
        }
    }

    pub fn to_domain(&self) -> Result<RecipientLimit> {
        Ok(RecipientLimit {
            chain: chain_from_code(self.chain)?,
            address: self.address.clone(),
            daily_limit_usd: self.daily_limit_usd,
            per_tx_limit_usd: self.per_tx_limit_usd,
        })
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct CooldownConfigRecord {
    pub threshold_usd: u64,
    pub cooldown_secs: i64,
}

impl CooldownConfigRecord {
    pub fn from_domain(domain: &CooldownConfig) -> Self {
        Self {
            threshold_usd: domain.threshold_usd,
            cooldown_secs: domain.cooldown_secs,
        }
    }

    pub fn to_domain(&self) -> CooldownConfig {
        CooldownConfig {
            threshold_usd: self.threshold_usd,
            cooldown_secs: self.cooldown_secs,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct AnomalyConfigRecord {
    pub enabled: bool,
    pub z_score_threshold_bps: u64,
    pub min_sample_size: u16,
    pub action: u8,
}

impl AnomalyConfigRecord {
    pub fn from_domain(domain: &AnomalyConfig) -> Self {
        Self {
            enabled: domain.enabled,
            z_score_threshold_bps: domain.z_score_threshold_bps,
            min_sample_size: domain.min_sample_size as u16,
            action: anomaly_action_code(domain.action),
        }
    }

    pub fn to_domain(&self) -> Result<AnomalyConfig> {
        Ok(AnomalyConfig {
            enabled: self.enabled,
            z_score_threshold_bps: self.z_score_threshold_bps,
            min_sample_size: self.min_sample_size as usize,
            action: anomaly_action_from_code(self.action)?,
        })
    }
}

/// Serialized form of `PolicyConfig`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PolicyConfigRecord {
    pub daily_limit_usd: u64,
    pub per_tx_limit_usd: u64,
    pub daytime_hourly_limit_usd: u64,
    pub nighttime_hourly_limit_usd: u64,
    pub velocity_limit_usd: u64,
    pub allowed_protocol_bitmap: u64,
    pub max_slippage_bps: u64,
    pub max_quote_age_secs: Option<u64>,
    pub max_counterparty_risk_score: Option<u8>,
    pub bitcoin_manual_review_threshold_usd: u64,
    pub shared_pool_limit_usd: Option<u64>,
    pub weekly_limit_usd: Option<u64>,
    pub monthly_limit_usd: Option<u64>,
    #[max_len(16)]
    pub recipient_limits: Vec<RecipientLimitRecord>,
    pub cooldown_config: Option<CooldownConfigRecord>,
    pub anomaly_config: Option<AnomalyConfigRecord>,
    pub reputation_policy: ReputationPolicyRecord,
}

impl PolicyConfigRecord {
    pub fn from_domain(domain: &PolicyConfig) -> Self {
        Self {
            daily_limit_usd: domain.daily_limit_usd,
            per_tx_limit_usd: domain.per_tx_limit_usd,
            daytime_hourly_limit_usd: domain.daytime_hourly_limit_usd,
            nighttime_hourly_limit_usd: domain.nighttime_hourly_limit_usd,
            velocity_limit_usd: domain.velocity_limit_usd,
            allowed_protocol_bitmap: domain.allowed_protocol_bitmap,
            max_slippage_bps: domain.max_slippage_bps,
            max_quote_age_secs: domain.max_quote_age_secs,
            max_counterparty_risk_score: domain.max_counterparty_risk_score,
            bitcoin_manual_review_threshold_usd: domain.bitcoin_manual_review_threshold_usd,
            shared_pool_limit_usd: domain.shared_pool_limit_usd,
            weekly_limit_usd: domain.weekly_limit_usd,
            monthly_limit_usd: domain.monthly_limit_usd,
            recipient_limits: domain
                .recipient_limits
                .iter()
                .map(RecipientLimitRecord::from_domain)
                .collect(),
            cooldown_config: domain
                .cooldown_config
                .as_ref()
                .map(CooldownConfigRecord::from_domain),
            anomaly_config: domain
                .anomaly_config
                .as_ref()
                .map(AnomalyConfigRecord::from_domain),
            reputation_policy: ReputationPolicyRecord::from_domain(&domain.reputation_policy),
        }
    }

    pub fn to_domain(&self) -> PolicyConfig {
        PolicyConfig {
            daily_limit_usd: self.daily_limit_usd,
            per_tx_limit_usd: self.per_tx_limit_usd,
            daytime_hourly_limit_usd: self.daytime_hourly_limit_usd,
            nighttime_hourly_limit_usd: self.nighttime_hourly_limit_usd,
            velocity_limit_usd: self.velocity_limit_usd,
            allowed_protocol_bitmap: self.allowed_protocol_bitmap,
            max_slippage_bps: self.max_slippage_bps,
            max_quote_age_secs: self.max_quote_age_secs,
            max_counterparty_risk_score: self.max_counterparty_risk_score,
            bitcoin_manual_review_threshold_usd: self.bitcoin_manual_review_threshold_usd,
            shared_pool_limit_usd: self.shared_pool_limit_usd,
            weekly_limit_usd: self.weekly_limit_usd,
            monthly_limit_usd: self.monthly_limit_usd,
            recipient_limits: self
                .recipient_limits
                .iter()
                .map(RecipientLimitRecord::to_domain)
                .collect::<Result<Vec<_>>>()
                .expect("recipient limit records must decode"),
            cooldown_config: self
                .cooldown_config
                .as_ref()
                .map(CooldownConfigRecord::to_domain),
            anomaly_config: self
                .anomaly_config
                .as_ref()
                .map(AnomalyConfigRecord::to_domain)
                .transpose()
                .expect("anomaly config record must decode"),
            reputation_policy: self.reputation_policy.to_domain(),
        }
    }
}

/// Serialized form of `ReputationPolicy`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct ReputationPolicyRecord {
    pub high_score_threshold: u64,
    pub medium_score_threshold: u64,
    pub high_multiplier_bps: u64,
    pub low_multiplier_bps: u64,
}

impl ReputationPolicyRecord {
    pub fn from_domain(domain: &ReputationPolicy) -> Self {
        Self {
            high_score_threshold: domain.high_score_threshold,
            medium_score_threshold: domain.medium_score_threshold,
            high_multiplier_bps: domain.high_multiplier_bps,
            low_multiplier_bps: domain.low_multiplier_bps,
        }
    }

    pub fn to_domain(&self) -> ReputationPolicy {
        ReputationPolicy {
            high_score_threshold: self.high_score_threshold,
            medium_score_threshold: self.medium_score_threshold,
            high_multiplier_bps: self.high_multiplier_bps,
            low_multiplier_bps: self.low_multiplier_bps,
        }
    }
}

/// Serialized form of `PolicyState` (mutable spending counters).
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct RecipientSpendRecordAccount {
    pub chain_code: u8,
    pub address_hash: [u8; 8],
    pub spent_today_usd: u64,
    pub last_reset_at: i64,
}

impl RecipientSpendRecordAccount {
    pub fn from_domain(domain: &RecipientSpendRecord) -> Self {
        Self {
            chain_code: domain.chain_code,
            address_hash: domain.address_hash,
            spent_today_usd: domain.spent_today_usd,
            last_reset_at: domain.last_reset_at,
        }
    }

    pub fn to_domain(&self) -> RecipientSpendRecord {
        RecipientSpendRecord {
            chain_code: self.chain_code,
            address_hash: self.address_hash,
            spent_today_usd: self.spent_today_usd,
            last_reset_at: self.last_reset_at,
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PolicyStateRecord {
    pub spent_today_usd: u64,
    pub last_reset_timestamp: i64,
    pub hourly_spent_usd: u64,
    pub hourly_bucket_started_at: i64,
    #[max_len(16)]
    pub recent_amounts: Vec<u64>,
    pub daily_buckets: [u64; 7],
    pub daily_bucket_head: u8,
    pub seven_day_window_started_at: i64,
    pub thirty_day_spent_usd: u64,
    pub thirty_day_window_started_at: i64,
    pub peak_single_tx_usd: u64,
    pub peak_day_spend_usd: u64,
    #[max_len(32)]
    pub recipient_spend: Vec<RecipientSpendRecordAccount>,
}

impl PolicyStateRecord {
    pub fn from_domain(domain: &PolicyState) -> Self {
        Self {
            spent_today_usd: domain.spent_today_usd,
            last_reset_timestamp: domain.last_reset_timestamp,
            hourly_spent_usd: domain.hourly_spent_usd,
            hourly_bucket_started_at: domain.hourly_bucket_started_at,
            recent_amounts: domain.recent_amounts.clone(),
            daily_buckets: domain.daily_buckets,
            daily_bucket_head: domain.daily_bucket_head,
            seven_day_window_started_at: domain.seven_day_window_started_at,
            thirty_day_spent_usd: domain.thirty_day_spent_usd,
            thirty_day_window_started_at: domain.thirty_day_window_started_at,
            peak_single_tx_usd: domain.peak_single_tx_usd,
            peak_day_spend_usd: domain.peak_day_spend_usd,
            recipient_spend: domain
                .recipient_spend
                .iter()
                .map(RecipientSpendRecordAccount::from_domain)
                .collect(),
        }
    }

    pub fn to_domain(&self) -> PolicyState {
        PolicyState {
            spent_today_usd: self.spent_today_usd,
            last_reset_timestamp: self.last_reset_timestamp,
            hourly_spent_usd: self.hourly_spent_usd,
            hourly_bucket_started_at: self.hourly_bucket_started_at,
            recent_amounts: self.recent_amounts.clone(),
            daily_buckets: self.daily_buckets,
            daily_bucket_head: self.daily_bucket_head,
            seven_day_window_started_at: self.seven_day_window_started_at,
            thirty_day_spent_usd: self.thirty_day_spent_usd,
            thirty_day_window_started_at: self.thirty_day_window_started_at,
            peak_single_tx_usd: self.peak_single_tx_usd,
            peak_day_spend_usd: self.peak_day_spend_usd,
            recipient_spend: self
                .recipient_spend
                .iter()
                .map(RecipientSpendRecordAccount::to_domain)
                .collect(),
        }
    }
}

/// Serialized form of a single `RuleOutcome` in the policy trace.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct RuleTraceRecord {
    #[max_len(32)]
    pub rule_name: String,
    pub passed: bool,
    #[max_len(128)]
    pub detail: String,
}

impl RuleTraceRecord {
    pub fn from_domain(domain: &RuleOutcome) -> Self {
        Self {
            rule_name: domain.rule_name.to_string(),
            passed: domain.passed,
            detail: domain.detail.clone(),
        }
    }

    pub fn to_domain(&self) -> RuleOutcome {
        if self.passed {
            RuleOutcome::passed(leak_rule_name(&self.rule_name), self.detail.clone())
        } else {
            RuleOutcome::failed(leak_rule_name(&self.rule_name), self.detail.clone())
        }
    }
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct RiskFactorRecord {
    #[max_len(48)]
    pub name: String,
    pub contribution: u8,
    #[max_len(128)]
    pub detail: String,
}

impl RiskFactorRecord {
    pub fn from_domain(domain: &RiskFactor) -> Self {
        Self {
            name: domain.name.clone(),
            contribution: domain.contribution,
            detail: domain.detail.clone(),
        }
    }

    pub fn to_domain(&self) -> RiskFactor {
        RiskFactor {
            name: self.name.clone(),
            contribution: self.contribution,
            detail: self.detail.clone(),
        }
    }
}

/// Serialized form of `PolicyDecision`.
/// `violation` is stored as a `u8` code; see `violation_code`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq, Eq, InitSpace)]
pub struct PolicyDecisionRecord {
    pub approved: bool,
    pub violation: u8,
    pub effective_daily_limit_usd: u64,
    pub risk_score: u8,
    pub regulatory_flags: u8,
    pub next_state: PolicyStateRecord,
    #[max_len(8)]
    pub risk_factors: Vec<RiskFactorRecord>,
    #[max_len(16)]
    pub trace: Vec<RuleTraceRecord>,
}

impl PolicyDecisionRecord {
    pub fn from_domain(domain: &PolicyDecision) -> Result<Self> {
        Ok(Self {
            approved: domain.approved,
            violation: violation_code(domain.violation),
            effective_daily_limit_usd: domain.effective_daily_limit_usd,
            risk_score: domain.risk_score,
            regulatory_flags: domain.regulatory_flags,
            next_state: PolicyStateRecord::from_domain(&domain.next_state),
            risk_factors: domain
                .risk_factors
                .iter()
                .map(RiskFactorRecord::from_domain)
                .collect(),
            trace: domain
                .trace
                .iter()
                .map(RuleTraceRecord::from_domain)
                .collect(),
        })
    }

    pub fn to_domain(&self) -> Result<PolicyDecision> {
        Ok(PolicyDecision {
            approved: self.approved,
            violation: violation_from_code(self.violation)?,
            next_state: self.next_state.to_domain(),
            effective_daily_limit_usd: self.effective_daily_limit_usd,
            risk_score: self.risk_score,
            risk_factors: self
                .risk_factors
                .iter()
                .map(RiskFactorRecord::to_domain)
                .collect(),
            regulatory_flags: self.regulatory_flags,
            trace: self.trace.iter().map(RuleTraceRecord::to_domain).collect(),
        })
    }
}
