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

/// Builds `leave_swarm`.
pub fn leave_swarm(accounts: accounts::ManageSwarm, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::LeaveSwarm { now }.data(),
    }
}

/// Builds `update_swarm`.
pub fn update_swarm(
    accounts: accounts::ManageSwarm,
    shared_pool_limit_usd: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateSwarm {
            shared_pool_limit_usd,
            now,
        }
        .data(),
    }
}

/// Builds `close_swarm_pool`.
pub fn close_swarm_pool(accounts: accounts::CloseSwarmPool) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseSwarmPool {}.data(),
    }
}
