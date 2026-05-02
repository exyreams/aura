//! Treasury lifecycle and control instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `create_treasury`.
pub fn create_treasury(
    accounts: accounts::CreateTreasury,
    args: aura_core::CreateTreasuryArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CreateTreasury { args }.data(),
    }
}

/// Builds `pause_execution`.
pub fn pause_execution(accounts: accounts::PauseExecution, paused: bool, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::PauseExecution { paused, now }.data(),
    }
}

/// Builds `cancel_pending`.
pub fn cancel_pending(accounts: accounts::CancelPending, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CancelPending { now }.data(),
    }
}

/// Builds `configure_swarm`.
pub fn configure_swarm(
    accounts: accounts::ConfigureSwarm,
    args: aura_core::ConfigureSwarmArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureSwarm { args }.data(),
    }
}
