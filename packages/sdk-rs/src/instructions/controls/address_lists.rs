//! Address list instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `init_address_list`.
pub fn init_address_list(
    accounts: accounts::InitAddressList,
    mode: u8,
    chain: u8,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitAddressList { mode, chain, now }.data(),
    }
}

/// Builds `manage_address_list`.
pub fn manage_address_list(
    accounts: accounts::ManageAddressList,
    mode: u8,
    chain: u8,
    addresses: Vec<String>,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ManageAddressList {
            mode,
            chain,
            addresses,
            now,
        }
        .data(),
    }
}

/// Builds `close_address_list`.
pub fn close_address_list(accounts: accounts::CloseAddressList) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseAddressList {}.data(),
    }
}

/// Builds `update_address_list_entry`.
pub fn update_address_list_entry(
    accounts: accounts::ManageAddressList,
    address: String,
    add: bool,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateAddressListEntry { address, add, now }.data(),
    }
}

/// Builds `clear_address_list`.
pub fn clear_address_list(accounts: accounts::ManageAddressList, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ClearAddressList { now }.data(),
    }
}
