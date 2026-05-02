//! Operational health, liveness, and scoped pause instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `init_external_liveness`.
pub fn init_external_liveness(
    accounts: accounts::InitExternalLiveness,
    args: aura_core::InitExternalLivenessArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitExternalLiveness { args }.data(),
    }
}

/// Builds `refresh_external_liveness`.
pub fn refresh_external_liveness(
    accounts: accounts::RefreshExternalLiveness,
    args: aura_core::RefreshExternalLivenessArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RefreshExternalLiveness { args }.data(),
    }
}

/// Builds `set_scoped_pause`.
pub fn set_scoped_pause(
    accounts: accounts::SetScopedPause,
    args: aura_core::SetScopedPauseArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SetScopedPause { args }.data(),
    }
}
