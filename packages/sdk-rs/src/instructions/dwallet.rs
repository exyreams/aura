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
