//! Analytics + audit-commitment sidecar lifecycle.
//!
//! `init`/`close` for the `TreasuryAnalyticsAccount`. The aggregates and the
//! rolling `audit_root` are advanced at the execution/decision boundary
//! (`finalize_execution`) when the optional account is supplied.

use anchor_lang::prelude::*;

use crate::{
    constants::{TREASURY_ANALYTICS_SEED, TREASURY_SEED},
    program_accounts::{TreasuryAccount, TreasuryAnalyticsAccount, TREASURY_ANALYTICS_SPACE},
    AuraCoreError,
};

#[derive(Accounts)]
pub struct InitTreasuryAnalytics<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        init,
        payer = owner,
        space = TREASURY_ANALYTICS_SPACE,
        seeds = [TREASURY_ANALYTICS_SEED, treasury.key().as_ref()],
        bump
    )]
    pub analytics: Box<Account<'info, TreasuryAnalyticsAccount>>,
    pub system_program: Program<'info, System>,
}

pub fn init_treasury_analytics(ctx: Context<InitTreasuryAnalytics>, now: i64) -> Result<()> {
    let analytics = &mut ctx.accounts.analytics;
    analytics.bump = ctx.bumps.analytics;
    analytics.treasury = ctx.accounts.treasury.key();
    analytics.audit_root = [0u8; 32];
    analytics.daily_window_started_at = now;
    analytics.last_updated_at = now;
    Ok(())
}

#[derive(Accounts)]
pub struct CloseTreasuryAnalytics<'info> {
    #[account(mut)]
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        close = owner,
        seeds = [TREASURY_ANALYTICS_SEED, treasury.key().as_ref()],
        bump = analytics.bump,
        constraint = analytics.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub analytics: Box<Account<'info, TreasuryAnalyticsAccount>>,
}

pub fn close_treasury_analytics(_ctx: Context<CloseTreasuryAnalytics>) -> Result<()> {
    Ok(())
}
