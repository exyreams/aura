//! Scheduled-intent (recurring/deferred proposal) instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `create_scheduled_intent`.
pub fn create_scheduled_intent(
    accounts: accounts::CreateScheduledIntent,
    intent_id: u64,
    args: aura_core::ScheduledIntentArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CreateScheduledIntent { intent_id, args }.data(),
    }
}

/// Builds `update_scheduled_intent`.
pub fn update_scheduled_intent(
    accounts: accounts::ManageScheduledIntent,
    args: aura_core::ScheduledIntentArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateScheduledIntent { args }.data(),
    }
}

/// Builds `pause_scheduled_intent`.
pub fn pause_scheduled_intent(accounts: accounts::ManageScheduledIntent) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::PauseScheduledIntent {}.data(),
    }
}

/// Builds `resume_scheduled_intent`.
pub fn resume_scheduled_intent(accounts: accounts::ManageScheduledIntent) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ResumeScheduledIntent {}.data(),
    }
}

/// Builds `close_scheduled_intent`.
pub fn close_scheduled_intent(accounts: accounts::CloseScheduledIntent) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseScheduledIntent {}.data(),
    }
}

/// Builds `clear_scheduled_intent_in_flight`.
pub fn clear_scheduled_intent_in_flight(
    accounts: accounts::ClearScheduledIntentInFlight,
    proposal_id: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ClearScheduledIntentInFlight { proposal_id, now }.data(),
    }
}

/// Builds `execute_scheduled_intent`.
pub fn execute_scheduled_intent(accounts: accounts::ExecuteScheduledIntent) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ExecuteScheduledIntent {}.data(),
    }
}
