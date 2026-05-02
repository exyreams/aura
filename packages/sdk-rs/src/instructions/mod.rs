//! Instruction builders organized by domain.

pub use aura_core::accounts;

pub mod address_lists;
pub mod batch;
pub mod budget;
pub mod confidential;
pub mod dwallet;
pub mod execution;
pub mod fees;
pub mod governance;
pub mod lifecycle;
pub mod operational;
pub mod policy;
pub mod swarm;
pub mod treasury;

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

    #[test]
    fn propose_transaction_builder_uses_program_id() {
        let accounts = accounts::ProposeTransaction {
            ai_authority: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
            session_key_account: None,
            swarm_pool: None,
            address_list: None,
            compliance_oracle: None,
            parent_treasury: None,
            budget_envelope: None,
            exposure_group: None,
        };
        let ix = execution::propose_transaction(
            accounts,
            aura_core::ProposeTransactionArgs {
                amount_usd: 10,
                target_chain: 2,
                tx_type: 0,
                protocol_id: None,
                current_timestamp: 42,
                expected_output_usd: None,
                actual_output_usd: None,
                quote_age_secs: None,
                counterparty_risk_score: None,
                recipient_or_contract: "dest".to_string(),
                sanctions_proof: Vec::new(),
            },
        );
        assert_eq!(ix.program_id, aura_core::ID);
        assert_eq!(ix.accounts.len(), 9);
        assert!(!ix.data.is_empty());
    }
}
