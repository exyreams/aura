//! Lifecycle management and operator role instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `grant_operator_role`.
pub fn grant_operator_role(
    accounts: accounts::GrantOperatorRole,
    args: aura_core::GrantOperatorRoleArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::GrantOperatorRole { args }.data(),
    }
}

/// Builds `revoke_operator_role`.
pub fn revoke_operator_role(accounts: accounts::RevokeOperatorRole, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RevokeOperatorRole { now }.data(),
    }
}

/// Builds `transition_agent_state`.
pub fn transition_agent_state(
    accounts: accounts::OwnerTreasury,
    target_state: u8,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::TransitionAgentState { target_state, now }.data(),
    }
}

/// Builds `migrate_treasury`.
pub fn migrate_treasury(accounts: accounts::MigrateTreasury) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::MigrateTreasury {}.data(),
    }
}

/// Builds `issue_session_key`.
pub fn issue_session_key(
    accounts: accounts::IssueSessionKey,
    args: aura_core::IssueSessionKeyArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::IssueSessionKey { args }.data(),
    }
}

/// Builds `revoke_session_key`.
pub fn revoke_session_key(accounts: accounts::RevokeSessionKey, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RevokeSessionKey { now }.data(),
    }
}

/// Builds `close_session_key`.
pub fn close_session_key(accounts: accounts::CloseSessionKey) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseSessionKey {}.data(),
    }
}

/// Builds `trigger_dead_mans_switch`.
pub fn trigger_dead_mans_switch(
    accounts: accounts::TriggerDeadMansSwitch,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::TriggerDeadMansSwitch { now }.data(),
    }
}

/// Builds `update_session_key`.
pub fn update_session_key(
    accounts: accounts::UpdateSessionKey,
    args: aura_core::UpdateSessionKeyArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateSessionKey { args }.data(),
    }
}

/// Builds `update_operator_role`.
pub fn update_operator_role(
    accounts: accounts::UpdateOperatorRole,
    args: aura_core::UpdateOperatorRoleArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateOperatorRole { args }.data(),
    }
}
