use super::*;

pub const EXTERNAL_LIVENESS_SPACE: usize = 8 + 256;

#[account]
#[derive(InitSpace)]
pub struct ExternalLivenessAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub encrypt_last_verified_at: i64,
    pub dwallet_last_verified_at: i64,
    pub balance_oracle_last_verified_at: i64,
    pub compliance_oracle_last_verified_at: i64,
    pub max_staleness_secs: i64,
    pub updated_by: Pubkey,
}

impl ExternalLivenessAccount {
    pub fn fresh(last_verified_at: i64, max_age: i64, now: i64) -> bool {
        last_verified_at > 0 && now.saturating_sub(last_verified_at) <= max_age
    }

    pub fn require_encrypt_fresh(&self, now: i64) -> Result<()> {
        require!(
            Self::fresh(self.encrypt_last_verified_at, self.max_staleness_secs, now),
            AuraCoreError::ExternalDependencyStale
        );
        Ok(())
    }

    pub fn require_dwallet_fresh(&self, now: i64) -> Result<()> {
        require!(
            Self::fresh(self.dwallet_last_verified_at, self.max_staleness_secs, now),
            AuraCoreError::ExternalDependencyStale
        );
        Ok(())
    }
}
