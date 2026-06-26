//! Billing template and organization profile instructions.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::accounts;
use solana_sdk::instruction::Instruction;

/// Builds `create_billing_template`.
pub fn create_billing_template(
    accounts: accounts::CreateBillingTemplate,
    args: aura_core::CreateBillingTemplateArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CreateBillingTemplate { args }.data(),
    }
}

/// Builds `update_billing_template`.
pub fn update_billing_template(
    accounts: accounts::ManageBillingTemplate,
    args: aura_core::UpdateBillingTemplateArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::UpdateBillingTemplate { args }.data(),
    }
}

/// Builds `close_billing_template`.
pub fn close_billing_template(accounts: accounts::CloseBillingTemplate) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CloseBillingTemplate {}.data(),
    }
}

/// Builds `apply_billing_template`.
pub fn apply_billing_template(accounts: accounts::ApplyBillingTemplate, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ApplyBillingTemplate { now }.data(),
    }
}

/// Builds `apply_org_profile`.
pub fn apply_org_profile(accounts: accounts::ApplyOrgProfile, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ApplyOrgProfile { now }.data(),
    }
}
