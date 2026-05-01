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

/// Builds `simulate_policy`.
pub fn simulate_policy(
    accounts: accounts::SimulatePolicy,
    args: aura_core::SimulatePolicyArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::SimulatePolicy { args }.data(),
    }
}

/// Builds `write_policy_receipt`.
pub fn write_policy_receipt(
    accounts: accounts::WritePolicyReceipt,
    args: aura_core::WritePolicyReceiptArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::WritePolicyReceipt { args }.data(),
    }
}

/// Builds `apply_policy_preset`.
pub fn apply_policy_preset(
    accounts: accounts::ApplyPolicyPreset,
    args: aura_core::ApplyPolicyPresetArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ApplyPolicyPreset { args }.data(),
    }
}

/// Builds `configure_budget_envelope`.
pub fn configure_budget_envelope(
    accounts: accounts::ConfigureBudgetEnvelope,
    args: aura_core::ConfigureBudgetEnvelopeArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureBudgetEnvelope { args }.data(),
    }
}

/// Builds `init_exposure_group`.
pub fn init_exposure_group(
    accounts: accounts::InitExposureGroup,
    args: aura_core::InitExposureGroupArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::InitExposureGroup { args }.data(),
    }
}

/// Builds `join_exposure_group`.
pub fn join_exposure_group(accounts: accounts::JoinExposureGroup) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::JoinExposureGroup {}.data(),
    }
}

/// Builds `configure_approval_ladder`.
pub fn configure_approval_ladder(
    accounts: accounts::ConfigureApprovalLadder,
    args: aura_core::ConfigureApprovalLadderArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureApprovalLadder { args }.data(),
    }
}

/// Builds `approve_pending_execution`.
pub fn approve_pending_execution(
    accounts: accounts::ApprovePendingExecution,
    args: aura_core::ApprovePendingExecutionArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ApprovePendingExecution { args }.data(),
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

/// Builds `grant_operator_role`.
pub fn grant_operator_role(
    accounts: accounts::GrantOperatorRole,
    args: aura_core::GrantOperatorRoleArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::GrantOperatorRole { args }.data(),
    }
}

/// Builds `revoke_operator_role`.
pub fn revoke_operator_role(accounts: accounts::RevokeOperatorRole, now: i64) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::RevokeOperatorRole { now }.data(),
    }
}

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

/// Builds `configure_liveness_guardrails`.
pub fn configure_liveness_guardrails(
    accounts: accounts::ConfigureLivenessGuardrails,
    args: aura_core::ConfigureLivenessGuardrailsArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ConfigureLivenessGuardrails { args }.data(),
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

/// Builds `attest_policy`.
pub fn attest_policy(
    accounts: accounts::AttestPolicy,
    args: aura_core::AttestPolicyArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::AttestPolicy { args }.data(),
    }
}

/// Builds `propose_batch`.
pub fn propose_batch(
    accounts: accounts::ProposeBatch,
    args: aura_core::ProposeBatchArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::ProposeBatch { args }.data(),
    }
}

/// Builds `check_invariants`.
pub fn check_invariants(
    accounts: accounts::CheckInvariants,
    args: aura_core::CheckInvariantsArgs,
) -> Instruction {
    Instruction {
        program_id: aura_core::ID,
        accounts: accounts.to_account_metas(None),
        data: aura_core::instruction::CheckInvariants { args }.data(),
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
            session_key_account: None,
            swarm_pool: None,
            address_list: None,
            compliance_oracle: None,
            parent_treasury: None,
            budget_envelope: None,
            exposure_group: None,
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
                sanctions_proof: Vec::new(),
            },
        );
        assert_eq!(ix.program_id, aura_core::ID);
        assert_eq!(ix.accounts.len(), 9);
        assert!(!ix.data.is_empty());
    }
}
