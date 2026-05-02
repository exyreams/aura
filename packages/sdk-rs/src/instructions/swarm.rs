//! Swarm pool instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `init_swarm_pool`.
pub fn init_swarm_pool(
    accounts: accounts::InitSwarmPool,
    args: aura_core::InitSwarmPoolArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitSwarmPool { args }.data(),
    }
}

/// Builds `join_swarm`.
pub fn join_swarm(accounts: accounts::JoinSwarm, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::JoinSwarm { now }.data(),
    }
}
