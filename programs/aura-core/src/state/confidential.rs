/// Encrypt ciphertext account addresses for FHE-based policy evaluation.
///
/// AURA keeps confidential guardrails in scalar ciphertext accounts. The policy
/// graph updates the encrypted spent-today counter in-place and only decrypts a
/// tiny violation code for the dWallet execution boundary.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ConfidentialGuardrails {
    /// Ciphertext account for the encrypted daily spending limit.
    pub daily_limit_ciphertext: Option<String>,
    /// Ciphertext account for the encrypted per-transaction limit.
    pub per_tx_limit_ciphertext: Option<String>,
    /// Ciphertext account for the encrypted spent-today counter.
    pub spent_today_ciphertext: Option<String>,
}
