//! Sidecar account for the expanded confidential guardrail lifecycle.
//!
//! The treasury keeps its original three-pointer `ConfidentialGuardrailsRecord`
//! for back-compat; this sidecar holds the full expanded posture (epoch marker,
//! enabled flag, and the additional encrypted limit/counter pointers) so the
//! treasury record stays within the SBF stack-frame limit. When present and
//! enabled, the confidential path reads guardrails from here.

use super::*;

/// Allocated size for a `ConfidentialGuardrailsAccount`.
pub const CONFIDENTIAL_GUARDRAILS_SPACE: usize = 8 + ConfidentialGuardrailsAccount::INIT_SPACE;

#[account]
#[derive(InitSpace)]
pub struct ConfidentialGuardrailsAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    /// Encrypt network epoch these ciphertexts were produced under.
    pub epoch_id: u64,
    /// Whether confidential evaluation is active (disable without teardown).
    pub enabled: bool,
    pub updated_at: i64,
    // Encrypted limits.
    pub daily_limit_ciphertext: Option<Pubkey>,
    pub per_tx_limit_ciphertext: Option<Pubkey>,
    pub velocity_limit_ciphertext: Option<Pubkey>,
    pub hourly_limit_ciphertext: Option<Pubkey>,
    pub weekly_limit_ciphertext: Option<Pubkey>,
    // Encrypted counters (update-mode / reset targets).
    pub spent_today_ciphertext: Option<Pubkey>,
    pub hourly_spent_ciphertext: Option<Pubkey>,
    pub velocity_window_ciphertext: Option<Pubkey>,
}

impl ConfidentialGuardrailsAccount {
    /// Whether the guardrails are usable: enabled and matching the live epoch.
    pub fn assert_usable(&self, current_epoch: u64) -> Result<()> {
        require!(self.enabled, AuraCoreError::ConfidentialGuardrailsDisabled);
        require!(
            self.epoch_id == current_epoch,
            AuraCoreError::GuardrailEpochMismatch
        );
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn guardrails(epoch_id: u64, enabled: bool) -> ConfidentialGuardrailsAccount {
        ConfidentialGuardrailsAccount {
            bump: 1,
            treasury: Pubkey::new_unique(),
            epoch_id,
            enabled,
            updated_at: 0,
            daily_limit_ciphertext: None,
            per_tx_limit_ciphertext: None,
            velocity_limit_ciphertext: None,
            hourly_limit_ciphertext: None,
            weekly_limit_ciphertext: None,
            spent_today_ciphertext: None,
            hourly_spent_ciphertext: None,
            velocity_window_ciphertext: None,
        }
    }

    #[test]
    fn usable_only_when_enabled_and_epoch_matches() {
        assert!(guardrails(5, true).assert_usable(5).is_ok());
        // Stale epoch is rejected.
        assert!(guardrails(4, true).assert_usable(5).is_err());
        // Disabled guardrails are rejected even at the right epoch.
        assert!(guardrails(5, false).assert_usable(5).is_err());
    }
}
