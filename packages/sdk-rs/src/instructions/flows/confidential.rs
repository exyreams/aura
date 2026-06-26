//! Confidential transaction and FHE guardrail instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `configure_confidential_guardrails`.
pub fn configure_confidential_guardrails(
    accounts: accounts::ConfigureConfidentialGuardrails,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureConfidentialGuardrails { now }.data(),
    }
}

/// Builds `propose_confidential_transaction`.
pub fn propose_confidential_transaction(
    accounts: accounts::ProposeConfidentialTransaction,
    args: aura_core::ProposeConfidentialTransactionArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeConfidentialTransaction { args }.data(),
    }
}

/// Builds `request_policy_decryption`.
pub fn request_policy_decryption(
    accounts: accounts::RequestPolicyDecryption,
    now: i64,
    current_epoch_id: u64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RequestPolicyDecryption {
            now,
            current_epoch_id,
        }
        .data(),
    }
}

/// Builds `confirm_policy_decryption`.
pub fn confirm_policy_decryption(
    accounts: accounts::ConfirmPolicyDecryption,
    now: i64,
    current_epoch_id: u64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfirmPolicyDecryption {
            now,
            current_epoch_id,
        }
        .data(),
    }
}

/// Builds `init_confidential_guardrails`.
pub fn init_confidential_guardrails(
    accounts: accounts::InitConfidentialGuardrails,
    epoch_id: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitConfidentialGuardrails { epoch_id, now }.data(),
    }
}

/// Builds `update_confidential_guardrails`.
pub fn update_confidential_guardrails(
    accounts: accounts::ManageConfidentialGuardrails,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateConfidentialGuardrails { now }.data(),
    }
}

/// Builds `rotate_confidential_guardrails`.
pub fn rotate_confidential_guardrails(
    accounts: accounts::ManageConfidentialGuardrails,
    new_epoch_id: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RotateConfidentialGuardrails { new_epoch_id, now }.data(),
    }
}

/// Builds `reset_confidential_counters`.
pub fn reset_confidential_counters(
    accounts: accounts::ManageConfidentialGuardrails,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ResetConfidentialCounters { now }.data(),
    }
}

/// Builds `disable_confidential_guardrails`.
pub fn disable_confidential_guardrails(
    accounts: accounts::DisableConfidentialGuardrails,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::DisableConfidentialGuardrails { now }.data(),
    }
}

/// Builds `close_confidential_guardrails`.
pub fn close_confidential_guardrails(
    accounts: accounts::CloseConfidentialGuardrails,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseConfidentialGuardrails {}.data(),
    }
}

/// Builds `propose_confidential_batch`.
pub fn propose_confidential_batch(
    accounts: accounts::ProposeConfidentialBatch,
    args: aura_core::ProposeConfidentialBatchArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeConfidentialBatch { args }.data(),
    }
}
