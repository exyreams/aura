/// Metadata descriptor for a compiled FHE policy graph.
///
/// Used by the execution layer to validate that the graph name stored on a
/// `PendingTransaction` matches the graph that was actually evaluated, and to
/// communicate graph capabilities to off-chain tooling.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PolicyGraphSpec {
    /// Unique name identifying this graph version (e.g. `"confidential_spend_guardrails_scalar_v1"`).
    pub name: &'static str,
    /// Names of the output ciphertext slots produced by this graph.
    pub outputs: &'static [&'static str],
    /// Whether this graph uses Encrypt's update mode (overwrites an existing ciphertext in-place).
    pub uses_update_mode: bool,
    /// Whether the output ciphertext must be decrypted before the proposal can be finalized.
    pub requires_decryption: bool,
    /// Human-readable description of what this graph evaluates.
    pub purpose: &'static str,
}
