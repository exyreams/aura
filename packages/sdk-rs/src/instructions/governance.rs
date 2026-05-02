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

/// Builds `propose_ai_rotation`.
pub fn propose_ai_rotation(
    accounts: accounts::OwnerTreasury,
    new_ai_authority: solana_sdk::pubkey::Pubkey,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeAiRotation {
            new_ai_authority,
            now,
        }
        .data(),
    }
}

/// Builds `execute_ai_rotation`.
pub fn execute_ai_rotation(accounts: accounts::OwnerTreasury, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ExecuteAiRotation { now }.data(),
    }
}

/// Builds `cancel_ai_rotation`.
pub fn cancel_ai_rotation(accounts: accounts::OwnerTreasury, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CancelAiRotation { now }.data(),
    }
}

/// Builds `propose_guardian_rotation`.
pub fn propose_guardian_rotation(
    accounts: accounts::VetoConfigChange,
    action: u8,
    target_guardian: solana_sdk::pubkey::Pubkey,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeGuardianRotation {
            action,
            target_guardian,
            now,
        }
        .data(),
    }
}

/// Builds `execute_guardian_rotation`.
pub fn execute_guardian_rotation(accounts: accounts::VetoConfigChange, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ExecuteGuardianRotation { now }.data(),
    }
}

/// Builds `propose_config_change`.
pub fn propose_config_change(
    accounts: accounts::OwnerTreasury,
    change_id: u64,
    new_policy_config: aura_core::PolicyConfigRecord,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeConfigChange {
            change_id,
            new_policy_config,
            now,
        }
        .data(),
    }
}

/// Builds `execute_config_change`.
pub fn execute_config_change(
    accounts: accounts::OwnerTreasury,
    change_id: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ExecuteConfigChange { change_id, now }.data(),
    }
}

/// Builds `veto_config_change`.
pub fn veto_config_change(
    accounts: accounts::VetoConfigChange,
    change_id: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::VetoConfigChange { change_id, now }.data(),
    }
}

/// Builds `emergency_shutdown`.
pub fn emergency_shutdown(
    accounts: accounts::OwnerTreasury,
    recovery_pubkey: solana_sdk::pubkey::Pubkey,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::EmergencyShutdown {
            recovery_pubkey,
            now,
        }
        .data(),
    }
}
