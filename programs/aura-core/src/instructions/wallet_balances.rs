use anchor_lang::prelude::*;

use crate::{
    audit::AuditKind,
    constants::MAX_ASSETS_PER_WALLET,
    ext_cpi::{native_to_usd_value, read_verified_price},
    instructions::{sync_treasury_account, wallet_controls::DwalletControl},
    program_accounts::chain_from_code,
    state::{AssetBalance, OracleFeed, OracleProvider},
    AuraCoreError,
};

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct SetAssetOracleFeedArgs {
    pub asset_id: String,
    pub provider: u8,
    pub feed: Option<Pubkey>,
    pub program_id: Option<Pubkey>,
    pub max_staleness_secs: i64,
    pub max_confidence_bps: u16,
    pub expo_expected: Option<i32>,
    pub now: i64,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct RefreshVerifiedAssetBalanceArgs {
    pub chain: u8,
    pub asset_id: String,
    pub symbol: String,
    pub decimals: u8,
    pub native_amount: u128,
    pub provider: u8,
    pub program_id: Option<Pubkey>,
    pub max_staleness_secs: i64,
    pub max_confidence_bps: u16,
    pub expo_expected: Option<i32>,
    pub now: i64,
}

#[derive(Accounts)]
#[instruction(args: RefreshVerifiedAssetBalanceArgs)]
pub struct RefreshVerifiedAssetBalance<'info> {
    pub authority: Signer<'info>,
    #[account(
        mut,
        seeds = [crate::constants::TREASURY_SEED, treasury.owner.as_ref(), treasury.agent_id.as_bytes()],
        bump = treasury.bump,
        constraint = treasury.owner == authority.key() || treasury.ai_authority == authority.key() @ AuraCoreError::UnauthorizedOwner
    )]
    pub treasury: Box<Account<'info, crate::program_accounts::TreasuryAccount>>,
    #[account(
        mut,
        seeds = [crate::constants::DWALLET_STATE_SEED, treasury.key().as_ref(), &[args.chain]],
        bump = dwallet_state.bump,
        constraint = dwallet_state.treasury == treasury.key() @ AuraCoreError::InvalidExternalAccountData
    )]
    pub dwallet_state: Box<Account<'info, crate::program_accounts::DWalletAccount>>,
    /// CHECK: verified by the stored OracleFeed account key and owner.
    pub price_feed: UncheckedAccount<'info>,
}

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

/// Sets or clears the verified price-feed descriptor on a tracked asset.
pub fn set_asset_oracle_feed(
    ctx: Context<DwalletControl>,
    _chain: u8,
    args: SetAssetOracleFeedArgs,
) -> Result<()> {
    require!(
        args.max_staleness_secs >= 0,
        AuraCoreError::OracleAccountInvalid
    );
    let provider = OracleProvider::from_code(args.provider)
        .ok_or_else(|| error!(AuraCoreError::OracleProviderNotAllowed))?;
    if provider.is_trusted() {
        require!(args.feed.is_some(), AuraCoreError::OracleAccountInvalid);
        require!(
            args.program_id.is_some(),
            AuraCoreError::OracleAccountInvalid
        );
        require!(
            args.max_staleness_secs > 0 && args.max_confidence_bps > 0,
            AuraCoreError::OracleAccountInvalid
        );
    }

    let feed = args.feed.map(|account| account.to_string());

    let mut state = ctx.accounts.dwallet_state.to_domain()?;
    state
        .set_asset_feed(&args.asset_id, feed)
        .map_err(crate::map_treasury_error)?;
    ctx.accounts.dwallet_state.apply_domain(&state)?;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.audit_trail.record(
        AuditKind::ConfigChangeExecuted,
        format!("verified feed updated for {}", args.asset_id),
        args.now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
}

/// Refreshes a tracked asset by reading its stored verified oracle feed.
pub fn refresh_verified_asset_balance(
    ctx: Context<RefreshVerifiedAssetBalance>,
    args: RefreshVerifiedAssetBalanceArgs,
) -> Result<()> {
    require!(
        args.asset_id.len() <= 64 && args.symbol.len() <= 16,
        AuraCoreError::InvalidExternalAccountData
    );

    let mut state = ctx.accounts.dwallet_state.to_domain()?;
    let feed_account = state
        .assets
        .iter()
        .find(|asset| asset.asset_id == args.asset_id)
        .and_then(|asset| asset.feed.clone())
        .ok_or_else(|| error!(AuraCoreError::OracleAccountInvalid))?;
    let provider = OracleProvider::from_code(args.provider)
        .ok_or_else(|| error!(AuraCoreError::OracleProviderNotAllowed))?;
    let feed = OracleFeed {
        provider,
        account: feed_account,
        program_id: args.program_id.map(|program_id| program_id.to_string()),
        max_staleness_secs: args.max_staleness_secs,
        max_confidence_bps: args.max_confidence_bps,
        expo_expected: args.expo_expected,
    };
    let trusted_required = ctx
        .accounts
        .treasury
        .policy_config
        .liveness_config
        .require_balance_oracle_freshness;
    let price = read_verified_price(
        &feed,
        &ctx.accounts.price_feed.to_account_info(),
        args.now,
        trusted_required,
    )?;
    let usd_value = native_to_usd_value(args.native_amount, args.decimals, price.price_usd_e6)?;
    state
        .upsert_asset(AssetBalance {
            asset_id: args.asset_id.clone(),
            symbol: args.symbol,
            decimals: args.decimals,
            native_amount: args.native_amount,
            usd_value,
            updated_at: args.now,
            feed: Some(feed.account),
        })
        .map_err(crate::map_treasury_error)?;
    ctx.accounts.dwallet_state.apply_domain(&state)?;

    let mut domain = ctx.accounts.treasury.to_domain_boxed()?;
    domain.audit_trail.record(
        AuditKind::BalanceRefreshed,
        format!(
            "verified asset {} refreshed via {}",
            args.asset_id, price.provider
        ),
        args.now,
    );
    sync_treasury_account(&mut ctx.accounts.treasury, &domain, args.now)
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
