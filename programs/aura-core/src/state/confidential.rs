/// Encrypt ciphertext account addresses for FHE-based policy evaluation.
///
/// Exactly one of the two modes is active at a time:
/// - Scalar mode: three separate `u64` ciphertext accounts
///   (`daily_limit_ciphertext`, `per_tx_limit_ciphertext`, `spent_today_ciphertext`)
/// - Vector mode: a single `EUint64Vector` ciphertext
///   (`guardrail_vector_ciphertext`) encoding all three values in one account
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfidentialGuardrails {
    /// Ciphertext account for the encrypted daily spending limit (scalar mode).
    pub daily_limit_ciphertext: Option<String>,
    /// Ciphertext account for the encrypted per-transaction limit (scalar mode).
    pub per_tx_limit_ciphertext: Option<String>,
    /// Ciphertext account for the encrypted spent-today counter (scalar mode).
    pub spent_today_ciphertext: Option<String>,
    /// Ciphertext account for the encrypted `[daily_limit, per_tx_limit, spent_today]`
    /// vector (vector mode). Rotated forward after each approved proposal.
    pub guardrail_vector_ciphertext: Option<String>,
}
