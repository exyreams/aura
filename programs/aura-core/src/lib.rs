//! `aura-core` — the deployed Anchor program for AURA treasury coordination.
//!
//! This crate is the on-chain half of the AURA protocol. It owns the
//! `TreasuryAccount` PDA and exposes the full instruction set for creating
//! and operating agent treasuries: registering dWallets, submitting proposals,
//! running FHE policy evaluation, requesting dWallet signatures, and finalizing
//! execution.
//!
//! ## Module layout
//!
//! - `instructions/` — one file per Anchor instruction handler
//! - `state/`        — domain model types (`AgentTreasury`, `PendingTransaction`, etc.)
//! - `execution/`    — proposal lifecycle state-machine logic
//! - `ext_cpi/`      — thin adapters for dWallet and Encrypt CPIs
//! - `governance/`   — emergency multisig override
//! - `audit/`        — append-only audit trail
//! - `program_accounts/` — Anchor account serialization layer
//! - `program_events/`   — on-chain event emission
//! - `program_error/`    — `AuraCoreError` and `TreasuryError` → Anchor error mapping
//! - `constants/`    — field length limits and collection caps
#![allow(unexpected_cfgs)]
#![forbid(unsafe_code)]

use anchor_lang::prelude::*;

pub mod audit;
pub mod constants;
pub mod errors;
pub mod execution;
pub mod ext_cpi;
pub mod governance;
pub mod instructions;
pub mod program_accounts;
pub mod program_error;
pub mod program_events;
pub mod state;

pub use instructions::*;
#[allow(unused_imports)]
use instructions::{
    __client_accounts_cancel_pending, __client_accounts_collect_override_signature,
    __client_accounts_configure_confidential_guardrails,
    __client_accounts_configure_confidential_vector_guardrails,
    __client_accounts_configure_multisig, __client_accounts_configure_swarm,
    __client_accounts_confirm_policy_decryption, __client_accounts_create_treasury,
    __client_accounts_execute_pending, __client_accounts_finalize_execution,
    __client_accounts_pause_execution, __client_accounts_propose_confidential_transaction,
    __client_accounts_propose_confidential_vector_transaction, __client_accounts_propose_override,
    __client_accounts_propose_transaction, __client_accounts_register_dwallet,
    __client_accounts_request_policy_decryption, __cpi_client_accounts_cancel_pending,
    __cpi_client_accounts_collect_override_signature,
    __cpi_client_accounts_configure_confidential_guardrails,
    __cpi_client_accounts_configure_confidential_vector_guardrails,
    __cpi_client_accounts_configure_multisig, __cpi_client_accounts_configure_swarm,
    __cpi_client_accounts_confirm_policy_decryption, __cpi_client_accounts_create_treasury,
    __cpi_client_accounts_execute_pending, __cpi_client_accounts_finalize_execution,
    __cpi_client_accounts_pause_execution, __cpi_client_accounts_propose_confidential_transaction,
    __cpi_client_accounts_propose_confidential_vector_transaction,
    __cpi_client_accounts_propose_override, __cpi_client_accounts_propose_transaction,
    __cpi_client_accounts_register_dwallet, __cpi_client_accounts_request_policy_decryption,
};

declare_id!("7vtHJVz7CeWHFSumryc4WgtZCit5dG8dsaHns8qzDGC9");

#[program]
pub mod aura_core {
    use super::*;

    pub fn create_treasury(ctx: Context<CreateTreasury>, args: CreateTreasuryArgs) -> Result<()> {
        instructions::create_treasury::handler(ctx, args)
    }

    pub fn register_dwallet(
        ctx: Context<RegisterDwallet>,
        args: RegisterDwalletArgs,
    ) -> Result<()> {
        instructions::register_dwallet::handler(ctx, args)
    }

    pub fn configure_confidential_guardrails(
        ctx: Context<ConfigureConfidentialGuardrails>,
        now: i64,
    ) -> Result<()> {
        instructions::configure_confidential_guardrails::handler(ctx, now)
    }

    pub fn configure_confidential_vector_guardrails(
        ctx: Context<ConfigureConfidentialVectorGuardrails>,
        now: i64,
    ) -> Result<()> {
        instructions::configure_confidential_vector_guardrails::handler(ctx, now)
    }

    pub fn propose_transaction(
        ctx: Context<ProposeTransaction>,
        args: ProposeTransactionArgs,
    ) -> Result<()> {
        instructions::propose_transaction::handler(ctx, args)
    }

    pub fn propose_confidential_transaction(
        ctx: Context<ProposeConfidentialTransaction>,
        args: ProposeConfidentialTransactionArgs,
    ) -> Result<()> {
        instructions::propose_confidential_transaction::handler(ctx, args)
    }

    pub fn propose_confidential_vector_transaction(
        ctx: Context<ProposeConfidentialVectorTransaction>,
        args: ProposeConfidentialTransactionArgs,
    ) -> Result<()> {
        instructions::propose_confidential_vector_transaction::handler(ctx, args)
    }

    pub fn execute_pending(ctx: Context<ExecutePending>, now: i64) -> Result<()> {
        instructions::execute_pending::handler(ctx, now)
    }

    pub fn request_policy_decryption(
        ctx: Context<RequestPolicyDecryption>,
        now: i64,
    ) -> Result<()> {
        instructions::request_policy_decryption::handler(ctx, now)
    }

    pub fn confirm_policy_decryption(
        ctx: Context<ConfirmPolicyDecryption>,
        now: i64,
    ) -> Result<()> {
        instructions::confirm_policy_decryption::handler(ctx, now)
    }

    pub fn finalize_execution(ctx: Context<FinalizeExecution>, now: i64) -> Result<()> {
        instructions::finalize_execution::handler(ctx, now)
    }

    pub fn pause_execution(ctx: Context<PauseExecution>, paused: bool, now: i64) -> Result<()> {
        instructions::pause_execution::handler(ctx, paused, now)
    }

    pub fn cancel_pending(ctx: Context<CancelPending>, now: i64) -> Result<()> {
        instructions::cancel_pending::handler(ctx, now)
    }

    pub fn configure_multisig(
        ctx: Context<ConfigureMultisig>,
        args: ConfigureMultisigArgs,
    ) -> Result<()> {
        instructions::configure_multisig::handler(ctx, args)
    }

    pub fn propose_override(
        ctx: Context<ProposeOverride>,
        new_daily_limit_usd: u64,
        now: i64,
    ) -> Result<()> {
        instructions::propose_override::handler(ctx, new_daily_limit_usd, now)
    }

    pub fn collect_override_signature(
        ctx: Context<CollectOverrideSignature>,
        now: i64,
    ) -> Result<()> {
        instructions::collect_override_signature::handler(ctx, now)
    }

    pub fn configure_swarm(ctx: Context<ConfigureSwarm>, args: ConfigureSwarmArgs) -> Result<()> {
        instructions::configure_swarm::handler(ctx, args)
    }
}

pub use audit::{AuditEvent, AuditKind, AuditTrail};
pub use errors::TreasuryError;
pub use execution::{
    apply_confidential_policy_result, build_chain_message, confirm_pending_decryption,
    deny_pending_transaction, evaluate_batch_preview, expire_pending_transaction,
    finalize_signed_pending, generate_proposal_digest, hash_message, keccak_message_digest,
    keccak_message_digest_hex, mark_pending_decryption_request, mark_signature_requested,
    propose_confidential_transaction, propose_confidential_vector_transaction, propose_transaction,
};
pub use ext_cpi::{
    approve_message_via_cpi, build_message_approval_request, decode_digest_hex, decrypt_u64,
    decrypt_u64_lane, parse_ciphertext_account, parse_decryption_request_account,
    parse_message_approval_account, parse_runtime_pubkey, pending_signature_request_from_live,
    request_decryption_via_cpi, transfer_dwallet_via_cpi, transfer_future_sign_via_cpi,
    verify_decryption_request_digest, verify_message_approval, zero_message_metadata_digest_hex,
    AuraEncryptContext, DecryptionStatus, EncryptEvaluation, MessageApprovalRequest,
    MessageApprovalStatus, OnchainCiphertext, OnchainDecryptionRequest, OnchainMessageApproval,
    DWALLET_CPI_AUTHORITY_SEED, ENCRYPT_CPI_AUTHORITY_SEED, ENCRYPT_EVENT_AUTHORITY_SEED,
    ENCRYPT_FHE_UINT64, ENCRYPT_FHE_VECTOR_U64, MESSAGE_APPROVAL_SEED,
};
pub use governance::{EmergencyMultisig, OverrideProposal};
pub use program_accounts::*;
pub use program_error::{map_treasury_error, AuraCoreError};
pub use program_events::{emit_audit_events, emit_execution_event, emit_proposal_event};
pub use state::{
    AgentReputation, AgentSwarm, AgentTreasury, ConfidentialGuardrails, DWalletCurve,
    DWalletMessageApprovalLayout, DWalletReference, DeploymentCluster, ExecutionReceipt,
    PendingDecryptionRequest, PendingSignatureRequest, PendingTransaction, ProposalStatus,
    ProtocolDeployment, ProtocolFees, SignatureScheme, DWALLET_DEVNET_GRPC_ENDPOINT,
    DWALLET_DEVNET_PROGRAM_ID, ENCRYPT_DEVNET_GRPC_ENDPOINT, ENCRYPT_DEVNET_PROGRAM_ID,
};

#[cfg(test)]
pub mod tests;
