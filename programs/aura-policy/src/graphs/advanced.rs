use super::spec::PolicyGraphSpec;

/// Returns the spec for the advanced guardrails graph.
///
/// Used as the fallback graph name when the public pre-check denies a
/// confidential proposal — the decision is recorded immediately without
/// FHE evaluation, but the graph name is still stored for audit purposes.
pub fn advanced_policy_graph() -> PolicyGraphSpec {
    PolicyGraphSpec {
        name: "evaluate_advanced_guardrails",
        outputs: &[
            "is_approved",
            "effective_daily_limit",
            "shared_pool_result",
            "violation_code",
        ],
        uses_update_mode: true,
        requires_decryption: true,
        purpose: "Advanced guardrail graph including reputation scaling and swarm checks.",
    }
}
