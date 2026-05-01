//! Anchor account records for policy attestations.
//!
//! These PDAs bind a policy version to a deterministic hash and attester, giving
//! off-chain operators an indexable proof that a policy was reviewed.

use super::*;

/// Allocated size for a `PolicyAttestationAccount`.
pub const POLICY_ATTESTATION_SPACE: usize = 8 + 256;

/// Persistent attestation for one treasury policy version.
#[account]
#[derive(InitSpace)]
pub struct PolicyAttestationAccount {
    /// PDA bump for the attestation account.
    pub bump: u8,
    /// Treasury this attestation belongs to.
    pub treasury: Pubkey,
    /// Treasury policy version that was attested.
    pub policy_version: u32,
    /// SHA-256 hash of the serialized policy config.
    pub policy_hash: [u8; 32],
    /// Signer that made the attestation.
    pub attester: Pubkey,
    /// Caller-defined attestation category.
    pub attestation_kind: u8,
    /// Unix timestamp when the attestation was written.
    pub attested_at: i64,
}
