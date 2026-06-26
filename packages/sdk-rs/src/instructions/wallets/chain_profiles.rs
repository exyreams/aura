//! Per-chain execution profile instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `register_chain_profile`.
pub fn register_chain_profile(
    accounts: accounts::RegisterChainProfile,
    args: aura_core::ChainProfileArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RegisterChainProfile { args }.data(),
    }
}

/// Builds `update_chain_profile`.
pub fn update_chain_profile(
    accounts: accounts::UpdateChainProfile,
    args: aura_core::ChainProfileArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateChainProfile { args }.data(),
    }
}
