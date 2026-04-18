use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED, instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
};

#[derive(Accounts)]
pub struct ProposeOverride<'info> {
    pub guardian: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump
    )]
    pub treasury: Account<'info, TreasuryAccount>,
}

/// Submits a new emergency override proposal from a guardian.
///
/// The proposing guardian is automatically counted as the first signature.
/// If the multisig reaches quorum immediately (e.g. `required_signatures == 1`),
/// the override is applied in the same instruction. Emits `OverrideExecuted`
/// if quorum is reached.
pub fn handler(ctx: Context<ProposeOverride>, new_daily_limit_usd: u64, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain()?;
    let multisig = domain
        .multisig
        .as_mut()
        .ok_or_else(|| crate::map_treasury_error(crate::TreasuryError::NoActiveOverride))?;
    multisig
        .propose(
            &ctx.accounts.guardian.key().to_string(),
            new_daily_limit_usd,
            now,
        )
        .map_err(crate::map_treasury_error)?;
    let _ = domain
        .apply_ready_override(now)
        .map_err(crate::map_treasury_error)?;

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}
