//! Instruction builders for every `aura-core` entrypoint.

use anchor_lang::{InstructionData, ToAccountMetas};
use solana_sdk::instruction::Instruction;

pub use aura_core::accounts;

/// Builds `create_treasury`.
pub fn create_treasury(
    accounts: accounts::CreateTreasury,
    args: aura_core::CreateTreasuryArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CreateTreasury { args }.data(),
    }
}

/// Builds `register_dwallet`.
pub fn register_dwallet(
    accounts: accounts::RegisterDwallet,
    args: aura_core::RegisterDwalletArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RegisterDwallet { args }.data(),
    }
}

/// Builds `configure_confidential_guardrails`.
pub fn configure_confidential_guardrails(
    accounts: accounts::ConfigureConfidentialGuardrails,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureConfidentialGuardrails { now }.data(),
    }
}

/// Builds `configure_confidential_vector_guardrails`.
pub fn configure_confidential_vector_guardrails(
    accounts: accounts::ConfigureConfidentialVectorGuardrails,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureConfidentialVectorGuardrails { now }.data(),
    }
}

/// Builds `propose_transaction`.
pub fn propose_transaction(
    accounts: accounts::ProposeTransaction,
    args: aura_core::ProposeTransactionArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeTransaction { args }.data(),
    }
}

/// Builds `propose_confidential_transaction`.
pub fn propose_confidential_transaction(
    accounts: accounts::ProposeConfidentialTransaction,
    args: aura_core::ProposeConfidentialTransactionArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeConfidentialTransaction { args }.data(),
    }
}

/// Builds `propose_confidential_vector_transaction`.
pub fn propose_confidential_vector_transaction(
    accounts: accounts::ProposeConfidentialVectorTransaction,
    args: aura_core::ProposeConfidentialTransactionArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeConfidentialVectorTransaction { args }.data(),
    }
}

/// Builds `execute_pending`.
pub fn execute_pending(accounts: accounts::ExecutePending, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ExecutePending { now }.data(),
    }
}

/// Builds `request_policy_decryption`.
pub fn request_policy_decryption(
    accounts: accounts::RequestPolicyDecryption,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RequestPolicyDecryption { now }.data(),
    }
}

/// Builds `confirm_policy_decryption`.
pub fn confirm_policy_decryption(
    accounts: accounts::ConfirmPolicyDecryption,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfirmPolicyDecryption { now }.data(),
    }
}

/// Builds `finalize_execution`.
pub fn finalize_execution(accounts: accounts::FinalizeExecution, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::FinalizeExecution { now }.data(),
    }
}

/// Builds `pause_execution`.
pub fn pause_execution(accounts: accounts::PauseExecution, paused: bool, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::PauseExecution { paused, now }.data(),
    }
}

/// Builds `cancel_pending`.
pub fn cancel_pending(accounts: accounts::CancelPending, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CancelPending { now }.data(),
    }
}

/// Builds `configure_multisig`.
pub fn configure_multisig(
    accounts: accounts::ConfigureMultisig,
    args: aura_core::ConfigureMultisigArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureMultisig { args }.data(),
    }
}

/// Builds `propose_override`.
pub fn propose_override(
    accounts: accounts::ProposeOverride,
    new_daily_limit_usd: u64,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeOverride {
            new_daily_limit_usd,
            now,
        }
        .data(),
    }
}

/// Builds `collect_override_signature`.
pub fn collect_override_signature(
    accounts: accounts::CollectOverrideSignature,
    now: i64,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CollectOverrideSignature { now }.data(),
    }
}

/// Builds `configure_swarm`.
pub fn configure_swarm(
    accounts: accounts::ConfigureSwarm,
    args: aura_core::ConfigureSwarmArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureSwarm { args }.data(),
    }
}

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
        let ix = create_treasury(
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
        };
        let ix = propose_transaction(
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
            },
        );
        assert_eq!(ix.program_id, aura_core::ID);
        assert_eq!(ix.accounts.len(), 2);
        assert!(!ix.data.is_empty());
    }
}
