//! Agent identity, capability, and ownership-handover instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::{instruction::Instruction, pubkey::Pubkey};

/// Builds `register_agent`.
pub fn register_agent(
    accounts: accounts::AgentManage,
    args: aura_core::RegisterAgentArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RegisterAgent { args }.data(),
    }
}

/// Builds `revoke_agent`.
pub fn revoke_agent(accounts: accounts::AgentManage, key: Pubkey, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RevokeAgent { key, now }.data(),
    }
}

/// Builds `emergency_revoke_agent`.
pub fn emergency_revoke_agent(
    accounts: accounts::EmergencyRevokeAgent,
    key: Pubkey,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::EmergencyRevokeAgent { key, now }.data(),
    }
}

/// Builds `set_agent_capability`.
pub fn set_agent_capability(
    accounts: accounts::AgentManage,
    args: aura_core::SetAgentCapabilityArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SetAgentCapability { args }.data(),
    }
}

/// Builds `arm_capability_loosen`.
pub fn arm_capability_loosen(
    accounts: accounts::AgentManage,
    key: Pubkey,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ArmCapabilityLoosen { key, now }.data(),
    }
}

/// Builds `set_agent_tripwires`.
pub fn set_agent_tripwires(
    accounts: accounts::TrustEnvelopeConfig,
    args: aura_core::SetAgentTripwiresArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SetAgentTripwires { args }.data(),
    }
}

/// Builds `nominate_successor_owner`.
pub fn nominate_successor_owner(
    accounts: accounts::OwnershipHandover,
    args: aura_core::NominateSuccessorArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::NominateSuccessorOwner { args }.data(),
    }
}

/// Builds `execute_ownership_handover`.
pub fn execute_ownership_handover(
    accounts: accounts::ExecuteOwnershipHandover,
    args: aura_core::ExecuteHandoverArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ExecuteOwnershipHandover { args }.data(),
    }
}
