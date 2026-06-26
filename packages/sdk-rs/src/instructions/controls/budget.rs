//! Budget envelopes, exposure groups, and approval ladder instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `configure_budget_envelope`.
pub fn configure_budget_envelope(
    accounts: accounts::ConfigureBudgetEnvelope,
    args: aura_core::ConfigureBudgetEnvelopeArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureBudgetEnvelope { args }.data(),
    }
}

/// Builds `init_exposure_group`.
pub fn init_exposure_group(
    accounts: accounts::InitExposureGroup,
    args: aura_core::InitExposureGroupArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitExposureGroup { args }.data(),
    }
}

/// Builds `join_exposure_group`.
pub fn join_exposure_group(accounts: accounts::JoinExposureGroup) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::JoinExposureGroup {}.data(),
    }
}

/// Builds `configure_approval_ladder`.
pub fn configure_approval_ladder(
    accounts: accounts::ConfigureApprovalLadder,
    args: aura_core::ConfigureApprovalLadderArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureApprovalLadder { args }.data(),
    }
}

/// Builds `configure_liveness_guardrails`.
pub fn configure_liveness_guardrails(
    accounts: accounts::ConfigureLivenessGuardrails,
    args: aura_core::ConfigureLivenessGuardrailsArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureLivenessGuardrails { args }.data(),
    }
}

/// Builds `remove_budget_envelope`.
pub fn remove_budget_envelope(
    accounts: accounts::RemoveBudgetEnvelope,
    envelope_id: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RemoveBudgetEnvelope { envelope_id, now }.data(),
    }
}

/// Builds `leave_exposure_group`.
pub fn leave_exposure_group(accounts: accounts::ManageExposureGroup) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::LeaveExposureGroup {}.data(),
    }
}

/// Builds `update_exposure_group`.
pub fn update_exposure_group(
    accounts: accounts::ManageExposureGroup,
    daily_limit_usd: Option<u64>,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateExposureGroup { daily_limit_usd }.data(),
    }
}

/// Builds `close_exposure_group`.
pub fn close_exposure_group(accounts: accounts::CloseExposureGroup) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseExposureGroup {}.data(),
    }
}
