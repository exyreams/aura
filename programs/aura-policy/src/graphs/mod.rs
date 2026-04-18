/// FHE policy graph specifications and compiled graph bytes for `aura-policy`.
///
/// Each graph is defined using the `encrypt_dsl` `#[encrypt_fn]` macro, which
/// compiles the function body into a serialized FHE circuit. The compiled bytes
/// are submitted to the Encrypt program via CPI to evaluate policy rules over
/// encrypted inputs without revealing the underlying values.
///
/// Available graphs:
/// - `transaction_policy_graph`                    — spec for the public evaluation graph
/// - `advanced_policy_graph`                       — spec for the advanced guardrails graph
/// - `batch_policy_graph`                          — spec for the batch preview graph
/// - `confidential_scalar_policy_graph`            — spec for the scalar FHE guardrails graph
/// - `confidential_policy_graph`                   — spec for the vector FHE guardrails graph
/// - `confidential_spend_guardrails_graph_bytes`   — compiled scalar graph bytes
/// - `confidential_spend_guardrails_vector_graph_bytes` — compiled vector graph bytes
/// - `execute_confidential_spend_guardrails_graph` — CPI helper for scalar graph
/// - `execute_confidential_spend_guardrails_vector_graph` — CPI helper for vector graph
mod advanced;
mod batch;
mod confidential;
mod spec;
mod transaction;

pub use advanced::advanced_policy_graph;
pub use batch::batch_policy_graph;
pub use confidential::{
    confidential_policy_graph, confidential_scalar_policy_graph,
    confidential_spend_guardrails_graph_bytes, confidential_spend_guardrails_vector_graph_bytes,
    execute_confidential_spend_guardrails_graph,
    execute_confidential_spend_guardrails_vector_graph,
};
pub use spec::PolicyGraphSpec;
pub use transaction::transaction_policy_graph;
