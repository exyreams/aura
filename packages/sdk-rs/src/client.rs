//! Main synchronous RPC client for the Rust SDK.

use std::sync::Arc;

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
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
    instructions,
    pda::{
        derive_dwallet_cpi_authority_pda, derive_encrypt_cpi_authority_pda,
        derive_encrypt_event_authority_pda, derive_treasury_pda,
    },
    types::{
        AgentTreasury, ConfigureMultisigArgs, ConfigureSwarmArgs, CreateTreasuryArgs,
        ProposeConfidentialTransactionArgs, ProposeTransactionArgs, RegisterDwalletArgs,
        TreasuryAccount,
    },
    SdkError, AURA_DEVNET_PROGRAM_ID,
};

/// Thin synchronous client for fetching accounts and submitting transactions.
pub struct AuraClient {
    pub(crate) rpc_client: Arc<RpcClient>,
    pub(crate) program_id: Pubkey,
    pub(crate) commitment: CommitmentConfig,
    pub(crate) payer: Option<Arc<Keypair>>,
}

impl AuraClient {
    fn with_program_id(&self, mut instruction: Instruction) -> Instruction {
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

    /// Builds a `create_treasury` instruction and returns the derived treasury PDA with it.
    pub fn create_treasury_instruction(
        &self,
        owner: Pubkey,
        args: CreateTreasuryArgs,
    ) -> (Pubkey, Instruction) {
        let (treasury, _) = self.derive_treasury_address(&owner, &args.agent_id);
        let accounts = aura_core::accounts::CreateTreasury {
            owner,
            treasury,
            system_program: SYSTEM_PROGRAM_ID,
        };
        (
            treasury,
            self.with_program_id(instructions::create_treasury(accounts, args)),
        )
    }

    /// Derives the treasury PDA, builds `create_treasury`, and submits it with `owner` as payer.
    pub fn create_treasury(
        &self,
        owner: &Keypair,
        args: CreateTreasuryArgs,
    ) -> Result<(Pubkey, Signature), SdkError> {
        let (treasury, instruction) = self.create_treasury_instruction(owner.pubkey(), args);
        let signature = self.send_instructions(owner, vec![instruction], &[])?;
        Ok((treasury, signature))
    }

    /// Builds `register_dwallet`.
    pub fn register_dwallet_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        args: RegisterDwalletArgs,
    ) -> Instruction {
        let accounts = aura_core::accounts::RegisterDwallet { owner, treasury };
        self.with_program_id(instructions::register_dwallet(accounts, args))
    }

    /// Submits `register_dwallet`.
    pub fn register_dwallet(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        args: RegisterDwalletArgs,
    ) -> Result<Signature, SdkError> {
        let instruction = self.register_dwallet_instruction(owner.pubkey(), treasury, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `configure_confidential_guardrails`.
    pub fn configure_confidential_guardrails_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        daily_limit_ciphertext: Pubkey,
        per_tx_limit_ciphertext: Pubkey,
        spent_today_ciphertext: Pubkey,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::ConfigureConfidentialGuardrails {
            owner,
            treasury,
            daily_limit_ciphertext,
            per_tx_limit_ciphertext,
            spent_today_ciphertext,
        };
        self.with_program_id(instructions::configure_confidential_guardrails(
            accounts, now,
        ))
    }

    /// Submits `configure_confidential_guardrails`.
    pub fn configure_confidential_guardrails(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        daily_limit_ciphertext: Pubkey,
        per_tx_limit_ciphertext: Pubkey,
        spent_today_ciphertext: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.configure_confidential_guardrails_instruction(
            owner.pubkey(),
            treasury,
            daily_limit_ciphertext,
            per_tx_limit_ciphertext,
            spent_today_ciphertext,
            now,
        );
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `configure_confidential_vector_guardrails`.
    pub fn configure_confidential_vector_guardrails_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        guardrail_vector_ciphertext: Pubkey,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::ConfigureConfidentialVectorGuardrails {
            owner,
            treasury,
            guardrail_vector_ciphertext,
        };
        self.with_program_id(instructions::configure_confidential_vector_guardrails(
            accounts, now,
        ))
    }

    /// Submits `configure_confidential_vector_guardrails`.
    pub fn configure_confidential_vector_guardrails(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        guardrail_vector_ciphertext: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.configure_confidential_vector_guardrails_instruction(
            owner.pubkey(),
            treasury,
            guardrail_vector_ciphertext,
            now,
        );
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `propose_transaction`.
    pub fn propose_transaction_instruction(
        &self,
        ai_authority: Pubkey,
        treasury: Pubkey,
        args: ProposeTransactionArgs,
    ) -> Instruction {
        let accounts = aura_core::accounts::ProposeTransaction {
            ai_authority,
            treasury,
            session_key_account: None,
            swarm_pool: None,
            address_list: None,
            compliance_oracle: None,
            parent_treasury: None,
            budget_envelope: None,
            exposure_group: None,
        };
        self.with_program_id(instructions::propose_transaction(accounts, args))
    }

    /// Submits `propose_transaction`.
    pub fn propose_transaction(
        &self,
        ai_authority: &Keypair,
        treasury: Pubkey,
        args: ProposeTransactionArgs,
    ) -> Result<Signature, SdkError> {
        let instruction =
            self.propose_transaction_instruction(ai_authority.pubkey(), treasury, args);
        self.send_instructions(ai_authority, vec![instruction], &[])
    }

    /// Builds `propose_confidential_transaction`.
    pub fn propose_confidential_transaction_instruction(
        &self,
        accounts: aura_core::accounts::ProposeConfidentialTransaction,
        args: ProposeConfidentialTransactionArgs,
    ) -> Instruction {
        self.with_program_id(instructions::propose_confidential_transaction(
            accounts, args,
        ))
    }

    /// Submits `propose_confidential_transaction`.
    pub fn propose_confidential_transaction(
        &self,
        ai_authority: &Keypair,
        accounts: aura_core::accounts::ProposeConfidentialTransaction,
        args: ProposeConfidentialTransactionArgs,
        extra_signers: &[&Keypair],
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(ai_authority, accounts.ai_authority, "ai_authority")?;
        let instruction = self.propose_confidential_transaction_instruction(accounts, args);
        self.send_instructions(ai_authority, vec![instruction], extra_signers)
    }

    /// Builds `propose_confidential_vector_transaction`.
    pub fn propose_confidential_vector_transaction_instruction(
        &self,
        accounts: aura_core::accounts::ProposeConfidentialVectorTransaction,
        args: ProposeConfidentialTransactionArgs,
    ) -> Instruction {
        self.with_program_id(instructions::propose_confidential_vector_transaction(
            accounts, args,
        ))
    }

    /// Submits `propose_confidential_vector_transaction`.
    pub fn propose_confidential_vector_transaction(
        &self,
        ai_authority: &Keypair,
        accounts: aura_core::accounts::ProposeConfidentialVectorTransaction,
        args: ProposeConfidentialTransactionArgs,
        extra_signers: &[&Keypair],
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(ai_authority, accounts.ai_authority, "ai_authority")?;
        let instruction = self.propose_confidential_vector_transaction_instruction(accounts, args);
        self.send_instructions(ai_authority, vec![instruction], extra_signers)
    }

    /// Builds `execute_pending`.
    pub fn execute_pending_instruction(
        &self,
        accounts: aura_core::accounts::ExecutePending,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::execute_pending(accounts, now))
    }

    /// Submits `execute_pending`.
    pub fn execute_pending(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::ExecutePending,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.execute_pending_instruction(accounts, now);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `request_policy_decryption`.
    pub fn request_policy_decryption_instruction(
        &self,
        accounts: aura_core::accounts::RequestPolicyDecryption,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::request_policy_decryption(accounts, now))
    }

    /// Submits `request_policy_decryption`.
    pub fn request_policy_decryption(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::RequestPolicyDecryption,
        now: i64,
        extra_signers: &[&Keypair],
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.request_policy_decryption_instruction(accounts, now);
        self.send_instructions(operator, vec![instruction], extra_signers)
    }

    /// Builds `confirm_policy_decryption`.
    pub fn confirm_policy_decryption_instruction(
        &self,
        operator: Pubkey,
        treasury: Pubkey,
        request_account: Pubkey,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::ConfirmPolicyDecryption {
            operator,
            treasury,
            request_account,
        };
        self.with_program_id(instructions::confirm_policy_decryption(accounts, now))
    }

    /// Submits `confirm_policy_decryption`.
    pub fn confirm_policy_decryption(
        &self,
        operator: &Keypair,
        treasury: Pubkey,
        request_account: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.confirm_policy_decryption_instruction(
            operator.pubkey(),
            treasury,
            request_account,
            now,
        );
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `finalize_execution`.
    pub fn finalize_execution_instruction(
        &self,
        accounts: aura_core::accounts::FinalizeExecution,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::finalize_execution(accounts, now))
    }

    /// Submits `finalize_execution`.
    pub fn finalize_execution(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::FinalizeExecution,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.finalize_execution_instruction(accounts, now);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `pause_execution`.
    pub fn pause_execution_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        paused: bool,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::PauseExecution { owner, treasury };
        self.with_program_id(instructions::pause_execution(accounts, paused, now))
    }

    /// Submits `pause_execution`.
    pub fn pause_execution(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        paused: bool,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.pause_execution_instruction(owner.pubkey(), treasury, paused, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `cancel_pending`.
    pub fn cancel_pending_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::CancelPending { owner, treasury };
        self.with_program_id(instructions::cancel_pending(accounts, now))
    }

    /// Submits `cancel_pending`.
    pub fn cancel_pending(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.cancel_pending_instruction(owner.pubkey(), treasury, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `configure_multisig`.
    pub fn configure_multisig_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        args: ConfigureMultisigArgs,
    ) -> Instruction {
        let accounts = aura_core::accounts::ConfigureMultisig { owner, treasury };
        self.with_program_id(instructions::configure_multisig(accounts, args))
    }

    /// Submits `configure_multisig`.
    pub fn configure_multisig(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        args: ConfigureMultisigArgs,
    ) -> Result<Signature, SdkError> {
        let instruction = self.configure_multisig_instruction(owner.pubkey(), treasury, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `propose_override`.
    pub fn propose_override_instruction(
        &self,
        guardian: Pubkey,
        treasury: Pubkey,
        new_daily_limit_usd: u64,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::ProposeOverride { guardian, treasury };
        self.with_program_id(instructions::propose_override(
            accounts,
            new_daily_limit_usd,
            now,
        ))
    }

    /// Submits `propose_override`.
    pub fn propose_override(
        &self,
        guardian: &Keypair,
        treasury: Pubkey,
        new_daily_limit_usd: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.propose_override_instruction(
            guardian.pubkey(),
            treasury,
            new_daily_limit_usd,
            now,
        );
        self.send_instructions(guardian, vec![instruction], &[])
    }

    /// Builds `collect_override_signature`.
    pub fn collect_override_signature_instruction(
        &self,
        guardian: Pubkey,
        treasury: Pubkey,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::CollectOverrideSignature { guardian, treasury };
        self.with_program_id(instructions::collect_override_signature(accounts, now))
    }

    /// Submits `collect_override_signature`.
    pub fn collect_override_signature(
        &self,
        guardian: &Keypair,
        treasury: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction =
            self.collect_override_signature_instruction(guardian.pubkey(), treasury, now);
        self.send_instructions(guardian, vec![instruction], &[])
    }

    /// Builds `configure_swarm`.
    pub fn configure_swarm_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        args: ConfigureSwarmArgs,
    ) -> Instruction {
        let accounts = aura_core::accounts::ConfigureSwarm { owner, treasury };
        self.with_program_id(instructions::configure_swarm(accounts, args))
    }

    /// Submits `configure_swarm`.
    pub fn configure_swarm(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        args: ConfigureSwarmArgs,
    ) -> Result<Signature, SdkError> {
        let instruction = self.configure_swarm_instruction(owner.pubkey(), treasury, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `simulate_policy`.
    pub fn simulate_policy_instruction(
        &self,
        accounts: aura_core::accounts::SimulatePolicy,
        args: aura_core::SimulatePolicyArgs,
    ) -> Instruction {
        self.with_program_id(instructions::simulate_policy(accounts, args))
    }

    /// Submits `simulate_policy`.
    pub fn simulate_policy(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::SimulatePolicy,
        args: aura_core::SimulatePolicyArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.simulate_policy_instruction(accounts, args);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `write_policy_receipt`.
    pub fn write_policy_receipt_instruction(
        &self,
        accounts: aura_core::accounts::WritePolicyReceipt,
        args: aura_core::WritePolicyReceiptArgs,
    ) -> Instruction {
        self.with_program_id(instructions::write_policy_receipt(accounts, args))
    }

    /// Submits `write_policy_receipt`.
    pub fn write_policy_receipt(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::WritePolicyReceipt,
        args: aura_core::WritePolicyReceiptArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.write_policy_receipt_instruction(accounts, args);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `apply_policy_preset`.
    pub fn apply_policy_preset_instruction(
        &self,
        accounts: aura_core::accounts::ApplyPolicyPreset,
        args: aura_core::ApplyPolicyPresetArgs,
    ) -> Instruction {
        self.with_program_id(instructions::apply_policy_preset(accounts, args))
    }

    /// Submits `apply_policy_preset`.
    pub fn apply_policy_preset(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ApplyPolicyPreset,
        args: aura_core::ApplyPolicyPresetArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.apply_policy_preset_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `configure_budget_envelope`.
    pub fn configure_budget_envelope_instruction(
        &self,
        accounts: aura_core::accounts::ConfigureBudgetEnvelope,
        args: aura_core::ConfigureBudgetEnvelopeArgs,
    ) -> Instruction {
        self.with_program_id(instructions::configure_budget_envelope(accounts, args))
    }

    /// Submits `configure_budget_envelope`.
    pub fn configure_budget_envelope(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ConfigureBudgetEnvelope,
        args: aura_core::ConfigureBudgetEnvelopeArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.configure_budget_envelope_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `init_exposure_group`.
    pub fn init_exposure_group_instruction(
        &self,
        accounts: aura_core::accounts::InitExposureGroup,
        args: aura_core::InitExposureGroupArgs,
    ) -> Instruction {
        self.with_program_id(instructions::init_exposure_group(accounts, args))
    }

    /// Submits `init_exposure_group`.
    pub fn init_exposure_group(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::InitExposureGroup,
        args: aura_core::InitExposureGroupArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.init_exposure_group_instruction(accounts, args);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `join_exposure_group`.
    pub fn join_exposure_group_instruction(
        &self,
        accounts: aura_core::accounts::JoinExposureGroup,
    ) -> Instruction {
        self.with_program_id(instructions::join_exposure_group(accounts))
    }

    /// Submits `join_exposure_group`.
    pub fn join_exposure_group(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::JoinExposureGroup,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.join_exposure_group_instruction(accounts);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `configure_approval_ladder`.
    pub fn configure_approval_ladder_instruction(
        &self,
        accounts: aura_core::accounts::ConfigureApprovalLadder,
        args: aura_core::ConfigureApprovalLadderArgs,
    ) -> Instruction {
        self.with_program_id(instructions::configure_approval_ladder(accounts, args))
    }

    /// Submits `configure_approval_ladder`.
    pub fn configure_approval_ladder(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ConfigureApprovalLadder,
        args: aura_core::ConfigureApprovalLadderArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.configure_approval_ladder_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `approve_pending_execution`.
    pub fn approve_pending_execution_instruction(
        &self,
        accounts: aura_core::accounts::ApprovePendingExecution,
        args: aura_core::ApprovePendingExecutionArgs,
    ) -> Instruction {
        self.with_program_id(instructions::approve_pending_execution(accounts, args))
    }

    /// Submits `approve_pending_execution`.
    pub fn approve_pending_execution(
        &self,
        approver: &Keypair,
        accounts: aura_core::accounts::ApprovePendingExecution,
        args: aura_core::ApprovePendingExecutionArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(approver, accounts.approver, "approver")?;
        let instruction = self.approve_pending_execution_instruction(accounts, args);
        self.send_instructions(approver, vec![instruction], &[])
    }

    /// Builds `set_scoped_pause`.
    pub fn set_scoped_pause_instruction(
        &self,
        accounts: aura_core::accounts::SetScopedPause,
        args: aura_core::SetScopedPauseArgs,
    ) -> Instruction {
        self.with_program_id(instructions::set_scoped_pause(accounts, args))
    }

    /// Submits `set_scoped_pause`.
    pub fn set_scoped_pause(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::SetScopedPause,
        args: aura_core::SetScopedPauseArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.set_scoped_pause_instruction(accounts, args);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `grant_operator_role`.
    pub fn grant_operator_role_instruction(
        &self,
        accounts: aura_core::accounts::GrantOperatorRole,
        args: aura_core::GrantOperatorRoleArgs,
    ) -> Instruction {
        self.with_program_id(instructions::grant_operator_role(accounts, args))
    }

    /// Submits `grant_operator_role`.
    pub fn grant_operator_role(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::GrantOperatorRole,
        args: aura_core::GrantOperatorRoleArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.grant_operator_role_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `revoke_operator_role`.
    pub fn revoke_operator_role_instruction(
        &self,
        accounts: aura_core::accounts::RevokeOperatorRole,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::revoke_operator_role(accounts, now))
    }

    /// Submits `revoke_operator_role`.
    pub fn revoke_operator_role(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::RevokeOperatorRole,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.revoke_operator_role_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `init_external_liveness`.
    pub fn init_external_liveness_instruction(
        &self,
        accounts: aura_core::accounts::InitExternalLiveness,
        args: aura_core::InitExternalLivenessArgs,
    ) -> Instruction {
        self.with_program_id(instructions::init_external_liveness(accounts, args))
    }

    /// Submits `init_external_liveness`.
    pub fn init_external_liveness(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitExternalLiveness,
        args: aura_core::InitExternalLivenessArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_external_liveness_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `configure_liveness_guardrails`.
    pub fn configure_liveness_guardrails_instruction(
        &self,
        accounts: aura_core::accounts::ConfigureLivenessGuardrails,
        args: aura_core::ConfigureLivenessGuardrailsArgs,
    ) -> Instruction {
        self.with_program_id(instructions::configure_liveness_guardrails(accounts, args))
    }

    /// Submits `configure_liveness_guardrails`.
    pub fn configure_liveness_guardrails(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ConfigureLivenessGuardrails,
        args: aura_core::ConfigureLivenessGuardrailsArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.configure_liveness_guardrails_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `refresh_external_liveness`.
    pub fn refresh_external_liveness_instruction(
        &self,
        accounts: aura_core::accounts::RefreshExternalLiveness,
        args: aura_core::RefreshExternalLivenessArgs,
    ) -> Instruction {
        self.with_program_id(instructions::refresh_external_liveness(accounts, args))
    }

    /// Submits `refresh_external_liveness`.
    pub fn refresh_external_liveness(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::RefreshExternalLiveness,
        args: aura_core::RefreshExternalLivenessArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.refresh_external_liveness_instruction(accounts, args);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `attest_policy`.
    pub fn attest_policy_instruction(
        &self,
        accounts: aura_core::accounts::AttestPolicy,
        args: aura_core::AttestPolicyArgs,
    ) -> Instruction {
        self.with_program_id(instructions::attest_policy(accounts, args))
    }

    /// Submits `attest_policy`.
    pub fn attest_policy(
        &self,
        payer: &Keypair,
        attester: &Keypair,
        accounts: aura_core::accounts::AttestPolicy,
        args: aura_core::AttestPolicyArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        ensure_signer_matches(attester, accounts.attester, "attester")?;
        let instruction = self.attest_policy_instruction(accounts, args);
        let extra_signers = if payer.pubkey() == attester.pubkey() {
            Vec::new()
        } else {
            vec![attester]
        };
        self.send_instructions(payer, vec![instruction], &extra_signers)
    }

    /// Builds `propose_batch`.
    pub fn propose_batch_instruction(
        &self,
        accounts: aura_core::accounts::ProposeBatch,
        args: aura_core::ProposeBatchArgs,
    ) -> Instruction {
        self.with_program_id(instructions::propose_batch(accounts, args))
    }

    /// Submits `propose_batch`.
    pub fn propose_batch(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::ProposeBatch,
        args: aura_core::ProposeBatchArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.propose_batch_instruction(accounts, args);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `check_invariants`.
    pub fn check_invariants_instruction(
        &self,
        accounts: aura_core::accounts::CheckInvariants,
        args: aura_core::CheckInvariantsArgs,
    ) -> Instruction {
        self.with_program_id(instructions::check_invariants(accounts, args))
    }

    /// Submits `check_invariants`.
    pub fn check_invariants(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::CheckInvariants,
        args: aura_core::CheckInvariantsArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.check_invariants_instruction(accounts, args);
        self.send_instructions(payer, vec![instruction], &[])
    }
}

fn ensure_signer_matches(
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
}
