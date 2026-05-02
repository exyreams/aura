//! Lifecycle management and operator role instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `grant_operator_role`.
pub fn grant_operator_role(
    accounts: accounts::GrantOperatorRole,
    args: aura_core::GrantOperatorRoleArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::GrantOperatorRole { args }.data(),
    }
}

/// Builds `revoke_operator_role`.
pub fn revoke_operator_role(accounts: accounts::RevokeOperatorRole, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RevokeOperatorRole { now }.data(),
    }
}
