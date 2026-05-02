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
