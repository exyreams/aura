//! Conditional (trigger-gated) transaction instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `propose_conditional_transaction`.
pub fn propose_conditional_transaction(
    accounts: accounts::ProposeConditionalTransaction,
    proposal_id: u64,
    args: aura_core::ConditionalProposalArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeConditionalTransaction { proposal_id, args }.data(),
    }
}

/// Builds `try_trigger`.
pub fn try_trigger(accounts: accounts::TryTrigger) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::TryTrigger {}.data(),
    }
}

/// Builds `close_conditional_proposal`.
pub fn close_conditional_proposal(accounts: accounts::CloseConditionalProposal) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseConditionalProposal {}.data(),
    }
}
