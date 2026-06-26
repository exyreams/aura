//! Policy simulation, receipts, and attestation instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `simulate_policy`.
pub fn simulate_policy(
    accounts: accounts::SimulatePolicy,
    args: aura_core::SimulatePolicyArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SimulatePolicy { args }.data(),
    }
}

/// Builds `write_policy_receipt`.
pub fn write_policy_receipt(
    accounts: accounts::WritePolicyReceipt,
    args: aura_core::WritePolicyReceiptArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::WritePolicyReceipt { args }.data(),
    }
}

/// Builds `apply_policy_preset`.
pub fn apply_policy_preset(
    accounts: accounts::ApplyPolicyPreset,
    args: aura_core::ApplyPolicyPresetArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ApplyPolicyPreset { args }.data(),
    }
}

/// Builds `attest_policy`.
pub fn attest_policy(
    accounts: accounts::AttestPolicy,
    args: aura_core::AttestPolicyArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::AttestPolicy { args }.data(),
    }
}

/// Builds `check_invariants`.
pub fn check_invariants(
    accounts: accounts::CheckInvariants,
    args: aura_core::CheckInvariantsArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CheckInvariants { args }.data(),
    }
}

/// Builds `check_policy_cpi`.
pub fn check_policy_cpi(
    accounts: accounts::CheckPolicyCpi,
    args: aura_core::CheckPolicyCpiArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CheckPolicyCpi { args }.data(),
    }
}

/// Builds `init_policy_history`.
pub fn init_policy_history(accounts: accounts::InitPolicyHistory) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitPolicyHistory {}.data(),
    }
}

/// Builds `close_policy_history`.
pub fn close_policy_history(accounts: accounts::ClosePolicyHistory) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ClosePolicyHistory {}.data(),
    }
}

/// Builds `rollback_policy`.
pub fn rollback_policy(
    accounts: accounts::RollbackPolicy,
    target_version: u32,
    candidate: aura_core::PolicyConfigRecord,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RollbackPolicy {
            target_version,
            candidate,
            now,
        }
        .data(),
    }
}

/// Builds `start_canary`.
pub fn start_canary(
    accounts: accounts::StartCanary,
    candidate: aura_core::PolicyConfigRecord,
    sample_cap: u32,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::StartCanary {
            candidate,
            sample_cap,
            now,
        }
        .data(),
    }
}

/// Builds `promote_canary`.
pub fn promote_canary(accounts: accounts::PromoteCanary, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::PromoteCanary { now }.data(),
    }
}

/// Builds `discard_canary`.
pub fn discard_canary(accounts: accounts::DiscardCanary) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::DiscardCanary {}.data(),
    }
}

/// Builds `create_policy_template`.
pub fn create_policy_template(
    accounts: accounts::CreatePolicyTemplate,
    args: aura_core::CreatePolicyTemplateArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CreatePolicyTemplate { args }.data(),
    }
}

/// Builds `update_policy_template`.
pub fn update_policy_template(
    accounts: accounts::ManagePolicyTemplate,
    args: aura_core::UpdatePolicyTemplateArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdatePolicyTemplate { args }.data(),
    }
}

/// Builds `close_policy_template`.
pub fn close_policy_template(accounts: accounts::ClosePolicyTemplate) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ClosePolicyTemplate {}.data(),
    }
}

/// Builds `apply_policy_template`.
pub fn apply_policy_template(accounts: accounts::ApplyPolicyTemplate, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ApplyPolicyTemplate { now }.data(),
    }
}

/// Builds `apply_policy_template_parameterized`.
pub fn apply_policy_template_parameterized(
    accounts: accounts::ApplyPolicyTemplate,
    overrides: aura_core::ParameterizedOverrides,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ApplyPolicyTemplateParameterized { overrides, now }.data(),
    }
}
