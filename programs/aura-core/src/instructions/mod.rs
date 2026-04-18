/// Anchor instruction handlers for `aura-core`.
///
/// Each file in this module corresponds to one on-chain instruction. Every
/// file exports:
/// - An `Accounts` struct (Anchor account constraints)
/// - A `handler` function (the instruction logic)
/// - Optionally an `Args` struct for instruction data that doesn't fit in
///   account constraints
///
/// All handlers follow the same pattern:
/// 1. Deserialize the `TreasuryAccount` into an `AgentTreasury` domain object
/// 2. Validate any external accounts (dWallet, Encrypt) that are `UncheckedAccount`
/// 3. Delegate to the appropriate function in `execution/` or `governance/`
/// 4. Call `sync_treasury_account` to serialize the domain object back and
///    emit audit events
pub mod cancel_pending;
pub mod collect_override_signature;
pub mod configure_confidential_guardrails;
pub mod configure_confidential_vector_guardrails;
pub mod configure_multisig;
pub mod configure_swarm;
pub mod confirm_policy_decryption;
pub mod create_treasury;
pub mod execute_pending;
pub mod finalize_execution;
pub mod pause_execution;
pub mod propose_confidential_transaction;
pub mod propose_confidential_vector_transaction;
pub mod propose_override;
pub mod propose_transaction;
pub mod register_dwallet;
pub mod request_policy_decryption;

pub use cancel_pending::CancelPending;
pub(crate) use cancel_pending::__client_accounts_cancel_pending;
pub use collect_override_signature::CollectOverrideSignature;
pub(crate) use collect_override_signature::__client_accounts_collect_override_signature;
pub use configure_confidential_guardrails::ConfigureConfidentialGuardrails;
pub(crate) use configure_confidential_guardrails::__client_accounts_configure_confidential_guardrails;
pub use configure_confidential_vector_guardrails::ConfigureConfidentialVectorGuardrails;
pub(crate) use configure_confidential_vector_guardrails::__client_accounts_configure_confidential_vector_guardrails;
pub(crate) use configure_multisig::__client_accounts_configure_multisig;
pub use configure_multisig::{ConfigureMultisig, ConfigureMultisigArgs};
pub(crate) use configure_swarm::__client_accounts_configure_swarm;
pub use configure_swarm::{ConfigureSwarm, ConfigureSwarmArgs};
pub use confirm_policy_decryption::ConfirmPolicyDecryption;
pub(crate) use confirm_policy_decryption::__client_accounts_confirm_policy_decryption;
pub(crate) use create_treasury::__client_accounts_create_treasury;
pub use create_treasury::{CreateTreasury, CreateTreasuryArgs};
pub use execute_pending::ExecutePending;
pub(crate) use execute_pending::__client_accounts_execute_pending;
pub use finalize_execution::FinalizeExecution;
pub(crate) use finalize_execution::__client_accounts_finalize_execution;
pub use pause_execution::PauseExecution;
pub(crate) use pause_execution::__client_accounts_pause_execution;
pub(crate) use propose_confidential_transaction::__client_accounts_propose_confidential_transaction;
pub use propose_confidential_transaction::{
    ProposeConfidentialTransaction, ProposeConfidentialTransactionArgs,
};
pub use propose_confidential_vector_transaction::ProposeConfidentialVectorTransaction;
pub(crate) use propose_confidential_vector_transaction::__client_accounts_propose_confidential_vector_transaction;
pub use propose_override::ProposeOverride;
pub(crate) use propose_override::__client_accounts_propose_override;
pub(crate) use propose_transaction::__client_accounts_propose_transaction;
pub use propose_transaction::{ProposeTransaction, ProposeTransactionArgs};
pub(crate) use register_dwallet::__client_accounts_register_dwallet;
pub use register_dwallet::{RegisterDwallet, RegisterDwalletArgs};
pub use request_policy_decryption::RequestPolicyDecryption;
pub(crate) use request_policy_decryption::__client_accounts_request_policy_decryption;

use anchor_lang::prelude::*;

use crate::{
    program_accounts::TreasuryAccount,
    program_events::{emit_audit_events, emit_proposal_event},
    AgentTreasury,
};

/// Serializes the updated domain object back into the on-chain account and
/// emits any pending audit events and proposal events.
///
/// Called at the end of every instruction handler after all mutations are
/// complete. Fails if the domain object cannot be serialized into the
/// account's allocated space.
pub fn sync_treasury_account(
    account: &mut Account<'_, TreasuryAccount>,
    domain: &AgentTreasury,
    updated_at: i64,
) -> Result<()> {
    account.apply_domain(domain, updated_at)?;
    emit_audit_events(account.key(), domain.audit_trail.events());
    if let Some(pending) = &domain.pending {
        emit_proposal_event(account.key(), pending);
    }
    Ok(())
}
