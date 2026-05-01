use anchor_lang::prelude::*;

use crate::{
    constants::{
        CURRENT_SCHEMA_VERSION, INVARIANT_REPORT_SEED, MAX_PENDING_QUEUE_DEPTH, TREASURY_SEED,
    },
    program_accounts::{InvariantReportAccount, TreasuryAccount, INVARIANT_REPORT_SPACE},
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CheckInvariantsArgs {
    pub report_id: u64,
    pub now: i64,
}

#[derive(Accounts)]
#[instruction(args: CheckInvariantsArgs)]
pub struct CheckInvariants<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()], bump = treasury.bump)]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = payer,
        space = INVARIANT_REPORT_SPACE,
        seeds = [INVARIANT_REPORT_SEED, treasury.key().as_ref(), &args.report_id.to_le_bytes()],
        bump
    )]
    pub report: Box<Account<'info, InvariantReportAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn check_invariants(ctx: Context<CheckInvariants>, args: CheckInvariantsArgs) -> Result<()> {
    let report = &mut ctx.accounts.report;
    report.bump = ctx.bumps.report;
    report.treasury = ctx.accounts.treasury.key();
    report.checked_at = args.now;
    report.checked_at_slot = Clock::get()?.slot;
    report.schema_version = ctx.accounts.treasury.schema_version;
    report.policy_version = ctx.accounts.treasury.current_policy_version;
    report.passed_bitmap = 0;
    report.failed_bitmap = 0;
    report.warning_bitmap = 0;
    report.mark(
        0,
        ctx.accounts.treasury.schema_version == CURRENT_SCHEMA_VERSION,
    );
    report.mark(1, ctx.accounts.treasury.current_policy_version > 0);
    report.mark(
        2,
        ctx.accounts.treasury.pending_queue.len() <= MAX_PENDING_QUEUE_DEPTH,
    );
    report.mark(3, ctx.accounts.treasury.owner != Pubkey::default());
    report.mark(4, ctx.accounts.treasury.ai_authority != Pubkey::default());
    report.mark(5, ctx.accounts.treasury.policy_config.daily_limit_usd > 0);
    report.mark(6, ctx.accounts.treasury.policy_config.per_tx_limit_usd > 0);
    if ctx.accounts.treasury.execution_paused {
        report.warn(0);
    }
    Ok(())
}
