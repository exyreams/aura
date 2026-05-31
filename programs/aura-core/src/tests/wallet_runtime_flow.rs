//! Tests for doc 02 — wallet runtime (controls + balances), domain surface.
//!
//! The instruction wrappers (init/status/limits/label/rotate/remove + the
//! balance ops) operate on a separate `DWalletAccount` PDA and are verified by
//! compilation + account constraints; the underlying control and ledger logic
//! is exercised here through `DWalletState` and `AgentTreasury` methods.

use anchor_lang::prelude::Pubkey;
use aura_policy::Chain;

use crate::constants::MAX_ASSETS_PER_WALLET;
use crate::program_accounts::TreasuryAccount;
use crate::state::{AssetBalance, DWalletState, DWalletStatus};

use super::proposal_flow::treasury;

fn asset(asset_id: &str, usd_value: u64) -> AssetBalance {
    AssetBalance {
        asset_id: asset_id.to_string(),
        symbol: "TKN".to_string(),
        decimals: 6,
        native_amount: 1_000,
        usd_value,
        updated_at: 1_000,
        feed: None,
    }
}

fn sample_state() -> DWalletState {
    DWalletState {
        treasury: Pubkey::new_unique().to_string(),
        chain: Chain::Ethereum,
        status: DWalletStatus::Active,
        daily_limit_usd: Some(1_000),
        per_tx_limit_usd: Some(400),
        spent_today_usd: 0,
        spend_window_start: 1_000,
        authority: Pubkey::new_unique().to_string(),
        cpi_authority_seed: "__ika_cpi_authority".to_string(),
        label: None,
        assets: Vec::new(),
        reserved_usd: 0,
        epoch: 0,
    }
}

#[test]
fn within_limits_enforces_per_tx_and_daily_caps() {
    let mut state = sample_state();
    // per-tx cap is 400
    assert!(state.within_limits(400, 1_000));
    assert!(!state.within_limits(401, 1_000));

    // daily cap is 1_000; 700 already spent in-window leaves 300
    state.spent_today_usd = 700;
    assert!(state.within_limits(300, 1_000));
    assert!(!state.within_limits(400, 1_000));
}

#[test]
fn spend_window_rolls_after_a_day() {
    let mut state = sample_state();
    state.spent_today_usd = 500;

    state.record_spend(400, 1_000);
    assert_eq!(state.spent_today_usd, 900);

    // a full day later the counter resets before accumulating
    state.record_spend(400, 1_000 + 86_400);
    assert_eq!(state.spent_today_usd, 400);
    assert_eq!(state.spend_window_start, 1_000 + 86_400);
    // and the stale prior spend no longer blocks within_limits
    assert_eq!(state.effective_spent_today(1_000), 400);
}

#[test]
fn reserve_release_tracks_available_balance() {
    let mut state = sample_state();
    state.assets.push(asset("usdc", 1_000));
    assert_eq!(state.total_usd(), 1_000);
    assert_eq!(state.available_usd(), 1_000);

    assert!(state.reserve(600));
    assert_eq!(state.available_usd(), 400);
    // cannot over-reserve beyond available
    assert!(!state.reserve(500));

    state.release(600);
    assert_eq!(state.available_usd(), 1_000);
}

#[test]
fn upsert_asset_replaces_in_place_and_caps_ledger() {
    let mut state = sample_state();
    for index in 0..MAX_ASSETS_PER_WALLET {
        state
            .upsert_asset(asset(&format!("asset-{index}"), 10))
            .expect("ledger has room");
    }
    assert_eq!(state.assets.len(), MAX_ASSETS_PER_WALLET);

    // replacing an existing id does not grow the ledger
    state
        .upsert_asset(asset("asset-0", 99))
        .expect("replace existing");
    assert_eq!(state.assets.len(), MAX_ASSETS_PER_WALLET);
    assert_eq!(state.assets[0].usd_value, 99);

    // a brand-new id past the cap is rejected
    assert!(state.upsert_asset(asset("overflow", 10)).is_err());
}

#[test]
fn set_asset_feed_requires_tracked_asset() {
    let mut state = sample_state();
    assert!(state.set_asset_feed("ghost", None).is_err());

    state.assets.push(asset("usdc", 1_000));
    let feed = Pubkey::new_unique().to_string();
    state
        .set_asset_feed("usdc", Some(feed.clone()))
        .expect("tracked asset");
    assert_eq!(state.assets[0].feed.as_deref(), Some(feed.as_str()));
}

#[test]
fn reservation_lifecycle_debits_and_records_spend() {
    let mut state = sample_state();
    state.assets.push(asset("usdc", 1_000));

    // reserve ahead of the outbound proposal
    assert!(!state.within_limits(600, 1_000)); // per-tx cap is 400
    state.per_tx_limit_usd = Some(1_000);
    assert!(state.within_limits(600, 1_000));
    assert!(state.reserve(600));
    assert_eq!(state.available_usd(), 400);

    // settle: debit the asset row, release the reservation, record the spend
    state.assets[0].native_amount = state.assets[0].native_amount.saturating_sub(100);
    state.assets[0].usd_value = state.assets[0].usd_value.saturating_sub(600);
    state.release(600);
    state.record_spend(600, 1_000);

    assert_eq!(state.reserved_usd, 0);
    assert_eq!(state.total_usd(), 400);
    assert_eq!(state.available_usd(), 400);
    assert_eq!(state.spent_today_usd, 600);
}

#[test]
fn status_governs_outbound_capability() {
    assert!(DWalletStatus::Active.permits_outbound());
    assert!(!DWalletStatus::Frozen.permits_outbound());
    assert!(!DWalletStatus::FrozenOut.permits_outbound());
    assert!(!DWalletStatus::Retired.permits_outbound());
}

#[test]
fn default_chain_requires_a_registered_dwallet() {
    let mut treasury = treasury();
    // Ethereum is registered by the helper
    treasury
        .set_default_chain(Some(Chain::Ethereum), 1_700_000_100)
        .expect("registered chain can be primary");
    assert_eq!(treasury.default_chain, Some(Chain::Ethereum));

    // Solana has no dWallet → rejected
    assert!(treasury
        .set_default_chain(Some(Chain::Solana), 1_700_000_101)
        .is_err());
    // still Ethereum after the failed attempt
    assert_eq!(treasury.default_chain, Some(Chain::Ethereum));

    // clearing is always allowed
    treasury
        .set_default_chain(None, 1_700_000_102)
        .expect("clearing primary chain");
    assert_eq!(treasury.default_chain, None);
}

#[test]
fn treasury_record_round_trips_default_chain() {
    let mut treasury = treasury();
    treasury
        .set_default_chain(Some(Chain::Ethereum), 1_700_000_100)
        .expect("set primary");

    let record = TreasuryAccount::from_domain(255, &treasury, 1_700_000_100).expect("encode");
    let decoded = record.to_domain_boxed().expect("decode");
    assert_eq!(decoded.default_chain, Some(Chain::Ethereum));
}
