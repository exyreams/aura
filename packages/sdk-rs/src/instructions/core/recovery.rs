//! Recovery destination and break-glass instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `register_recovery_destination`.
pub fn register_recovery_destination(
    accounts: accounts::RecoveryConfig,
    args: aura_core::RegisterRecoveryDestinationArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RegisterRecoveryDestination { args }.data(),
    }
}

/// Builds `break_glass_recover`.
pub fn break_glass_recover(
    accounts: accounts::BreakGlassRecover,
    args: aura_core::BreakGlassRecoverArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::BreakGlassRecover { args }.data(),
    }
}

/// Builds `break_glass_transfer_authority`.
pub fn break_glass_transfer_authority(
    accounts: accounts::BreakGlassTransferAuthority,
    args: aura_core::BreakGlassTransferAuthorityArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::BreakGlassTransferAuthority { args }.data(),
    }
}
