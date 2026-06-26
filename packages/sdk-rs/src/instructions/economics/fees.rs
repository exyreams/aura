//! Fee vault instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `init_fee_vault`.
pub fn init_fee_vault(
    accounts: accounts::InitFeeVault,
    protocol_fee_recipient: solana_sdk::pubkey::Pubkey,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitFeeVault {
            protocol_fee_recipient,
            now,
        }
        .data(),
    }
}

/// Builds `collect_fees`.
pub fn collect_fees(accounts: accounts::CollectFees, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CollectFees { now }.data(),
    }
}

/// Builds `close_fee_vault`.
pub fn close_fee_vault(accounts: accounts::CloseFeeVault) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseFeeVault {}.data(),
    }
}

/// Builds `deposit_fees`.
pub fn deposit_fees(accounts: accounts::ManageFeeVault, amount: u64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::DepositFees { amount }.data(),
    }
}

/// Builds `withdraw_unused_fees`.
pub fn withdraw_unused_fees(accounts: accounts::ManageFeeVault, amount: u64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::WithdrawUnusedFees { amount }.data(),
    }
}

/// Builds `set_fee_splits`.
pub fn set_fee_splits(
    accounts: accounts::ManageFeeVault,
    splits: Vec<aura_core::FeeSplitRecord>,
    low_balance_mode: u8,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SetFeeSplits {
            splits,
            low_balance_mode,
        }
        .data(),
    }
}

/// Builds `update_fee_recipient`.
pub fn update_fee_recipient(
    accounts: accounts::UpdateFeeRecipient,
    new_recipient: solana_sdk::pubkey::Pubkey,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateFeeRecipient { new_recipient }.data(),
    }
}

/// Builds `init_fee_schedule`.
pub fn init_fee_schedule(
    accounts: accounts::InitFeeSchedule,
    schedule: aura_core::FeeScheduleRecord,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitFeeSchedule { schedule, now }.data(),
    }
}

/// Builds `update_fee_schedule`.
pub fn update_fee_schedule(
    accounts: accounts::UpdateFeeSchedule,
    schedule: aura_core::FeeScheduleRecord,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateFeeSchedule { schedule, now }.data(),
    }
}

/// Builds `close_fee_schedule`.
pub fn close_fee_schedule(accounts: accounts::CloseFeeSchedule) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseFeeSchedule {}.data(),
    }
}
