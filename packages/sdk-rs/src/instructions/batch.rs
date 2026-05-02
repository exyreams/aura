//! Batch execution instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `propose_batch`.
pub fn propose_batch(
    accounts: accounts::ProposeBatch,
    args: aura_core::ProposeBatchArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeBatch { args }.data(),
    }
}
