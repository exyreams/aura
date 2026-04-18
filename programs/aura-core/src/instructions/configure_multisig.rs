use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED, governance::EmergencyMultisig, instructions::sync_treasury_account,
    program_accounts::TreasuryAccount, AuraCoreError,
};

/// Instruction data for `configure_multisig`.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ConfigureMultisigArgs {
    /// Number of guardian signatures required to reach quorum (must be > 0
    /// and ≤ `guardians.len()`).
    pub required_signatures: u8,
    /// Public keys of all registered guardians.
    pub guardians: Vec<Pubkey>,
    /// Unix timestamp used for the audit event.
    pub timestamp: i64,
}

#[derive(Accounts)]
pub struct ConfigureMultisig<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Account<'info, TreasuryAccount>,
}

/// Attaches or replaces the emergency multisig configuration on the treasury.
///
/// Validates that `required_signatures > 0` and does not exceed the number
/// of guardians. Only the treasury owner may call this instruction.
/// Emits a `MultisigAttached` audit event.
pub fn handler(ctx: Context<ConfigureMultisig>, args: ConfigureMultisigArgs) -> Result<()> {
    require!(
        !args.guardians.is_empty()
            && args.required_signatures > 0
            && usize::from(args.required_signatures) <= args.guardians.len(),
        AuraCoreError::InvalidGuardianConfiguration
    );

    let mut domain = ctx.accounts.treasury.to_domain()?;
    let multisig = EmergencyMultisig {
        required_signatures: usize::from(args.required_signatures),
        guardians: args.guardians.iter().map(ToString::to_string).collect(),
        pending_override: None,
    };
    domain.attach_multisig(multisig, args.timestamp);

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.timestamp)
}
