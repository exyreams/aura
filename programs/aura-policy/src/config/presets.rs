use super::{
    AnomalyAction, AnomalyConfig, ApprovalLadder, BudgetEnvelopeSet, CheckMode, CooldownConfig,
    LivenessConfig, PolicyConfig,
};

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PolicyPresetKind {
    ConservativeDao = 1,
    AiAgentOps = 2,
    HighTrustExecutor = 3,
    StrictCompliance = 4,
    IntegrationTestFastPath = 5,
    TradingDesk = 6,
    PayrollSweep = 7,
    GrantDisbursement = 8,
    MevSearcher = 9,
    TreasuryColdStorage = 10,
}

impl PolicyPresetKind {
    pub fn from_code(code: u8) -> Option<Self> {
        match code {
            1 => Some(Self::ConservativeDao),
            2 => Some(Self::AiAgentOps),
            3 => Some(Self::HighTrustExecutor),
            4 => Some(Self::StrictCompliance),
            5 => Some(Self::IntegrationTestFastPath),
            6 => Some(Self::TradingDesk),
            7 => Some(Self::PayrollSweep),
            8 => Some(Self::GrantDisbursement),
            9 => Some(Self::MevSearcher),
            10 => Some(Self::TreasuryColdStorage),
            _ => None,
        }
    }

    pub fn code(self) -> u8 {
        self as u8
    }
}

pub fn build_policy_preset(kind: PolicyPresetKind) -> PolicyConfig {
    let mut config = PolicyConfig::default();
    match kind {
        PolicyPresetKind::ConservativeDao => {
            config.per_tx_limit_usd = 500;
            config.daily_limit_usd = 2_000;
            config.weekly_limit_usd = Some(7_500);
            config.monthly_limit_usd = Some(20_000);
            config.anomaly_config = Some(AnomalyConfig {
                enabled: true,
                z_score_threshold_bps: 15_000,
                min_sample_size: 5,
                action: AnomalyAction::Deny,
            });
            config.approval_ladder = Some(ApprovalLadder {
                guardian_above_usd: 250,
                multisig_above_usd: 1_000,
                timelock_above_usd: 1_500,
                deny_above_usd: 5_000,
                ..ApprovalLadder::default()
            });
        }
        PolicyPresetKind::AiAgentOps => {
            config.per_tx_limit_usd = 2_500;
            config.daily_limit_usd = 10_000;
            config.weekly_limit_usd = Some(35_000);
            config.anomaly_config = Some(AnomalyConfig {
                enabled: true,
                z_score_threshold_bps: 20_000,
                min_sample_size: 5,
                action: AnomalyAction::FlagForReview,
            });
            config.approval_ladder = Some(ApprovalLadder::default());
            // A flaky quote/risk feed should degrade, not halt the agent —
            // bounded by a fail-open budget so it can't be abused.
            config.failure_modes.quote_freshness = CheckMode::Degrade;
            config.failure_modes.slippage = CheckMode::Degrade;
            config.failure_modes.counterparty_risk = CheckMode::Warn;
            config.failure_modes.stale_fallback_limit_usd = 1_000;
            config.failure_modes.max_fail_open_usd = 2_500;
            config.failure_modes.fail_open_budget_usd = 10_000;
            config.failure_modes.fail_open_window_secs = 3_600;
            config.failure_modes.fail_open_max_per_window = 10;
        }
        PolicyPresetKind::HighTrustExecutor => {
            config.per_tx_limit_usd = 10_000;
            config.daily_limit_usd = 50_000;
            config.weekly_limit_usd = Some(150_000);
            config.monthly_limit_usd = Some(500_000);
            config.velocity_limit_usd = 100_000;
            config.approval_ladder = Some(ApprovalLadder {
                guardian_above_usd: 15_000,
                multisig_above_usd: 30_000,
                timelock_above_usd: 45_000,
                deny_above_usd: 100_000,
                ..ApprovalLadder::default()
            });
        }
        PolicyPresetKind::StrictCompliance => {
            config.per_tx_limit_usd = 1_000;
            config.daily_limit_usd = 5_000;
            config.weekly_limit_usd = Some(20_000);
            config.max_counterparty_risk_score = Some(40);
            config.bitcoin_manual_review_threshold_usd = 500;
            config.max_slippage_bps = 50;
            config.cooldown_config = Some(CooldownConfig {
                threshold_usd: 1_000,
                cooldown_secs: 3_600,
            });
            config.liveness_config = LivenessConfig {
                require_balance_oracle_freshness: true,
                require_compliance_oracle_freshness: true,
                max_staleness_secs: 3_600,
                ..LivenessConfig::default()
            };
            config.approval_ladder = Some(ApprovalLadder {
                guardian_above_usd: 750,
                multisig_above_usd: 2_500,
                timelock_above_usd: 4_000,
                deny_above_usd: 10_000,
                ..ApprovalLadder::default()
            });
        }
        PolicyPresetKind::IntegrationTestFastPath => {
            config.per_tx_limit_usd = 1_000_000;
            config.daily_limit_usd = 5_000_000;
            config.daytime_hourly_limit_usd = 5_000_000;
            config.nighttime_hourly_limit_usd = 5_000_000;
            config.velocity_limit_usd = 5_000_000;
            config.weekly_limit_usd = None;
            config.monthly_limit_usd = None;
            config.budget_envelopes = BudgetEnvelopeSet::default();
        }
        PolicyPresetKind::TradingDesk => {
            config.per_tx_limit_usd = 50_000;
            config.daily_limit_usd = 250_000;
            config.weekly_limit_usd = Some(1_000_000);
            config.velocity_limit_usd = 500_000;
            config.max_slippage_bps = 50;
            config.cooldown_config = Some(CooldownConfig {
                threshold_usd: 100_000,
                cooldown_secs: 60,
            });
            config.anomaly_config = Some(AnomalyConfig {
                enabled: true,
                z_score_threshold_bps: 20_000,
                min_sample_size: 5,
                action: AnomalyAction::FlagForReview,
            });
            config.approval_ladder = Some(ApprovalLadder {
                guardian_above_usd: 100_000,
                multisig_above_usd: 250_000,
                timelock_above_usd: 400_000,
                deny_above_usd: 1_000_000,
                ..ApprovalLadder::default()
            });
        }
        PolicyPresetKind::PayrollSweep => {
            config.per_tx_limit_usd = 5_000;
            config.daily_limit_usd = 100_000;
            config.weekly_limit_usd = Some(500_000);
            config.monthly_limit_usd = Some(1_500_000);
            config.velocity_limit_usd = 100_000;
            // Transfers only — no DeFi protocols whitelisted.
            config.allowed_protocol_bitmap = 0;
            config.approval_ladder = Some(ApprovalLadder {
                guardian_above_usd: 10_000,
                multisig_above_usd: 50_000,
                timelock_above_usd: 75_000,
                deny_above_usd: 150_000,
                ..ApprovalLadder::default()
            });
        }
        PolicyPresetKind::GrantDisbursement => {
            config.per_tx_limit_usd = 25_000;
            config.daily_limit_usd = 50_000;
            config.monthly_limit_usd = Some(200_000);
            config.velocity_limit_usd = 50_000;
            config.cooldown_config = Some(CooldownConfig {
                threshold_usd: 25_000,
                cooldown_secs: 86_400,
            });
            config.approval_ladder = Some(ApprovalLadder {
                guardian_above_usd: 10_000,
                multisig_above_usd: 50_000,
                timelock_above_usd: 100_000,
                deny_above_usd: 200_000,
                ..ApprovalLadder::default()
            });
        }
        PolicyPresetKind::MevSearcher => {
            config.per_tx_limit_usd = 100_000;
            config.daily_limit_usd = 2_000_000;
            config.weekly_limit_usd = Some(10_000_000);
            config.velocity_limit_usd = 5_000_000;
            config.max_counterparty_risk_score = Some(20);
            config.cooldown_config = None;
            config.approval_ladder = Some(ApprovalLadder {
                guardian_above_usd: 500_000,
                multisig_above_usd: 1_000_000,
                timelock_above_usd: 1_500_000,
                deny_above_usd: 5_000_000,
                ..ApprovalLadder::default()
            });
        }
        PolicyPresetKind::TreasuryColdStorage => {
            config.per_tx_limit_usd = 500;
            config.daily_limit_usd = 1_000;
            config.weekly_limit_usd = Some(2_000);
            config.monthly_limit_usd = Some(5_000);
            config.velocity_limit_usd = 1_000;
            config.max_counterparty_risk_score = Some(10);
            config.approval_ladder = Some(ApprovalLadder {
                guardian_above_usd: 100,
                multisig_above_usd: 200,
                timelock_above_usd: 400,
                deny_above_usd: 1_000,
                ..ApprovalLadder::default()
            });
        }
    }
    config
}
