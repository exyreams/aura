use super::transaction::TransactionContext;

/// The full input to the policy engine for a single evaluation pass.
///
/// Wraps `TransactionContext` with additional runtime state that individual
/// rules need but that is not part of the transaction itself.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyEvaluationContext {
    /// The transaction being evaluated.
    pub transaction: TransactionContext,
    /// The agent's current reputation score (0–100), used for limit scaling.
    /// `None` if no reputation data is available (treated as neutral, 1× multiplier).
    pub reputation_score: Option<u64>,
    /// Total USD already spent by all members of the agent's swarm, used for
    /// the shared-pool limit check. `None` if the agent is not in a swarm.
    pub shared_spent_usd: Option<u64>,
}

impl From<TransactionContext> for PolicyEvaluationContext {
    fn from(transaction: TransactionContext) -> Self {
        Self {
            transaction,
            reputation_score: None,
            shared_spent_usd: None,
        }
    }
}
