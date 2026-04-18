use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED, instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
};

#[derive(Accounts)]
pub struct CollectOverrideSignature<'info> {
    pub guardian: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, TreasuryAccount>,
}

/// Adds the calling guardian's signature to the pending override proposal.
///
/// If the proposal reaches quorum after this signature, the override is
/// applied immediately and the daily limit is updated. Emits an
/// `OverrideExecuted` audit event if quorum is reached.
pub fn handler(ctx: Context<CollectOverrideSignature>, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain()?;
    let multisig = domain
        .multisig
        .as_mut()
        .ok_or_else(|| crate::map_treasury_error(crate::TreasuryError::NoActiveOverride))?;
    multisig
        .collect_signature(&ctx.accounts.guardian.key().to_string())
        .map_err(crate::map_treasury_error)?;
    let _ = domain
        .apply_ready_override(now)
        .map_err(crate::map_treasury_error)?;

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}
