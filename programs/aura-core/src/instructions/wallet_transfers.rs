use anchor_lang::prelude::*;

use crate::{
    audit::AuditKind,
    constants::{BALANCE_STALE_THRESHOLD_SECS, DWALLET_STATE_SEED, TREASURY_SEED},
    instructions::sync_treasury_account,
    program_accounts::{chain_from_code, DWalletAccount, TreasuryAccount},
    state::DWalletStatus,
    AuraCoreError,
};

/// Accounts for the outbound-spend reservation lifecycle on a dWallet.
///
/// Authorized by either the treasury AI authority (the agent that drives
/// proposals) or the owner. Operates only on the separate `DWalletAccount`
/// runtime PDA so the size-constrained treasury record is never touched.
#[derive(Accounts)]
#[instruction(chain: u8)]
pub struct DwalletSpend<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump
    )]
    pub treasury: Box<Account<'info, TreasuryAccount>>,
    #[account(
        mut,
        seeds = [DWALLET_STATE_SEED, treasury.key().as_ref(), &[chain]],
        bump = dwallet_state.bump,
        constraint = dwallet_state.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub dwallet_state: Box<Account<'info, DWalletAccount>>,
}

fn assert_spend_authority(treasury: &TreasuryAccount, signer: Pubkey) -> Result<()> {
    require!(
        signer == treasury.ai_authority || signer == treasury.owner,
        AuraCoreError::UnauthorizedAi
    );
    Ok(())
}

/// Reserves `amount_usd` of available balance ahead of an outbound proposal.
///
/// Enforces that the dWallet is outbound-capable (`Active`), the amount is
/// within the per-wallet per-tx and daily caps, and that enough unreserved
/// balance exists. The reservation is later consumed by `settle_dwallet_spend`
/// or returned by `release_dwallet_spend`.
pub fn reserve_dwallet_spend(
    ctx: Context<DwalletSpend>,
    _chain: u8,
    amount_usd: u64,
    now: i64,
) -> Result<()> {
    assert_spend_authority(&ctx.accounts.treasury, ctx.accounts.authority.key())?;
    let mut state = ctx.accounts.dwallet_state.to_domain()?;

    if !state.status.permits_outbound() {
        return Err(match state.status {
            DWalletStatus::Frozen | DWalletStatus::FrozenOut => {
                error!(AuraCoreError::DWalletFrozen)
            }
            _ => error!(AuraCoreError::DWalletNotActive),
        });
    }
    // Don't commit funds against a valuation that has gone stale.
    if let Some(freshest) = state.assets.iter().map(|asset| asset.updated_at).max() {
        require!(
            now.saturating_sub(freshest) <= BALANCE_STALE_THRESHOLD_SECS,
            AuraCoreError::BalanceStale
        );
    }
    require!(
        state.within_limits(amount_usd, now),
        AuraCoreError::DWalletLimitExceeded
    );
    require!(
        state.reserve(amount_usd),
        AuraCoreError::InsufficientWalletBalance
    );
    ctx.accounts.dwallet_state.apply_domain(&state)?;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!("dwallet {} reserved {amount_usd} usd", state.chain),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

/// Settles an outbound spend after the on-chain transfer finalizes: releases the
/// reservation, records it against the daily counter, debits the named asset
/// row, and reconciles the treasury's cached aggregate balance.
#[allow(clippy::too_many_arguments)]
pub fn settle_dwallet_spend(
    ctx: Context<DwalletSpend>,
    chain: u8,
    amount_usd: u64,
    asset_id: String,
    native_amount: u128,
    now: i64,
) -> Result<()> {
    assert_spend_authority(&ctx.accounts.treasury, ctx.accounts.authority.key())?;
    let mut state = ctx.accounts.dwallet_state.to_domain()?;
    require!(
        state.reserved_usd >= amount_usd,
        AuraCoreError::ReservationUnderflow
    );

    {
        let existing = state
            .assets
            .iter_mut()
            .find(|entry| entry.asset_id == asset_id)
            .ok_or(error!(AuraCoreError::AssetNotTracked))?;
        existing.native_amount = existing.native_amount.saturating_sub(native_amount);
        existing.usd_value = existing.usd_value.saturating_sub(amount_usd);
        existing.updated_at = now;
    }
    state.release(amount_usd);
    state.record_spend(amount_usd, now);
    let total = state.total_usd();
    ctx.accounts.dwallet_state.apply_domain(&state)?;

    let chain_ty = chain_from_code(chain)?;
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    if let Some(dwallet) = domain.dwallets.get_mut(&chain_ty) {
        dwallet.balance_usd = total;
        dwallet.balance_updated_at = now;
    }
    domain.audit_trail.record(
        AuditKind::BalanceRefreshed,
        format!("dwallet {chain_ty} settled {amount_usd} usd of {asset_id}"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

/// Returns a reservation to available balance without spending (e.g. when the
/// associated proposal is cancelled or expires).
pub fn release_dwallet_spend(
    ctx: Context<DwalletSpend>,
    _chain: u8,
    amount_usd: u64,
    now: i64,
) -> Result<()> {
    assert_spend_authority(&ctx.accounts.treasury, ctx.accounts.authority.key())?;
    let mut state = ctx.accounts.dwallet_state.to_domain()?;
    require!(
        state.reserved_usd >= amount_usd,
        AuraCoreError::ReservationUnderflow
    );
    state.release(amount_usd);
    ctx.accounts.dwallet_state.apply_domain(&state)?;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!("dwallet {} released {amount_usd} usd", state.chain),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}
