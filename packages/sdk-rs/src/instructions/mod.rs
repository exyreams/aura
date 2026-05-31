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
    use solana_sdk::{instruction::Instruction, pubkey::Pubkey};

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
            dwallet_state: None,
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
                asset_id: None,
                native_amount: None,
                decimals: None,
                gas_native_amount: None,
                gas_asset_id: None,
            },
        );
        assert_eq!(ix.program_id, aura_core::ID);
        assert_eq!(ix.accounts.len(), 10);
        assert!(!ix.data.is_empty());
    }

    #[test]
    fn advanced_builder_surface_is_publicly_reachable() {
        let _: fn(accounts::OwnerTreasury, Pubkey, i64) -> Instruction =
            governance::propose_ai_rotation;
        let _: fn(accounts::OwnerTreasury, i64) -> Instruction = governance::execute_ai_rotation;
        let _: fn(accounts::OwnerTreasury, i64) -> Instruction = governance::cancel_ai_rotation;
        let _: fn(accounts::VetoConfigChange, u8, Pubkey, i64) -> Instruction =
            governance::propose_guardian_rotation;
        let _: fn(accounts::VetoConfigChange, i64) -> Instruction =
            governance::execute_guardian_rotation;
        let _: fn(accounts::OwnerTreasury, u64, aura_core::PolicyConfigRecord, i64) -> Instruction =
            governance::propose_config_change;
        let _: fn(accounts::OwnerTreasury, u64, i64) -> Instruction =
            governance::execute_config_change;
        let _: fn(accounts::VetoConfigChange, u64, i64) -> Instruction =
            governance::veto_config_change;
        let _: fn(accounts::OwnerTreasury, Pubkey, i64) -> Instruction =
            governance::emergency_shutdown;

        let _: fn(accounts::OwnerTreasury, u8, i64) -> Instruction =
            lifecycle::transition_agent_state;
        let _: fn(accounts::MigrateTreasury) -> Instruction = lifecycle::migrate_treasury;
        let _: fn(accounts::IssueSessionKey, aura_core::IssueSessionKeyArgs) -> Instruction =
            lifecycle::issue_session_key;
        let _: fn(accounts::RevokeSessionKey, i64) -> Instruction = lifecycle::revoke_session_key;
        let _: fn(accounts::CloseSessionKey) -> Instruction = lifecycle::close_session_key;
        let _: fn(accounts::TriggerDeadMansSwitch, i64) -> Instruction =
            lifecycle::trigger_dead_mans_switch;
        let _: fn(accounts::CheckPolicyCpi, aura_core::CheckPolicyCpiArgs) -> Instruction =
            policy::check_policy_cpi;

        let _: fn(accounts::InitHealthScore, i64) -> Instruction = operational::init_health_score;
        let _: fn(accounts::UpdateHealthScore, i64) -> Instruction =
            operational::refresh_health_score;
        let _: fn(accounts::CloseHealthScore) -> Instruction = operational::close_health_score;
        let _: fn(accounts::TakeSnapshot, u32, i64) -> Instruction = operational::take_snapshot;
        let _: fn(accounts::InitPolicyHistory, i64) -> Instruction =
            operational::record_policy_snapshot;
        let _: fn(accounts::CloseSnapshot) -> Instruction = operational::close_snapshot;
        let _: fn(accounts::InitActivityLog) -> Instruction = operational::init_activity_log;
        let _: fn(accounts::CloseActivityLog) -> Instruction = operational::close_activity_log;

        let _: fn(accounts::InitSwarmPool, aura_core::InitSwarmPoolArgs) -> Instruction =
            swarm::init_swarm_pool;
        let _: fn(accounts::JoinSwarm, i64) -> Instruction = swarm::join_swarm;

        let _: fn(accounts::InitFeeVault, Pubkey, i64) -> Instruction = fees::init_fee_vault;
        let _: fn(accounts::CollectFees, i64) -> Instruction = fees::collect_fees;
        let _: fn(accounts::CloseFeeVault) -> Instruction = fees::close_fee_vault;

        let _: fn(accounts::InitAddressList, u8, u8, i64) -> Instruction =
            address_lists::init_address_list;
        let _: fn(accounts::ManageAddressList, u8, u8, Vec<String>, i64) -> Instruction =
            address_lists::manage_address_list;
        let _: fn(accounts::CloseAddressList) -> Instruction = address_lists::close_address_list;

        let _: fn(accounts::InitPolicyHistory) -> Instruction = policy::init_policy_history;
        let _: fn(accounts::ClosePolicyHistory) -> Instruction = policy::close_policy_history;
        let _: fn(accounts::RefreshDwalletBalance, u8, i64) -> Instruction =
            dwallet::refresh_dwallet_balance;
    }
}
