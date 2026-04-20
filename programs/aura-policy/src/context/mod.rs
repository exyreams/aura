/// Input context types passed to the policy engine.
///
/// - `TransactionContext`      — the raw transaction parameters submitted by the AI
/// - `PolicyEvaluationContext` — wraps `TransactionContext` with runtime state
///   (reputation score, swarm pool spend) needed by
///   rules that go beyond the transaction itself
mod evaluation;
mod transaction;

pub use evaluation::PolicyEvaluationContext;
pub use transaction::TransactionContext;
