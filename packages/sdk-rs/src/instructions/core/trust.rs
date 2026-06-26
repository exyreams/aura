//! Trust-envelope identity and policy instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `init_trust_identity`.
pub fn init_trust_identity(accounts: accounts::InitTrustIdentity, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitTrustIdentity { now }.data(),
    }
}

/// Builds `configure_trust_policy`.
pub fn configure_trust_policy(
    accounts: accounts::TrustEnvelopeConfig,
    args: aura_core::ConfigureTrustPolicyArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureTrustPolicy { args }.data(),
    }
}

/// Builds `restore_trust`.
pub fn restore_trust(accounts: accounts::TrustEnvelopeConfig, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RestoreTrust { now }.data(),
    }
}
