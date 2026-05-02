//! Transaction execution and approval instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `propose_transaction`.
pub fn propose_transaction(
    accounts: accounts::ProposeTransaction,
    args: aura_core::ProposeTransactionArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeTransaction { args }.data(),
    }
}

/// Builds `execute_pending`.
pub fn execute_pending(accounts: accounts::ExecutePending, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ExecutePending { now }.data(),
    }
}

/// Builds `finalize_execution`.
pub fn finalize_execution(accounts: accounts::FinalizeExecution, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::FinalizeExecution { now }.data(),
    }
}

/// Builds `approve_pending_execution`.
pub fn approve_pending_execution(
    accounts: accounts::ApprovePendingExecution,
    args: aura_core::ApprovePendingExecutionArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ApprovePendingExecution { args }.data(),
    }
}
