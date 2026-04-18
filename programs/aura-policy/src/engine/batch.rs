use crate::{
    config::PolicyConfig, context::PolicyEvaluationContext, decision::PolicyDecision,
    engine::evaluator::evaluate_transaction, state::PolicyState,
};

/// Evaluates a slice of transactions sequentially, threading policy state
/// forward between each decision.
///
/// Each transaction is evaluated against the state produced by the previous
/// one, so later transactions in the batch see the spending counters updated
/// by earlier ones. Used by `evaluate_batch_preview` in `aura-core` for
/// off-chain simulation without mutating the treasury.
pub fn evaluate_batch(
    config: &PolicyConfig,
    previous_state: &PolicyState,
    contexts: &[PolicyEvaluationContext],
) -> Vec<PolicyDecision> {
    let mut state = previous_state.clone();
    let mut decisions = Vec::with_capacity(contexts.len());

    for context in contexts {
        let decision = evaluate_transaction(config, &state, context);
        state = decision.next_state.clone();
        decisions.push(decision);
    }

    decisions
}
