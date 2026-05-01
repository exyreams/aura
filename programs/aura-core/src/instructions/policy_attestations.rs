//! Write signed policy attestation records.
//!
//! Attestations bind an attester to the exact hash of the treasury policy
//! configuration for a given policy version.

use anchor_lang::prelude::*;
use sha2::{Digest, Sha256};

use crate::{
    constants::{POLICY_ATTESTATION_SEED, TREASURY_SEED},
    program_accounts::{PolicyAttestationAccount, TreasuryAccount, POLICY_ATTESTATION_SPACE},
};

/// Instruction data for `attest_policy`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct AttestPolicyArgs {
    /// Caller-defined attestation type code.
    pub attestation_kind: u8,
    /// SHA-256 hash expected for the treasury policy config record.
    pub expected_policy_hash: [u8; 32],
    /// Unix timestamp recorded on the attestation.
    pub now: i64,
}

#[derive(Accounts)]
#[instruction(args: AttestPolicyArgs)]
pub struct AttestPolicy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    pub attester: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = payer,
        space = POLICY_ATTESTATION_SPACE,
        seeds = [
            POLICY_ATTESTATION_SEED,
            treasury.key().as_ref(),
            attester.key().as_ref(),
            &treasury.current_policy_version.to_le_bytes()
        ],
        bump
    )]
    pub attestation: Box<Account<'info, PolicyAttestationAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn attest_policy(ctx: Context<AttestPolicy>, args: AttestPolicyArgs) -> Result<()> {
    let mut bytes = Vec::new();
    ctx.accounts.treasury.policy_config.serialize(&mut bytes)?;
    let actual_hash: [u8; 32] = Sha256::digest(&bytes).into();
    require!(
        actual_hash == args.expected_policy_hash,
        crate::AuraCoreError::PolicyAttestationMismatch
    );
    let attestation = &mut ctx.accounts.attestation;
    attestation.bump = ctx.bumps.attestation;
    attestation.treasury = ctx.accounts.treasury.key();
    attestation.policy_version = ctx.accounts.treasury.current_policy_version;
    attestation.policy_hash = actual_hash;
    attestation.attester = ctx.accounts.attester.key();
    attestation.attestation_kind = args.attestation_kind;
    attestation.attested_at = args.now;
    Ok(())
}
