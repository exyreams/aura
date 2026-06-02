//! Per-treasury fee schedule management.
//!
//! The schedule lives on a sidecar PDA so the treasury account stays within the
//! SBF stack-frame limit. Every write is coherence-validated, and the integrator
//! layer is clamped to the bounds published by the global `ProtocolConfig`.

use anchor_lang::prelude::*;

use crate::{
    constants::{FEE_SCHEDULE_SEED, PROTOCOL_CONFIG_SEED, TREASURY_SEED},
    program_accounts::{
        FeeScheduleAccount, FeeScheduleRecord, ProtocolConfigAccount, TreasuryAccount,
        FEE_SCHEDULE_SPACE,
    },
    AuraCoreError,
};

/// Validates a schedule for internal coherence and clamps the integrator layer
/// to the protocol-defined bounds when a `ProtocolConfig` is supplied.
pub(crate) fn validate_schedule(
    record: &FeeScheduleRecord,
    protocol_config: Option<&Account<ProtocolConfigAccount>>,
) -> Result<()> {
    record
        .to_domain()
        .validate()
        .map_err(|_| error!(AuraCoreError::InvalidFeeSchedule))?;

    if let Some(config) = protocol_config {
        require!(
            record.integrator_bps >= u64::from(config.min_integrator_bps)
                && record.integrator_bps <= u64::from(config.max_integrator_bps),
            AuraCoreError::IntegratorFeeOutOfBounds
        );
    } else {
        // Without the protocol config we cannot bound the integrator layer.
        require!(
            record.integrator_bps == 0,
            AuraCoreError::IntegratorFeeOutOfBounds
        );
    }
    Ok(())
}

#[derive(Accounts)]
pub struct InitFeeSchedule<'info> {
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
        space = FEE_SCHEDULE_SPACE,
        seeds = [FEE_SCHEDULE_SEED, treasury.key().as_ref()],
        bump
    )]
    pub fee_schedule: Box<Account<'info, FeeScheduleAccount>>,
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump)]
    pub protocol_config: Option<Box<Account<'info, ProtocolConfigAccount>>>,
    pub system_program: Program<'info, System>,
}

/// Creates the sidecar and stores the initial schedule.
pub fn init_fee_schedule(
    ctx: Context<InitFeeSchedule>,
    schedule: FeeScheduleRecord,
    now: i64,
) -> Result<()> {
    validate_schedule(&schedule, ctx.accounts.protocol_config.as_deref())?;
    let account = &mut ctx.accounts.fee_schedule;
    account.bump = ctx.bumps.fee_schedule;
    account.treasury = ctx.accounts.treasury.key();
    account.updated_at = now;
    account.schedule = schedule;
    Ok(())
}

#[derive(Accounts)]
pub struct UpdateFeeSchedule<'info> {
    pub owner: Signer<'info>,
    #[account(
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == owner.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [FEE_SCHEDULE_SEED, treasury.key().as_ref()],
        bump = fee_schedule.bump,
        constraint = fee_schedule.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub fee_schedule: Box<Account<'info, FeeScheduleAccount>>,
    #[account(seeds = [PROTOCOL_CONFIG_SEED], bump = protocol_config.bump)]
    pub protocol_config: Option<Box<Account<'info, ProtocolConfigAccount>>>,
}

/// Replaces the stored schedule (re-validated and re-bounded).
pub fn update_fee_schedule(
    ctx: Context<UpdateFeeSchedule>,
    schedule: FeeScheduleRecord,
    now: i64,
) -> Result<()> {
    validate_schedule(&schedule, ctx.accounts.protocol_config.as_deref())?;
    let account = &mut ctx.accounts.fee_schedule;
    account.updated_at = now;
    account.schedule = schedule;
    Ok(())
}

#[derive(Accounts)]
pub struct CloseFeeSchedule<'info> {
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
        seeds = [FEE_SCHEDULE_SEED, treasury.key().as_ref()],
        bump = fee_schedule.bump,
        constraint = fee_schedule.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub fee_schedule: Box<Account<'info, FeeScheduleAccount>>,
}

pub fn close_fee_schedule(_ctx: Context<CloseFeeSchedule>) -> Result<()> {
    Ok(())
}
