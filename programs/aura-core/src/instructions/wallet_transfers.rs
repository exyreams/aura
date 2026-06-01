use anchor_lang::prelude::*;
use aura_policy::Chain;

use crate::{
    audit::AuditKind,
    constants::{BALANCE_STALE_THRESHOLD_SECS, DWALLET_STATE_SEED, TREASURY_SEED},
    instructions::sync_treasury_account,
    program_accounts::{
        chain_from_code, ChainProfileAccount, DWalletAccount, TreasuryAccount,
        ADDRESS_FORMAT_BITCOIN, ADDRESS_FORMAT_CUSTOM, ADDRESS_FORMAT_EVM, ADDRESS_FORMAT_SOLANA,
        REPLAY_SCHEME_EVM, REPLAY_SCHEME_SOLANA, REPLAY_SCHEME_UTXO,
    },
    state::{DWalletStatus, TransferDetails},
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

pub(crate) fn validate_transfer_details(transfer: &TransferDetails) -> Result<()> {
    if transfer.is_legacy() {
        return Ok(());
    }

    if !transfer.has_asset_payload() {
        return Ok(());
    }

    let valid_asset = transfer
        .asset_id
        .as_deref()
        .is_some_and(|asset| !asset.is_empty() && asset.len() <= 64);
    require!(valid_asset, AuraCoreError::AssetNotTracked);
    require!(
        transfer.native_amount.is_some_and(|amount| amount > 0),
        AuraCoreError::InsufficientWalletBalance
    );
    require!(
        transfer.decimals.is_some(),
        AuraCoreError::InvalidExternalAccountData
    );

    let gas_set = transfer.gas_native_amount.is_some() || transfer.gas_asset_id.is_some();
    if gas_set {
        require!(
            transfer.gas_native_amount.is_some_and(|amount| amount > 0),
            AuraCoreError::InsufficientWalletBalance
        );
        let valid_gas_asset = transfer
            .gas_asset_id
            .as_deref()
            .is_some_and(|asset| !asset.is_empty() && asset.len() <= 64);
        require!(valid_gas_asset, AuraCoreError::AssetNotTracked);
    }

    Ok(())
}

#[cfg(test)]
pub(crate) fn validate_chain_execution_binding(
    chain: Chain,
    transfer: &TransferDetails,
) -> Result<()> {
    validate_chain_execution_binding_with_profile(chain, transfer, None)
}

pub(crate) fn validate_chain_execution_binding_with_profile(
    chain: Chain,
    transfer: &TransferDetails,
    profile: Option<&ChainProfileAccount>,
) -> Result<()> {
    let binding = &transfer.execution_binding;
    if binding.is_empty() {
        return Ok(());
    }
    if binding
        .confirmations_required
        .is_some_and(|confirmations| confirmations == 0)
    {
        return err!(AuraCoreError::ChainReplayFieldsMissing);
    }

    let profile = ChainProfileView::for_chain(chain, profile)?;
    match profile.replay_scheme {
        REPLAY_SCHEME_EVM => {
            require!(
                binding.evm_chain_id == profile.evm_chain_id
                    && binding.replay_nonce.is_some()
                    && binding.gas_limit.is_some_and(|gas| gas > 0)
                    && binding.max_fee_native.is_some_and(|fee| fee > 0),
                AuraCoreError::ChainReplayFieldsMissing
            );
        }
        REPLAY_SCHEME_UTXO => {
            require!(
                binding.utxo_set_hash.is_some() && binding.sighash_type.is_some(),
                AuraCoreError::ChainReplayFieldsMissing
            );
        }
        REPLAY_SCHEME_SOLANA => {
            require!(
                binding.solana_recent_blockhash.is_some() && binding.solana_message_hash.is_some(),
                AuraCoreError::ChainReplayFieldsMissing
            );
        }
        _ => return err!(AuraCoreError::ChainReplayFieldsMissing),
    }
    Ok(())
}

#[cfg(test)]
pub(crate) fn validate_recipient_for_chain(chain: Chain, recipient: &str) -> Result<()> {
    validate_recipient_for_chain_with_profile(chain, None, recipient)
}

pub(crate) fn validate_recipient_for_chain_with_profile(
    chain: Chain,
    profile: Option<&ChainProfileAccount>,
    recipient: &str,
) -> Result<()> {
    let profile = ChainProfileView::for_chain(chain, profile)?;
    let valid = match profile.address_format {
        ADDRESS_FORMAT_EVM => {
            recipient.len() == 42
                && recipient.starts_with("0x")
                && recipient[2..].bytes().all(|byte| byte.is_ascii_hexdigit())
        }
        ADDRESS_FORMAT_BITCOIN => validate_bitcoin_like_address(recipient),
        ADDRESS_FORMAT_SOLANA => bs58::decode(recipient)
            .into_vec()
            .is_ok_and(|decoded| decoded.len() == 32),
        ADDRESS_FORMAT_CUSTOM => !recipient.is_empty() && recipient.len() <= 128,
        _ => false,
    };
    require!(valid, AuraCoreError::RecipientAddressInvalidForChain);
    Ok(())
}

pub(crate) fn profile_confirmations_required(
    chain: Chain,
    profile: Option<&ChainProfileAccount>,
) -> Result<u16> {
    Ok(ChainProfileView::for_chain(chain, profile)?.confirmations_required)
}

struct ChainProfileView {
    address_format: u8,
    replay_scheme: u8,
    evm_chain_id: Option<u64>,
    confirmations_required: u16,
}

impl ChainProfileView {
    fn for_chain(chain: Chain, profile: Option<&ChainProfileAccount>) -> Result<Self> {
        if let Some(profile) = profile {
            profile.assert_valid_for(crate::program_accounts::chain_code(chain))?;
            return Ok(Self {
                address_format: profile.address_format,
                replay_scheme: profile.replay_scheme,
                evm_chain_id: profile.evm_chain_id,
                confirmations_required: profile.confirmations_required,
            });
        }

        match chain {
            Chain::Bitcoin => Ok(Self {
                address_format: ADDRESS_FORMAT_BITCOIN,
                replay_scheme: REPLAY_SCHEME_UTXO,
                evm_chain_id: None,
                confirmations_required: 6,
            }),
            Chain::Ethereum => Ok(Self {
                address_format: ADDRESS_FORMAT_EVM,
                replay_scheme: REPLAY_SCHEME_EVM,
                evm_chain_id: Some(1),
                confirmations_required: 12,
            }),
            Chain::Solana => Ok(Self {
                address_format: ADDRESS_FORMAT_SOLANA,
                replay_scheme: REPLAY_SCHEME_SOLANA,
                evm_chain_id: None,
                confirmations_required: 1,
            }),
            Chain::Polygon => Ok(Self {
                address_format: ADDRESS_FORMAT_EVM,
                replay_scheme: REPLAY_SCHEME_EVM,
                evm_chain_id: Some(137),
                confirmations_required: 128,
            }),
            Chain::Arbitrum => Ok(Self {
                address_format: ADDRESS_FORMAT_EVM,
                replay_scheme: REPLAY_SCHEME_EVM,
                evm_chain_id: Some(42_161),
                confirmations_required: 20,
            }),
            Chain::Optimism => Ok(Self {
                address_format: ADDRESS_FORMAT_EVM,
                replay_scheme: REPLAY_SCHEME_EVM,
                evm_chain_id: Some(10),
                confirmations_required: 20,
            }),
            Chain::Custom(_) => err!(AuraCoreError::ChainProfileNotRegistered),
        }
    }
}

fn validate_bitcoin_like_address(address: &str) -> bool {
    let len_ok = (26..=90).contains(&address.len());
    let prefix_ok = address.starts_with("bc1")
        || address.starts_with("tb1")
        || address.starts_with('1')
        || address.starts_with('3')
        || address.starts_with('m')
        || address.starts_with('n')
        || address.starts_with('2');
    len_ok && prefix_ok && address.bytes().all(|byte| byte.is_ascii_alphanumeric())
}

pub(crate) fn reserve_transfer_details(
    dwallet_state: &mut Account<'_, DWalletAccount>,
    treasury: Pubkey,
    chain: u8,
    amount_usd: u64,
    transfer: &TransferDetails,
    now: i64,
) -> Result<()> {
    validate_transfer_details(transfer)?;
    if transfer.is_legacy() {
        return Ok(());
    }

    require!(
        dwallet_state.treasury == treasury && dwallet_state.chain == chain,
        AuraCoreError::InvalidExternalAccountData
    );

    ensure_outbound_ready_account(dwallet_state)?;
    ensure_fresh_account(dwallet_state, now)?;
    require!(
        within_limits_account(dwallet_state, amount_usd, now),
        AuraCoreError::DWalletLimitExceeded
    );
    ensure_native_assets_available_account(dwallet_state, transfer)?;
    require!(
        amount_usd <= available_usd_account(dwallet_state),
        AuraCoreError::InsufficientWalletBalance
    );
    dwallet_state.reserved_usd = dwallet_state.reserved_usd.saturating_add(amount_usd);
    Ok(())
}

pub(crate) fn settle_transfer_details(
    dwallet_state: &mut Account<'_, DWalletAccount>,
    treasury: Pubkey,
    chain: u8,
    amount_usd: u64,
    transfer: &TransferDetails,
    now: i64,
) -> Result<u64> {
    validate_transfer_details(transfer)?;
    require!(
        !transfer.is_legacy(),
        AuraCoreError::InvalidExternalAccountData
    );
    require!(
        dwallet_state.treasury == treasury && dwallet_state.chain == chain,
        AuraCoreError::InvalidExternalAccountData
    );

    require!(
        dwallet_state.reserved_usd >= amount_usd,
        AuraCoreError::ReservationUnderflow
    );
    debit_native_assets_account(dwallet_state, transfer, amount_usd)?;
    dwallet_state.reserved_usd = dwallet_state.reserved_usd.saturating_sub(amount_usd);
    record_spend_account(dwallet_state, amount_usd, now);
    Ok(total_usd_account(dwallet_state))
}

pub(crate) fn release_transfer_reservation(
    dwallet_state: &mut Account<'_, DWalletAccount>,
    treasury: Pubkey,
    chain: u8,
    amount_usd: u64,
    transfer: &TransferDetails,
) -> Result<()> {
    validate_transfer_details(transfer)?;
    if transfer.is_legacy() {
        return Ok(());
    }

    require!(
        dwallet_state.treasury == treasury && dwallet_state.chain == chain,
        AuraCoreError::InvalidExternalAccountData
    );
    require!(
        dwallet_state.reserved_usd >= amount_usd,
        AuraCoreError::ReservationUnderflow
    );
    dwallet_state.reserved_usd = dwallet_state.reserved_usd.saturating_sub(amount_usd);
    Ok(())
}

fn ensure_outbound_ready_account(state: &DWalletAccount) -> Result<()> {
    match state.status {
        1 => Ok(()),
        2 | 3 => err!(AuraCoreError::DWalletFrozen),
        _ => err!(AuraCoreError::DWalletNotActive),
    }
}

fn ensure_fresh_account(state: &DWalletAccount, now: i64) -> Result<()> {
    if let Some(freshest) = state.assets.iter().map(|asset| asset.updated_at).max() {
        require!(
            now.saturating_sub(freshest) <= BALANCE_STALE_THRESHOLD_SECS,
            AuraCoreError::BalanceStale
        );
    }
    Ok(())
}

fn total_usd_account(state: &DWalletAccount) -> u64 {
    state
        .assets
        .iter()
        .fold(0u64, |acc, asset| acc.saturating_add(asset.usd_value))
}

fn available_usd_account(state: &DWalletAccount) -> u64 {
    total_usd_account(state).saturating_sub(state.reserved_usd)
}

fn effective_spent_today_account(state: &DWalletAccount, now: i64) -> u64 {
    if now.saturating_sub(state.spend_window_start) >= 86_400 {
        0
    } else {
        state.spent_today_usd
    }
}

fn within_limits_account(state: &DWalletAccount, amount_usd: u64, now: i64) -> bool {
    if let Some(per_tx) = state.per_tx_limit_usd {
        if amount_usd > per_tx {
            return false;
        }
    }
    if let Some(daily) = state.daily_limit_usd {
        if effective_spent_today_account(state, now).saturating_add(amount_usd) > daily {
            return false;
        }
    }
    true
}

fn record_spend_account(state: &mut DWalletAccount, amount_usd: u64, now: i64) {
    if now.saturating_sub(state.spend_window_start) >= 86_400 {
        state.spent_today_usd = 0;
        state.spend_window_start = now;
    }
    state.spent_today_usd = state.spent_today_usd.saturating_add(amount_usd);
}

fn ensure_native_assets_available_account(
    state: &DWalletAccount,
    transfer: &TransferDetails,
) -> Result<()> {
    let asset_id = transfer
        .asset_id
        .as_deref()
        .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
    let native_amount = transfer
        .native_amount
        .ok_or_else(|| error!(AuraCoreError::InsufficientWalletBalance))?;
    let gas_asset_id = transfer.gas_asset_id.as_deref();
    let gas_native_amount = transfer.gas_native_amount.unwrap_or(0);

    let asset = state
        .assets
        .iter()
        .find(|entry| entry.asset_id == asset_id)
        .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
    let required_main = if gas_asset_id == Some(asset_id) {
        native_amount.saturating_add(gas_native_amount)
    } else {
        native_amount
    };
    require!(
        asset.native_amount >= required_main,
        AuraCoreError::InsufficientWalletBalance
    );

    if let Some(gas_asset_id) = gas_asset_id.filter(|gas| *gas != asset_id) {
        let gas_asset = state
            .assets
            .iter()
            .find(|entry| entry.asset_id == gas_asset_id)
            .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
        require!(
            gas_asset.native_amount >= gas_native_amount,
            AuraCoreError::InsufficientWalletBalance
        );
    }

    Ok(())
}

fn debit_native_assets_account(
    state: &mut DWalletAccount,
    transfer: &TransferDetails,
    amount_usd: u64,
) -> Result<()> {
    ensure_native_assets_available_account(state, transfer)?;
    let asset_id = transfer
        .asset_id
        .as_deref()
        .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
    let native_amount = transfer
        .native_amount
        .ok_or_else(|| error!(AuraCoreError::InsufficientWalletBalance))?;
    let gas_asset_id = transfer.gas_asset_id.as_deref();
    let gas_native_amount = transfer.gas_native_amount.unwrap_or(0);

    let asset = state
        .assets
        .iter_mut()
        .find(|entry| entry.asset_id == asset_id)
        .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
    let debit_main = if gas_asset_id == Some(asset_id) {
        native_amount.saturating_add(gas_native_amount)
    } else {
        native_amount
    };
    asset.native_amount = asset.native_amount.saturating_sub(debit_main);
    asset.usd_value = asset.usd_value.saturating_sub(amount_usd);

    if let Some(gas_asset_id) = gas_asset_id.filter(|gas| *gas != asset_id) {
        let gas_asset = state
            .assets
            .iter_mut()
            .find(|entry| entry.asset_id == gas_asset_id)
            .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
        gas_asset.native_amount = gas_asset.native_amount.saturating_sub(gas_native_amount);
    }

    Ok(())
}

fn ensure_outbound_ready(state: &crate::state::DWalletState) -> Result<()> {
    if !state.status.permits_outbound() {
        return Err(match state.status {
            DWalletStatus::Frozen | DWalletStatus::FrozenOut => {
                error!(AuraCoreError::DWalletFrozen)
            }
            _ => error!(AuraCoreError::DWalletNotActive),
        });
    }
    Ok(())
}

fn ensure_fresh(state: &crate::state::DWalletState, now: i64) -> Result<()> {
    if let Some(freshest) = state.assets.iter().map(|asset| asset.updated_at).max() {
        require!(
            now.saturating_sub(freshest) <= BALANCE_STALE_THRESHOLD_SECS,
            AuraCoreError::BalanceStale
        );
    }
    Ok(())
}

#[cfg(test)]
fn ensure_native_assets_available(
    state: &crate::state::DWalletState,
    transfer: &TransferDetails,
) -> Result<()> {
    let asset_id = transfer
        .asset_id
        .as_deref()
        .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
    let native_amount = transfer
        .native_amount
        .ok_or_else(|| error!(AuraCoreError::InsufficientWalletBalance))?;
    let gas_asset_id = transfer.gas_asset_id.as_deref();
    let gas_native_amount = transfer.gas_native_amount.unwrap_or(0);

    let asset = state
        .assets
        .iter()
        .find(|entry| entry.asset_id == asset_id)
        .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
    let required_main = if gas_asset_id == Some(asset_id) {
        native_amount.saturating_add(gas_native_amount)
    } else {
        native_amount
    };
    require!(
        asset.native_amount >= required_main,
        AuraCoreError::InsufficientWalletBalance
    );

    if let Some(gas_asset_id) = gas_asset_id.filter(|gas| *gas != asset_id) {
        let gas_asset = state
            .assets
            .iter()
            .find(|entry| entry.asset_id == gas_asset_id)
            .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
        require!(
            gas_asset.native_amount >= gas_native_amount,
            AuraCoreError::InsufficientWalletBalance
        );
    }

    Ok(())
}

#[cfg(test)]
fn debit_native_assets(
    state: &mut crate::state::DWalletState,
    transfer: &TransferDetails,
    amount_usd: u64,
) -> Result<()> {
    ensure_native_assets_available(state, transfer)?;
    let asset_id = transfer
        .asset_id
        .as_deref()
        .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
    let native_amount = transfer
        .native_amount
        .ok_or_else(|| error!(AuraCoreError::InsufficientWalletBalance))?;
    let gas_asset_id = transfer.gas_asset_id.as_deref();
    let gas_native_amount = transfer.gas_native_amount.unwrap_or(0);

    let asset = state
        .assets
        .iter_mut()
        .find(|entry| entry.asset_id == asset_id)
        .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
    let debit_main = if gas_asset_id == Some(asset_id) {
        native_amount.saturating_add(gas_native_amount)
    } else {
        native_amount
    };
    asset.native_amount = asset.native_amount.saturating_sub(debit_main);
    asset.usd_value = asset.usd_value.saturating_sub(amount_usd);

    if let Some(gas_asset_id) = gas_asset_id.filter(|gas| *gas != asset_id) {
        let gas_asset = state
            .assets
            .iter_mut()
            .find(|entry| entry.asset_id == gas_asset_id)
            .ok_or_else(|| error!(AuraCoreError::AssetNotTracked))?;
        gas_asset.native_amount = gas_asset.native_amount.saturating_sub(gas_native_amount);
    }

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

    ensure_outbound_ready(&state)?;
    ensure_fresh(&state, now)?;
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

#[cfg(test)]
mod tests {
    use super::*;
    use aura_policy::Chain;

    use crate::state::{AssetBalance, DWalletState};

    fn asset(asset_id: &str, native_amount: u128, usd_value: u64) -> AssetBalance {
        AssetBalance {
            asset_id: asset_id.to_string(),
            symbol: asset_id.to_uppercase(),
            decimals: 6,
            native_amount,
            usd_value,
            updated_at: 1_000,
            feed: None,
        }
    }

    fn state() -> DWalletState {
        DWalletState {
            treasury: Pubkey::new_unique().to_string(),
            chain: Chain::Ethereum,
            status: DWalletStatus::Active,
            daily_limit_usd: Some(2_000),
            per_tx_limit_usd: Some(1_000),
            spent_today_usd: 0,
            spend_window_start: 1_000,
            authority: Pubkey::new_unique().to_string(),
            cpi_authority_seed: "__ika_cpi_authority".to_string(),
            label: None,
            assets: vec![asset("usdc", 1_000, 1_000), asset("eth", 50, 100)],
            reserved_usd: 500,
            epoch: 0,
        }
    }

    #[test]
    fn transfer_details_check_main_asset_and_gas_balance() {
        let state = state();
        let transfer = TransferDetails {
            asset_id: Some("usdc".to_string()),
            native_amount: Some(400),
            decimals: Some(6),
            gas_native_amount: Some(10),
            gas_asset_id: Some("eth".to_string()),
            execution_binding: Default::default(),
        };
        ensure_native_assets_available(&state, &transfer).expect("asset and gas are covered");

        let oversized = TransferDetails {
            native_amount: Some(1_001),
            ..transfer.clone()
        };
        assert!(ensure_native_assets_available(&state, &oversized).is_err());

        let missing_gas = TransferDetails {
            gas_asset_id: Some("matic".to_string()),
            ..transfer
        };
        assert!(ensure_native_assets_available(&state, &missing_gas).is_err());
    }

    #[test]
    fn debit_transfer_details_spends_main_asset_and_gas() {
        let mut state = state();
        let transfer = TransferDetails {
            asset_id: Some("usdc".to_string()),
            native_amount: Some(400),
            decimals: Some(6),
            gas_native_amount: Some(10),
            gas_asset_id: Some("eth".to_string()),
            execution_binding: Default::default(),
        };

        debit_native_assets(&mut state, &transfer, 500).expect("covered transfer debits");

        let usdc = state
            .assets
            .iter()
            .find(|asset| asset.asset_id == "usdc")
            .expect("usdc tracked");
        assert_eq!(usdc.native_amount, 600);
        assert_eq!(usdc.usd_value, 500);

        let eth = state
            .assets
            .iter()
            .find(|asset| asset.asset_id == "eth")
            .expect("eth tracked");
        assert_eq!(eth.native_amount, 40);
    }

    #[test]
    fn chain_binding_requires_replay_fields_and_valid_recipient() {
        let mut transfer = TransferDetails {
            execution_binding: crate::state::ChainExecutionBinding {
                evm_chain_id: Some(1),
                replay_nonce: Some(3),
                gas_limit: Some(21_000),
                max_fee_native: Some(1_000_000),
                confirmations_required: Some(12),
                ..Default::default()
            },
            ..Default::default()
        };
        validate_chain_execution_binding(Chain::Ethereum, &transfer)
            .expect("complete evm binding should pass");
        validate_recipient_for_chain(
            Chain::Ethereum,
            "0x1111111111111111111111111111111111111111",
        )
        .expect("valid evm address");
        assert!(validate_recipient_for_chain(Chain::Ethereum, "0xrecipient").is_err());

        transfer.execution_binding.evm_chain_id = Some(10);
        assert!(validate_chain_execution_binding(Chain::Ethereum, &transfer).is_err());
    }
}
