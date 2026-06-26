//! dWallet registration and management instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `register_dwallet`.
pub fn register_dwallet(
    accounts: accounts::RegisterDwallet,
    args: aura_core::RegisterDwalletArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RegisterDwallet { args }.data(),
    }
}

/// Builds `refresh_dwallet_balance`.
pub fn refresh_dwallet_balance(
    accounts: accounts::RefreshDwalletBalance,
    chain_code: u8,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RefreshDwalletBalance { chain_code, now }.data(),
    }
}

/// Builds `init_dwallet_state`.
pub fn init_dwallet_state(
    accounts: accounts::InitDwalletState,
    chain: u8,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitDwalletState { chain, now }.data(),
    }
}

/// Builds `set_dwallet_status`.
pub fn set_dwallet_status(
    accounts: accounts::DwalletControl,
    chain: u8,
    status_code: u8,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SetDwalletStatus {
            chain,
            status_code,
            now,
        }
        .data(),
    }
}

/// Builds `set_dwallet_limits`.
pub fn set_dwallet_limits(
    accounts: accounts::DwalletControl,
    chain: u8,
    daily_limit_usd: Option<u64>,
    per_tx_limit_usd: Option<u64>,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SetDwalletLimits {
            chain,
            daily_limit_usd,
            per_tx_limit_usd,
            now,
        }
        .data(),
    }
}

/// Builds `set_dwallet_label`.
pub fn set_dwallet_label(
    accounts: accounts::DwalletControl,
    chain: u8,
    label: Option<String>,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SetDwalletLabel { chain, label, now }.data(),
    }
}

/// Builds `rotate_dwallet_authority`.
pub fn rotate_dwallet_authority(
    accounts: accounts::DwalletControl,
    chain: u8,
    new_authority: solana_sdk::pubkey::Pubkey,
    new_cpi_authority_seed: String,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RotateDwalletAuthority {
            chain,
            new_authority,
            new_cpi_authority_seed,
            now,
        }
        .data(),
    }
}

/// Builds `set_default_chain`.
pub fn set_default_chain(
    accounts: accounts::SetDefaultChain,
    chain: Option<u8>,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SetDefaultChain { chain, now }.data(),
    }
}

/// Builds `remove_dwallet`.
pub fn remove_dwallet(accounts: accounts::RemoveDwallet, chain: u8, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RemoveDwallet { chain, now }.data(),
    }
}

/// Builds `refresh_asset_balance`.
#[allow(clippy::too_many_arguments)]
pub fn refresh_asset_balance(
    accounts: accounts::DwalletControl,
    chain: u8,
    asset_id: String,
    symbol: String,
    decimals: u8,
    native_amount: u128,
    usd_value: u64,
    feed: Option<solana_sdk::pubkey::Pubkey>,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RefreshAssetBalance {
            chain,
            asset_id,
            symbol,
            decimals,
            native_amount,
            usd_value,
            feed,
            now,
        }
        .data(),
    }
}

/// Builds `record_deposit`.
#[allow(clippy::too_many_arguments)]
pub fn record_deposit(
    accounts: accounts::DwalletControl,
    chain: u8,
    asset_id: String,
    symbol: String,
    decimals: u8,
    native_amount: u128,
    usd_value: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RecordDeposit {
            chain,
            asset_id,
            symbol,
            decimals,
            native_amount,
            usd_value,
            now,
        }
        .data(),
    }
}

/// Builds `set_asset_feed`.
pub fn set_asset_feed(
    accounts: accounts::DwalletControl,
    chain: u8,
    asset_id: String,
    feed: Option<solana_sdk::pubkey::Pubkey>,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SetAssetFeed {
            chain,
            asset_id,
            feed,
            now,
        }
        .data(),
    }
}

/// Builds `set_asset_oracle_feed`.
pub fn set_asset_oracle_feed(
    accounts: accounts::DwalletControl,
    chain: u8,
    args: aura_core::SetAssetOracleFeedArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SetAssetOracleFeed { chain, args }.data(),
    }
}

/// Builds `refresh_verified_asset_balance`.
pub fn refresh_verified_asset_balance(
    accounts: accounts::RefreshVerifiedAssetBalance,
    args: aura_core::RefreshVerifiedAssetBalanceArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RefreshVerifiedAssetBalance { args }.data(),
    }
}

/// Builds `reconcile_dwallet_balance`.
pub fn reconcile_dwallet_balance(
    accounts: accounts::DwalletControl,
    chain: u8,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ReconcileDwalletBalance { chain, now }.data(),
    }
}

/// Builds `reserve_dwallet_spend`.
pub fn reserve_dwallet_spend(
    accounts: accounts::DwalletSpend,
    chain: u8,
    amount_usd: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ReserveDwalletSpend {
            chain,
            amount_usd,
            now,
        }
        .data(),
    }
}

/// Builds `settle_dwallet_spend`.
pub fn settle_dwallet_spend(
    accounts: accounts::DwalletSpend,
    chain: u8,
    amount_usd: u64,
    asset_id: String,
    native_amount: u128,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SettleDwalletSpend {
            chain,
            amount_usd,
            asset_id,
            native_amount,
            now,
        }
        .data(),
    }
}

/// Builds `release_dwallet_spend`.
pub fn release_dwallet_spend(
    accounts: accounts::DwalletSpend,
    chain: u8,
    amount_usd: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ReleaseDwalletSpend {
            chain,
            amount_usd,
            now,
        }
        .data(),
    }
}
