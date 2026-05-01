use crate::{
    config::PolicyConfig, context::PolicyEvaluationContext, decision::PolicyDecision,
    engine::evaluate_transaction, state::PolicyState,
};

pub fn evaluate_policy_without_spend_mutation(
    config: &PolicyConfig,
    state: &PolicyState,
    context: &PolicyEvaluationContext,
) -> PolicyDecision {
    evaluate_transaction(config, state, context)
}
