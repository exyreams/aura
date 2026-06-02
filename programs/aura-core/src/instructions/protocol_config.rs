//! Monetization control plane.
//!
//! These instructions manage the global `ProtocolConfigAccount` singleton — the
//! root authority over the non-bypassable protocol fee and the bounds within
//! which integrators may charge. Economic changes are staged and applied behind
//! a timelock so the protocol authority cannot silently retune fees.

use anchor_lang::prelude::*;

use crate::{
    constants::{PROTOCOL_CONFIG_SEED, PROTOCOL_CONFIG_UPDATE_TIMELOCK_SECS},
    program_accounts::{
        validate_protocol_values, PendingProtocolConfig, ProtocolConfigAccount,
        PROTOCOL_CONFIG_SPACE,
    },
    AuraCoreError,
};

/// Economic values shared by init and update.
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct ProtocolConfigArgs {
    pub protocol_authority: Pubkey,
    pub protocol_recipient: Pubkey,
    pub protocol_fee_bps: u64,
    pub creation_fee_usd: u64,
    pub min_integrator_bps: u16,
    pub max_integrator_bps: u16,
    pub settlement_asset: u8,
    pub enabled: bool,
}

#[derive(Accounts)]
pub struct InitProtocolConfig<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        payer = payer,
        space = PROTOCOL_CONFIG_SPACE,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfigAccount>>,
    pub system_program: Program<'info, System>,
}

/// Bootstraps the protocol configuration singleton. Callable once; the supplied
/// `protocol_authority` thereafter gates every change.
pub fn init_protocol_config(
    ctx: Context<InitProtocolConfig>,
    args: ProtocolConfigArgs,
    now: i64,
) -> Result<()> {
    validate_protocol_values(
        args.protocol_fee_bps,
        args.min_integrator_bps,
        args.max_integrator_bps,
        args.settlement_asset,
    )?;
    let config = &mut ctx.accounts.protocol_config;
    config.bump = ctx.bumps.protocol_config;
    config.protocol_authority = args.protocol_authority;
    config.protocol_recipient = args.protocol_recipient;
    config.protocol_fee_bps = args.protocol_fee_bps;
    config.creation_fee_usd = args.creation_fee_usd;
    config.min_integrator_bps = args.min_integrator_bps;
    config.max_integrator_bps = args.max_integrator_bps;
    config.settlement_asset = args.settlement_asset;
    config.enabled = args.enabled;
    config.updated_at = now;
    config.pending = None;
    Ok(())
}

#[derive(Accounts)]
pub struct ProtocolConfigAuthority<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [PROTOCOL_CONFIG_SEED],
        bump = protocol_config.bump,
        constraint = protocol_config.protocol_authority == authority.key() @ AuraCoreError::UnauthorizedProtocolAuthority
    )]
    pub protocol_config: Box<Account<'info, ProtocolConfigAccount>>,
}

/// Stages an economic change behind the update timelock. The values are
/// validated for coherence at staging time.
pub fn update_protocol_config(
    ctx: Context<ProtocolConfigAuthority>,
    args: ProtocolConfigArgs,
    now: i64,
) -> Result<()> {
    let pending = PendingProtocolConfig {
        protocol_authority: args.protocol_authority,
        protocol_recipient: args.protocol_recipient,
        protocol_fee_bps: args.protocol_fee_bps,
        creation_fee_usd: args.creation_fee_usd,
        min_integrator_bps: args.min_integrator_bps,
        max_integrator_bps: args.max_integrator_bps,
        settlement_asset: args.settlement_asset,
        enabled: args.enabled,
        executable_after: now.saturating_add(PROTOCOL_CONFIG_UPDATE_TIMELOCK_SECS),
    };
    pending.validate()?;
    ctx.accounts.protocol_config.pending = Some(pending);
    Ok(())
}

/// Applies the staged change once its timelock has elapsed.
pub fn commit_protocol_config(ctx: Context<ProtocolConfigAuthority>, now: i64) -> Result<()> {
    let config = &mut ctx.accounts.protocol_config;
    let pending = config
        .pending
        .clone()
        .ok_or_else(|| error!(AuraCoreError::NoPendingProtocolUpdate))?;
    require!(
        now >= pending.executable_after,
        AuraCoreError::ProtocolUpdateTimelockActive
    );
    pending.validate()?;
    config.protocol_authority = pending.protocol_authority;
    config.protocol_recipient = pending.protocol_recipient;
    config.protocol_fee_bps = pending.protocol_fee_bps;
    config.creation_fee_usd = pending.creation_fee_usd;
    config.min_integrator_bps = pending.min_integrator_bps;
    config.max_integrator_bps = pending.max_integrator_bps;
    config.settlement_asset = pending.settlement_asset;
    config.enabled = pending.enabled;
    config.updated_at = now;
    config.pending = None;
    Ok(())
}
