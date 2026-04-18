use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED, instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
};

#[derive(Accounts)]
pub struct CancelPending<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Account<'info, TreasuryAccount>,
}

/// Cancels the pending transaction on the treasury.
///
/// Only the treasury owner may cancel. Emits a `ProposalCancelled` audit event.
pub fn handler(ctx: Context<CancelPending>, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain()?;
    domain
        .cancel_pending(&ctx.accounts.owner.key().to_string(), now)
        .map_err(crate::map_treasury_error)?;

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}
