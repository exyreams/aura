use super::{AnomalyAction, AnomalyConfig, ApprovalLadder, BudgetEnvelopeSet, PolicyConfig};

#[repr(u8)]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum PolicyPresetKind {
    ConservativeDao = 1,
    AiAgentOps = 2,
    HighTrustExecutor = 3,
    StrictCompliance = 4,
    IntegrationTestFastPath = 5,
}

impl PolicyPresetKind {
    pub fn from_code(code: u8) -> Option<Self> {
        match code {
            1 => Some(Self::ConservativeDao),
            2 => Some(Self::AiAgentOps),
            3 => Some(Self::HighTrustExecutor),
            4 => Some(Self::StrictCompliance),
            5 => Some(Self::IntegrationTestFastPath),
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
        }
        PolicyPresetKind::HighTrustExecutor => {
            config.per_tx_limit_usd = 10_000;
            config.daily_limit_usd = 50_000;
            config.weekly_limit_usd = Some(150_000);
            config.monthly_limit_usd = Some(500_000);
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
            config.max_counterparty_risk_score = Some(40);
            config.bitcoin_manual_review_threshold_usd = 500;
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
    }
    config
}
