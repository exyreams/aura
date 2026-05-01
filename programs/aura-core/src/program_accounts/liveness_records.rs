//! Anchor account records for external dependency liveness.
//!
//! Liveness accounts track when external services were last verified so
//! instruction handlers can require fresh Encrypt, dWallet, oracle, or
//! compliance evidence before sensitive execution steps.

use super::*;

/// Allocated size for an `ExternalLivenessAccount`.
pub const EXTERNAL_LIVENESS_SPACE: usize = 8 + 256;

/// Freshness record for services a treasury depends on.
#[account]
#[derive(InitSpace)]
pub struct ExternalLivenessAccount {
    /// PDA bump for the liveness account.
    pub bump: u8,
    /// Treasury this liveness record belongs to.
    pub treasury: Pubkey,
    /// Last timestamp when Encrypt service health was verified.
    pub encrypt_last_verified_at: i64,
    /// Last timestamp when dWallet service health was verified.
    pub dwallet_last_verified_at: i64,
    /// Last timestamp when the balance oracle was verified.
    pub balance_oracle_last_verified_at: i64,
    /// Last timestamp when the compliance oracle was verified.
    pub compliance_oracle_last_verified_at: i64,
    /// Maximum allowed age before a dependency is considered stale.
    pub max_staleness_secs: i64,
    /// Last signer that refreshed any dependency timestamp.
    pub updated_by: Pubkey,
}

impl ExternalLivenessAccount {
    /// Returns true when `last_verified_at` is positive and within `max_age`.
    pub fn fresh(last_verified_at: i64, max_age: i64, now: i64) -> bool {
        last_verified_at > 0 && now.saturating_sub(last_verified_at) <= max_age
    }

    /// Fails if Encrypt freshness is outside the allowed staleness window.
    pub fn require_encrypt_fresh(&self, now: i64) -> Result<()> {
        require!(
            Self::fresh(self.encrypt_last_verified_at, self.max_staleness_secs, now),
            AuraCoreError::ExternalDependencyStale
        );
        Ok(())
    }

    /// Fails if dWallet freshness is outside the allowed staleness window.
    pub fn require_dwallet_fresh(&self, now: i64) -> Result<()> {
        require!(
            Self::fresh(self.dwallet_last_verified_at, self.max_staleness_secs, now),
            AuraCoreError::ExternalDependencyStale
        );
        Ok(())
    }
}
