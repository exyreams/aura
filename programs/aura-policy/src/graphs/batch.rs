use super::spec::PolicyGraphSpec;

/// Returns the spec for the batch transaction evaluation graph.
///
/// Used by `evaluate_batch_preview` for off-chain simulation of queued
/// or previewed transactions.
pub fn batch_policy_graph() -> PolicyGraphSpec {
    PolicyGraphSpec {
        name: "evaluate_transaction_batch",
        outputs: &["batch_results", "final_policy_state"],
        uses_update_mode: true,
        requires_decryption: true,
        purpose: "Batch evaluation graph for queued or previewed transactions.",
    }
}
