//! Instruction builders for the full `aura-core` program surface.
//!
//! Builders are grouped into category modules by product area:
//!
//! - [`core`] — treasury lifecycle, agent identity, trust, recovery, analytics
//! - [`flows`] — proposals, batches, conditional txs, scheduled intents, execution
//! - [`wallets`] — dWallet controls/balances/transfers, chain profiles
//! - [`admin`] — governance, rotations, sessions, operator roles, lifecycle
//! - [`controls`] — policy controls, budgets, operational surface, address lists, swarm
//! - [`economics`] — fees, billing, protocol config
//!
//! Every domain module is also re-exported at this level, so both
//! `instructions::core::treasury::create_treasury` and the shorter
//! `instructions::treasury::create_treasury` resolve to the same builder.

pub use aura_core::accounts;

pub mod admin;
pub mod controls;
pub mod core;
pub mod economics;
pub mod flows;
pub mod wallets;

// Flat domain re-exports preserve ergonomic `instructions::<domain>` paths.
pub use admin::{governance, lifecycle};
pub use controls::{address_lists, budget, operational, policy, swarm};
pub use core::{agent, analytics, recovery, treasury, trust};
pub use economics::{billing, fees, protocol_config};
pub use flows::{batch, conditional, confidential, execution, scheduled_intents};
pub use wallets::{chain_profiles, dwallet};

#[cfg(test)]
mod surface;

#[cfg(test)]
mod tests {
    use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
    use solana_sdk::pubkey::Pubkey;

    use super::*;

    #[test]
    fn create_treasury_builder_uses_program_id() {
        let accounts = accounts::CreateTreasury {
            owner: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
            system_program: SYSTEM_PROGRAM_ID,
        };
        let ix = treasury::create_treasury(
            accounts,
            aura_core::CreateTreasuryArgs {
                agent_id: "agent".to_string(),
                ai_authority: Pubkey::new_unique(),
                created_at: 1,
                pending_transaction_ttl_secs: 900,
                policy_config: aura_core::PolicyConfigRecord::from_domain(
                    &aura_policy::PolicyConfig::default(),
                ),
                protocol_fees: aura_core::ProtocolFeesRecord::from_domain(
                    &aura_core::ProtocolFees::default(),
                ),
            },
        );
        assert_eq!(ix.program_id, aura_core::ID);
        assert_eq!(ix.accounts.len(), 3);
        assert!(!ix.data.is_empty());
    }
}
