//! Governance, multisig, and override instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `configure_multisig`.
pub fn configure_multisig(
    accounts: accounts::ConfigureMultisig,
    args: aura_core::ConfigureMultisigArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureMultisig { args }.data(),
    }
}

/// Builds `propose_override`.
pub fn propose_override(
    accounts: accounts::ProposeOverride,
    new_daily_limit_usd: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeOverride {
            new_daily_limit_usd,
            now,
        }
        .data(),
    }
}

/// Builds `collect_override_signature`.
pub fn collect_override_signature(
    accounts: accounts::CollectOverrideSignature,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CollectOverrideSignature { now }.data(),
    }
}
