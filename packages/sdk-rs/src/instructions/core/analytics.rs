//! Treasury analytics account instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `init_treasury_analytics`.
pub fn init_treasury_analytics(accounts: accounts::InitTreasuryAnalytics, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitTreasuryAnalytics { now }.data(),
    }
}

/// Builds `close_treasury_analytics`.
pub fn close_treasury_analytics(accounts: accounts::CloseTreasuryAnalytics) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseTreasuryAnalytics {}.data(),
    }
}
