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
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RequestPolicyDecryption { now }.data(),
    }
}

/// Builds `confirm_policy_decryption`.
pub fn confirm_policy_decryption(
    accounts: accounts::ConfirmPolicyDecryption,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfirmPolicyDecryption { now }.data(),
    }
}
