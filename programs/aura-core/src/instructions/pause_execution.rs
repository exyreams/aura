use anchor_lang::prelude::*;

use crate::{
    constants::TREASURY_SEED, instructions::sync_treasury_account,
    program_accounts::TreasuryAccount,
};

#[derive(Accounts)]
pub struct PauseExecution<'info> {
    pub owner: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ crate::AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Account<'info, TreasuryAccount>,
}

/// Pauses or resumes execution on the treasury.
///
/// When `paused` is `true`, `propose_transaction` and `execute_pending` will
/// return `ExecutionPaused` until this instruction is called again with
/// `paused = false`. Only the treasury owner may call this instruction.
/// Emits `ExecutionPaused` or `ExecutionResumed` audit events accordingly.
pub fn handler(ctx: Context<PauseExecution>, paused: bool, now: i64) -> Result<()> {
    let mut domain = ctx.accounts.treasury.to_domain()?;
    domain
        .set_execution_paused(&ctx.accounts.owner.key().to_string(), paused, now)
        .map_err(crate::map_treasury_error)?;

    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}
