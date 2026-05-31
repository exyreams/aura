use anchor_lang::prelude::*;

use crate::{
    audit::AuditKind,
    constants::MAX_ASSETS_PER_WALLET,
    instructions::{sync_treasury_account, wallet_controls::DwalletControl},
    program_accounts::chain_from_code,
    state::AssetBalance,
    AuraCoreError,
};

/// Inserts or replaces a tracked asset balance on the dWallet ledger.
///
/// Owner-gated; the owner pushes the latest native amount and USD valuation
/// (sourced off-chain from `feed`). Caps at `MAX_ASSETS_PER_WALLET`.
#[allow(clippy::too_many_arguments)]
pub fn refresh_asset_balance(
    ctx: Context<DwalletControl>,
    _chain: u8,
    asset_id: String,
    symbol: String,
    decimals: u8,
    native_amount: u128,
    usd_value: u64,
    feed: Option<Pubkey>,
    now: i64,
) -> Result<()> {
    require!(
        asset_id.len() <= 64 && symbol.len() <= 16,
        AuraCoreError::InvalidExternalAccountData
    );
    let mut state = ctx.accounts.dwallet_state.to_domain()?;
    let is_new = !state.assets.iter().any(|entry| entry.asset_id == asset_id);
    require!(
        !(is_new && state.assets.len() >= MAX_ASSETS_PER_WALLET),
        AuraCoreError::TooManyAssets
    );
    state
        .upsert_asset(AssetBalance {
            asset_id: asset_id.clone(),
            symbol,
            decimals,
            native_amount,
            usd_value,
            updated_at: now,
            feed: feed.map(|key| key.to_string()),
        })
        .map_err(crate::map_treasury_error)?;
    ctx.accounts.dwallet_state.apply_domain(&state)?;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.audit_trail.record(
        AuditKind::BalanceRefreshed,
        format!("asset {asset_id} refreshed"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

/// Credits a deposit into the dWallet ledger, accumulating onto an existing
/// asset row or creating a new one.
#[allow(clippy::too_many_arguments)]
pub fn record_deposit(
    ctx: Context<DwalletControl>,
    _chain: u8,
    asset_id: String,
    symbol: String,
    decimals: u8,
    native_amount: u128,
    usd_value: u64,
    now: i64,
) -> Result<()> {
    require!(
        asset_id.len() <= 64 && symbol.len() <= 16,
        AuraCoreError::InvalidExternalAccountData
    );
    let mut state = ctx.accounts.dwallet_state.to_domain()?;
    if let Some(existing) = state
        .assets
        .iter_mut()
        .find(|entry| entry.asset_id == asset_id)
    {
        existing.native_amount = existing.native_amount.saturating_add(native_amount);
        existing.usd_value = existing.usd_value.saturating_add(usd_value);
        existing.updated_at = now;
    } else {
        require!(
            state.assets.len() < MAX_ASSETS_PER_WALLET,
            AuraCoreError::TooManyAssets
        );
        state
            .upsert_asset(AssetBalance {
                asset_id: asset_id.clone(),
                symbol,
                decimals,
                native_amount,
                usd_value,
                updated_at: now,
                feed: None,
            })
            .map_err(crate::map_treasury_error)?;
    }
    ctx.accounts.dwallet_state.apply_domain(&state)?;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.audit_trail.record(
        AuditKind::BalanceRefreshed,
        format!("deposit recorded for {asset_id}"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

/// Sets or clears the price feed account on a tracked asset.
pub fn set_asset_feed(
    ctx: Context<DwalletControl>,
    _chain: u8,
    asset_id: String,
    feed: Option<Pubkey>,
    now: i64,
) -> Result<()> {
    let mut state = ctx.accounts.dwallet_state.to_domain()?;
    state
        .set_asset_feed(&asset_id, feed.map(|key| key.to_string()))
        .map_err(crate::map_treasury_error)?;
    ctx.accounts.dwallet_state.apply_domain(&state)?;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!("feed updated for {asset_id}"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}

/// Recomputes the aggregate USD balance cached on the treasury's
/// `DWalletReference` from the per-asset ledger on the runtime account.
pub fn reconcile_dwallet_balance(ctx: Context<DwalletControl>, chain: u8, now: i64) -> Result<()> {
    let total = ctx.accounts.dwallet_state.to_domain()?.total_usd();
    let chain_ty = chain_from_code(chain)?;
    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    let dwallet = domain
        .dwallets
        .get_mut(&chain_ty)
        .ok_or(AuraCoreError::DWalletNotConfigured)?;
    dwallet.balance_usd = total;
    dwallet.balance_updated_at = now;
    domain.audit_trail.record(
        AuditKind::BalanceRefreshed,
        format!("dwallet {chain_ty} balance reconciled to {total} usd"),
        now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, now)
}
