/// Escalation level required before a transaction can execute.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Default)]
pub enum ApprovalLevel {
    #[default]
    None = 0,
    Guardian = 1,
    Multisig = 2,
    Timelock = 3,
    Deny = 4,
}

impl ApprovalLevel {
    pub fn code(self) -> u8 {
        self as u8
    }

    pub fn from_code(code: u8) -> Option<Self> {
        match code {
            0 => Some(Self::None),
            1 => Some(Self::Guardian),
            2 => Some(Self::Multisig),
            3 => Some(Self::Timelock),
            4 => Some(Self::Deny),
            _ => None,
        }
    }
}

/// Risk and amount thresholds used to escalate a policy decision.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ApprovalLadder {
    pub guardian_above_usd: u64,
    pub multisig_above_usd: u64,
    pub timelock_above_usd: u64,
    pub deny_above_usd: u64,
    pub risk_guardian_bps: u16,
    pub risk_multisig_bps: u16,
    pub risk_timelock_bps: u16,
    pub timelock_secs: i64,
}

impl Default for ApprovalLadder {
    fn default() -> Self {
        Self {
            guardian_above_usd: 2_500,
            multisig_above_usd: 7_500,
            timelock_above_usd: 15_000,
            deny_above_usd: 50_000,
            risk_guardian_bps: 5_000,
            risk_multisig_bps: 7_500,
            risk_timelock_bps: 9_000,
            timelock_secs: 3_600,
        }
    }
}

pub fn required_approval_level(
    ladder: &ApprovalLadder,
    amount_usd: u64,
    risk_score_bps: u16,
) -> ApprovalLevel {
    if amount_usd >= ladder.deny_above_usd {
        return ApprovalLevel::Deny;
    }
    if amount_usd >= ladder.timelock_above_usd || risk_score_bps >= ladder.risk_timelock_bps {
        return ApprovalLevel::Timelock;
    }
    if amount_usd >= ladder.multisig_above_usd || risk_score_bps >= ladder.risk_multisig_bps {
        return ApprovalLevel::Multisig;
    }
    if amount_usd >= ladder.guardian_above_usd || risk_score_bps >= ladder.risk_guardian_bps {
        return ApprovalLevel::Guardian;
    }
    ApprovalLevel::None
}
