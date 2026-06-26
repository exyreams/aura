//! Protocol-level configuration instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `init_protocol_config`.
pub fn init_protocol_config(
    accounts: accounts::InitProtocolConfig,
    args: aura_core::ProtocolConfigArgs,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitProtocolConfig { args, now }.data(),
    }
}

/// Builds `update_protocol_config`.
pub fn update_protocol_config(
    accounts: accounts::ProtocolConfigAuthority,
    args: aura_core::ProtocolConfigArgs,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateProtocolConfig { args, now }.data(),
    }
}

/// Builds `commit_protocol_config`.
pub fn commit_protocol_config(
    accounts: accounts::ProtocolConfigAuthority,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CommitProtocolConfig { now }.data(),
    }
}
