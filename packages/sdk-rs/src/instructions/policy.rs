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
