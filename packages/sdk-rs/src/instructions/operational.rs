//! Operational health, liveness, and scoped pause instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `init_external_liveness`.
pub fn init_external_liveness(
    accounts: accounts::InitExternalLiveness,
    args: aura_core::InitExternalLivenessArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitExternalLiveness { args }.data(),
    }
}

/// Builds `refresh_external_liveness`.
pub fn refresh_external_liveness(
    accounts: accounts::RefreshExternalLiveness,
    args: aura_core::RefreshExternalLivenessArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RefreshExternalLiveness { args }.data(),
    }
}

/// Builds `set_scoped_pause`.
pub fn set_scoped_pause(
    accounts: accounts::SetScopedPause,
    args: aura_core::SetScopedPauseArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SetScopedPause { args }.data(),
    }
}

/// Builds `init_health_score`.
pub fn init_health_score(accounts: accounts::InitHealthScore, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitHealthScore { now }.data(),
    }
}

/// Builds `refresh_health_score`.
pub fn refresh_health_score(accounts: accounts::UpdateHealthScore, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RefreshHealthScore { now }.data(),
    }
}

/// Builds `close_health_score`.
pub fn close_health_score(accounts: accounts::CloseHealthScore) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseHealthScore {}.data(),
    }
}

/// Builds `take_snapshot`.
pub fn take_snapshot(
    accounts: accounts::TakeSnapshot,
    snapshot_index: u32,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::TakeSnapshot {
            snapshot_index,
            now,
        }
        .data(),
    }
}

/// Builds `record_policy_snapshot`.
pub fn record_policy_snapshot(accounts: accounts::InitPolicyHistory, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RecordPolicySnapshot { now }.data(),
    }
}

/// Builds `close_snapshot`.
pub fn close_snapshot(accounts: accounts::CloseSnapshot) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseSnapshot {}.data(),
    }
}

/// Builds `init_activity_log`.
pub fn init_activity_log(accounts: accounts::InitActivityLog) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitActivityLog {}.data(),
    }
}

/// Builds `close_activity_log`.
pub fn close_activity_log(accounts: accounts::CloseActivityLog) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseActivityLog {}.data(),
    }
}
