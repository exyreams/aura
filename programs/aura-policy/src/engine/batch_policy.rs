use crate::{
    config::{required_approval_level, ApprovalLevel, PolicyConfig},
    context::{PolicyEvaluationContext, TransactionContext},
    engine::evaluate_transaction,
    state::PolicyState,
    types::{Chain, TransactionType},
    violations::ViolationCode,
};

pub const MAX_BATCH_ITEMS: usize = 8;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BatchProposalItem {
    pub amount_usd: u64,
    pub chain: Chain,
    pub tx_type: TransactionType,
    pub recipient_or_contract: String,
    pub protocol_id: Option<u8>,
}

impl BatchProposalItem {
    pub fn to_transaction_context(&self, now: i64) -> TransactionContext {
        TransactionContext {
            amount_usd: self.amount_usd,
            target_chain: self.chain,
            tx_type: self.tx_type,
            protocol_id: self.protocol_id,
            current_timestamp: now,
            expected_output_usd: None,
            actual_output_usd: None,
            quote_age_secs: None,
            counterparty_risk_score: None,
            recipient_or_contract: Some(self.recipient_or_contract.clone()),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct BatchPolicyDecision {
    pub approved: bool,
    pub violation: ViolationCode,
    pub aggregate_amount_usd: u64,
    pub item_count: usize,
    pub required_approval_level: ApprovalLevel,
    pub item_violations: Vec<ViolationCode>,
    pub next_state: PolicyState,
}

pub fn evaluate_batch_policy(
    config: &PolicyConfig,
    previous_state: &PolicyState,
    items: &[BatchProposalItem],
    now: i64,
) -> BatchPolicyDecision {
    if items.is_empty() {
        return failed_batch(
            ViolationCode::EmptyBatch,
            0,
            items.len(),
            ApprovalLevel::None,
            previous_state.clone(),
            Vec::new(),
        );
    }
    if items.len() > MAX_BATCH_ITEMS {
        return failed_batch(
            ViolationCode::BatchTooLarge,
            0,
            items.len(),
            ApprovalLevel::None,
            previous_state.clone(),
            Vec::new(),
        );
    }

    let aggregate = items
        .iter()
        .fold(0u64, |acc, item| acc.saturating_add(item.amount_usd));
    if aggregate > config.daily_limit_usd {
        return failed_batch(
            ViolationCode::DailyLimit,
            aggregate,
            items.len(),
            ApprovalLevel::Deny,
            previous_state.clone(),
            Vec::new(),
        );
    }

    let mut state = previous_state.clone();
    let mut item_violations = Vec::with_capacity(items.len());
    let mut required = ApprovalLevel::None;

    for item in items {
        let tx = item.to_transaction_context(now);
        let context = PolicyEvaluationContext::from(tx.clone());
        let decision = evaluate_transaction(config, &state, &context);
        item_violations.push(decision.violation);
        if !decision.approved {
            return failed_batch(
                decision.violation,
                aggregate,
                items.len(),
                ApprovalLevel::Deny,
                state,
                item_violations,
            );
        }
        if let Some(ladder) = config.approval_ladder {
            let level = required_approval_level(
                &ladder,
                item.amount_usd,
                u16::from(decision.risk_score) * 100,
            );
            required = required.max(level);
            if level == ApprovalLevel::Deny {
                return failed_batch(
                    ViolationCode::ApprovalLadderDenied,
                    aggregate,
                    items.len(),
                    level,
                    state,
                    item_violations,
                );
            }
        }
        state = decision.next_state;
    }

    BatchPolicyDecision {
        approved: true,
        violation: ViolationCode::None,
        aggregate_amount_usd: aggregate,
        item_count: items.len(),
        required_approval_level: required,
        item_violations,
        next_state: state,
    }
}

fn failed_batch(
    violation: ViolationCode,
    aggregate_amount_usd: u64,
    item_count: usize,
    required_approval_level: ApprovalLevel,
    next_state: PolicyState,
    item_violations: Vec<ViolationCode>,
) -> BatchPolicyDecision {
    BatchPolicyDecision {
        approved: false,
        violation,
        aggregate_amount_usd,
        item_count,
        required_approval_level,
        item_violations,
        next_state,
    }
}
