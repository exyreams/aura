use super::*;

pub const POLICY_ATTESTATION_SPACE: usize = 8 + 256;

#[account]
#[derive(InitSpace)]
pub struct PolicyAttestationAccount {
    pub bump: u8,
    pub treasury: Pubkey,
    pub policy_version: u32,
    pub policy_hash: [u8; 32],
    pub attester: Pubkey,
    pub attestation_kind: u8,
    pub attested_at: i64,
}
