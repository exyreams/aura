use super::spec::PolicyGraphSpec;

/// Returns the spec for the primary public transaction evaluation graph.
///
/// Used by `propose_transaction` to record the graph name on the pending
/// transaction and by `confirm_policy_decryption` to validate it.
pub fn transaction_policy_graph() -> PolicyGraphSpec {
    PolicyGraphSpec {
        name: "evaluate_agent_transaction",
        outputs: &[
            "is_approved",
            "next_policy_state",
            "violation_code",
            "rule_trace",
        ],
        uses_update_mode: true,
        requires_decryption: true,
        purpose: "Primary transaction approval graph for single proposal evaluation.",
    }
}
