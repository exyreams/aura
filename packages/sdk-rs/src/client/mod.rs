//! Synchronous RPC client for the AURA Rust SDK.
//!
//! [`AuraClient`] wraps account fetching, PDA derivation, and transaction
//! submission. Per-instruction builders and send-helpers are implemented across
//! category submodules that mirror [`crate::instructions`]:
//!
//! - [`core`] — treasury, agent, trust, recovery, analytics
//! - [`flows`] — proposals, batches, conditional txs, scheduled intents, execution
//! - [`wallets`] — dWallet controls/balances/transfers, chain profiles
//! - [`admin`] — governance, rotations, sessions, operator roles, lifecycle
//! - [`controls`] — policy controls, budgets, operational surface, address lists, swarm
//! - [`economics`] — fees, billing, protocol config
//!
//! Every instruction exposes a `*_instruction` builder (returns an
//! [`Instruction`]) and a send-helper that signs and submits in one call. For
//! instructions not given a dedicated helper, pair any builder from
//! [`crate::instructions`] with [`AuraClient::execute`].

use std::sync::Arc;

use solana_client::rpc_client::RpcClient;
use solana_commitment_config::CommitmentConfig;
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signature, Signer},
    transaction::Transaction,
};

use crate::{
    accounts::{decode_treasury_account, decode_treasury_domain},
    constants::DEVNET_RPC_URL,
    pda::{
        derive_dwallet_cpi_authority_pda, derive_encrypt_cpi_authority_pda,
        derive_encrypt_event_authority_pda, derive_treasury_pda,
    },
    types::{AgentTreasury, TreasuryAccount},
    SdkError, AURA_DEVNET_PROGRAM_ID,
};

mod admin;
mod controls;
mod core;
mod economics;
mod flows;
mod wallets;

#[cfg(test)]
mod surface;

/// Thin synchronous client for fetching accounts and submitting transactions.
pub struct AuraClient {
    pub(crate) rpc_client: Arc<RpcClient>,
    pub(crate) program_id: Pubkey,
    pub(crate) commitment: CommitmentConfig,
    pub(crate) payer: Option<Arc<Keypair>>,
}

impl AuraClient {
    /// Rewrites a builder-produced instruction to the configured program ID.
    pub(crate) fn with_program_id(&self, mut instruction: Instruction) -> Instruction {
        instruction.program_id = self.program_id;
        instruction
    }

    /// Creates a devnet client with confirmed commitment.
    pub fn new(rpc_url: impl Into<String>) -> Self {
        Self::with_options(
            rpc_url,
            AURA_DEVNET_PROGRAM_ID,
            CommitmentConfig::confirmed(),
        )
    }

    /// Creates a client with a custom program ID and commitment level.
    pub fn with_options(
        rpc_url: impl Into<String>,
        program_id: Pubkey,
        commitment: CommitmentConfig,
    ) -> Self {
        let rpc_client = Arc::new(RpcClient::new_with_commitment(rpc_url.into(), commitment));
        Self {
            rpc_client,
            program_id,
            commitment,
            payer: None,
        }
    }

    /// Creates a devnet client pointed at the public devnet RPC.
    pub fn devnet() -> Self {
        Self::new(DEVNET_RPC_URL)
    }

    /// Creates a client with a default payer for transaction submission.
    pub fn with_payer(
        rpc_url: impl Into<String>,
        program_id: Pubkey,
        commitment: CommitmentConfig,
        payer: Keypair,
    ) -> Self {
        let rpc_client = Arc::new(RpcClient::new_with_commitment(rpc_url.into(), commitment));
        Self {
            rpc_client,
            program_id,
            commitment,
            payer: Some(Arc::new(payer)),
        }
    }

    /// Returns the configured program ID.
    pub fn program_id(&self) -> Pubkey {
        self.program_id
    }

    /// Returns the underlying RPC client.
    pub fn rpc_client(&self) -> &RpcClient {
        &self.rpc_client
    }

    /// Returns the configured commitment level.
    pub fn commitment(&self) -> CommitmentConfig {
        self.commitment
    }

    /// Derives the treasury PDA for an owner and agent ID.
    pub fn derive_treasury_address(&self, owner: &Pubkey, agent_id: &str) -> (Pubkey, u8) {
        derive_treasury_pda(owner, agent_id, &self.program_id)
    }

    /// Derives the global dWallet CPI authority PDA.
    pub fn derive_dwallet_cpi_authority(&self) -> (Pubkey, u8) {
        derive_dwallet_cpi_authority_pda(&self.program_id)
    }

    /// Derives the global Encrypt CPI authority PDA.
    pub fn derive_encrypt_cpi_authority(&self) -> (Pubkey, u8) {
        derive_encrypt_cpi_authority_pda(&self.program_id)
    }

    /// Derives the Encrypt event authority PDA for a specific Encrypt program.
    pub fn derive_encrypt_event_authority(&self, encrypt_program_id: &Pubkey) -> (Pubkey, u8) {
        derive_encrypt_event_authority_pda(encrypt_program_id)
    }

    /// Fetches raw account data for any account.
    pub fn get_account_data(&self, address: &Pubkey) -> Result<Vec<u8>, SdkError> {
        let account = self
            .rpc_client
            .get_account_with_commitment(address, self.commitment)?
            .value
            .ok_or(SdkError::AccountNotFound(*address))?;
        Ok(account.data)
    }

    /// Fetches and decodes the Anchor treasury record.
    pub fn get_treasury_account(&self, treasury: &Pubkey) -> Result<TreasuryAccount, SdkError> {
        let data = self.get_account_data(treasury)?;
        decode_treasury_account(&data)
    }

    /// Fetches and converts a treasury into the rich `AgentTreasury` domain model.
    pub fn get_treasury(&self, treasury: &Pubkey) -> Result<AgentTreasury, SdkError> {
        let data = self.get_account_data(treasury)?;
        decode_treasury_domain(&data)
    }

    /// Derives a treasury PDA and fetches the corresponding domain object.
    pub fn get_treasury_for_owner(
        &self,
        owner: &Pubkey,
        agent_id: &str,
    ) -> Result<(Pubkey, AgentTreasury), SdkError> {
        let (treasury, _) = self.derive_treasury_address(owner, agent_id);
        let state = self.get_treasury(&treasury)?;
        Ok((treasury, state))
    }

    /// Builds, signs, and confirms a transaction with an explicit payer.
    pub fn send_instructions(
        &self,
        payer: &Keypair,
        instructions: Vec<Instruction>,
        extra_signers: &[&Keypair],
    ) -> Result<Signature, SdkError> {
        let recent_blockhash = self.rpc_client.get_latest_blockhash()?;
        let mut signers = Vec::with_capacity(1 + extra_signers.len());
        signers.push(payer);
        signers.extend_from_slice(extra_signers);
        let transaction = Transaction::new_signed_with_payer(
            &instructions,
            Some(&payer.pubkey()),
            &signers,
            recent_blockhash,
        );
        Ok(self.rpc_client.send_and_confirm_transaction(&transaction)?)
    }

    /// Builds, signs, and confirms a transaction using the configured default payer.
    pub fn send_with_default_payer(
        &self,
        instructions: Vec<Instruction>,
        extra_signers: &[&Keypair],
    ) -> Result<Signature, SdkError> {
        let payer = self.payer.as_ref().ok_or(SdkError::MissingDefaultPayer)?;
        self.send_instructions(payer.as_ref(), instructions, extra_signers)
    }

    /// Submits a single builder-produced instruction, rewriting it to the
    /// client's configured program ID first.
    ///
    /// This is the type-safe, uniform path for the entire 161-instruction
    /// program surface: pair any builder from [`crate::instructions`] with this
    /// method. The builder enforces the correct account context and argument
    /// types at compile time.
    pub fn execute(
        &self,
        payer: &Keypair,
        instruction: Instruction,
        extra_signers: &[&Keypair],
    ) -> Result<Signature, SdkError> {
        self.send_instructions(
            payer,
            vec![self.with_program_id(instruction)],
            extra_signers,
        )
    }

    /// Submits several builder-produced instructions atomically in one
    /// transaction, rewriting each to the client's configured program ID.
    pub fn execute_many(
        &self,
        payer: &Keypair,
        instructions: Vec<Instruction>,
        extra_signers: &[&Keypair],
    ) -> Result<Signature, SdkError> {
        let instructions = instructions
            .into_iter()
            .map(|instruction| self.with_program_id(instruction))
            .collect();
        self.send_instructions(payer, instructions, extra_signers)
    }

    /// Like [`Self::execute`] but signs with the configured default payer.
    pub fn execute_with_default_payer(
        &self,
        instruction: Instruction,
        extra_signers: &[&Keypair],
    ) -> Result<Signature, SdkError> {
        let payer = self.payer.as_ref().ok_or(SdkError::MissingDefaultPayer)?;
        self.execute(payer.as_ref(), instruction, extra_signers)
    }
}

/// Validates that a provided signer matches the account it is expected to sign
/// for, returning a clear error before any RPC round-trip.
pub(crate) fn ensure_signer_matches(
    signer: &Keypair,
    expected_account: Pubkey,
    role: &str,
) -> Result<(), SdkError> {
    if signer.pubkey() != expected_account {
        return Err(SdkError::InvalidParameter(format!(
            "signer for {role} must match account {expected_account}, got {}",
            signer.pubkey()
        )));
    }
    Ok(())
}

impl std::fmt::Debug for AuraClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("AuraClient")
            .field("program_id", &self.program_id)
            .field("commitment", &self.commitment)
            .field("has_default_payer", &self.payer.is_some())
            .finish()
    }
}

#[cfg(test)]
mod tests {
    use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;

    use super::*;
    use crate::types::CreateTreasuryArgs;

    #[test]
    fn create_treasury_instruction_honors_custom_program_id() {
        let program_id = Pubkey::new_unique();
        let client = AuraClient::with_options(
            "http://127.0.0.1:8899",
            program_id,
            CommitmentConfig::confirmed(),
        );
        let owner = Pubkey::new_unique();
        let (_treasury, instruction) = client.create_treasury_instruction(
            owner,
            CreateTreasuryArgs {
                agent_id: "agent-1".to_string(),
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

        assert_eq!(instruction.program_id, program_id);
    }

    #[test]
    fn execute_pending_rejects_mismatched_operator_before_rpc() {
        let client = AuraClient::devnet();
        let signer = Keypair::new();
        let accounts = aura_core::accounts::ExecutePending {
            operator: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
            message_approval: None,
            dwallet: None,
            caller_program: Pubkey::new_unique(),
            cpi_authority: None,
            dwallet_program: None,
            dwallet_coordinator: None,
            external_liveness: None,
            dwallet_state: None,
            system_program: SYSTEM_PROGRAM_ID,
        };

        let error = client.execute_pending(&signer, accounts, 1).unwrap_err();
        assert!(matches!(error, SdkError::InvalidParameter(_)));
    }

    #[test]
    fn policy_control_send_helpers_reject_mismatched_signers_before_rpc() {
        let client = AuraClient::devnet();
        let signer = Keypair::new();
        let accounts = aura_core::accounts::ApprovePendingExecution {
            approver: Pubkey::new_unique(),
            treasury: Pubkey::new_unique(),
        };
        let args = aura_core::ApprovePendingExecutionArgs {
            proposal_id: 1,
            approval_level: 1,
            now: 10,
        };

        let error = client
            .approve_pending_execution(&signer, accounts, args)
            .unwrap_err();
        assert!(matches!(error, SdkError::InvalidParameter(_)));
    }

    #[test]
    fn guardian_rotation_instruction_uses_guardian_account_set() {
        let program_id = Pubkey::new_unique();
        let client = AuraClient::with_options(
            "http://127.0.0.1:8899",
            program_id,
            CommitmentConfig::confirmed(),
        );
        let guardian = Pubkey::new_unique();
        let treasury = Pubkey::new_unique();

        let instruction = client.execute_guardian_rotation_instruction(guardian, treasury, 1);

        assert_eq!(instruction.program_id, program_id);
        assert_eq!(instruction.accounts[0].pubkey, guardian);
        assert_eq!(instruction.accounts[1].pubkey, treasury);
    }
}
