use crate::{config::ApprovalLevel, decision::PolicyDecision};

use super::PolicyDecisionReceiptFields;

pub fn rule_outcome_bitmap(decision: &PolicyDecision) -> u128 {
    decision
        .trace
        .iter()
        .take(128)
        .enumerate()
        .fold(0u128, |bitmap, (idx, outcome)| {
            if outcome.passed {
                bitmap | (1u128 << idx)
            } else {
                bitmap
            }
        })
}

pub fn explain_decision(
    decision: &PolicyDecision,
    current_spent_today_usd: u64,
    required_approval_level: ApprovalLevel,
) -> PolicyDecisionReceiptFields {
    PolicyDecisionReceiptFields {
        decision: u8::from(decision.approved),
        primary_violation: decision.violation as u16,
        risk_score_bps: u16::from(decision.risk_score) * 100,
        rule_outcome_bitmap: rule_outcome_bitmap(decision),
        required_approval_level: required_approval_level.code(),
        effective_limit_usd: decision.effective_daily_limit_usd,
        remaining_daily_usd: decision
            .effective_daily_limit_usd
            .saturating_sub(current_spent_today_usd),
    }
}
