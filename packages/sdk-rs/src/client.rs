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
            self.with_program_id(instructions::treasury::create_treasury(accounts, args)),
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
        self.with_program_id(instructions::dwallet::register_dwallet(accounts, args))
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
        self.with_program_id(
            instructions::confidential::configure_confidential_guardrails(accounts, now),
        )
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
        self.with_program_id(instructions::execution::propose_transaction(accounts, args))
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
        self.with_program_id(
            instructions::confidential::propose_confidential_transaction(accounts, args),
        )
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

    /// Builds `execute_pending`.
    pub fn execute_pending_instruction(
        &self,
        accounts: aura_core::accounts::ExecutePending,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::execution::execute_pending(accounts, now))
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
        self.with_program_id(instructions::confidential::request_policy_decryption(
            accounts, now,
        ))
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
        self.with_program_id(instructions::confidential::confirm_policy_decryption(
            accounts, now,
        ))
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
        self.with_program_id(instructions::execution::finalize_execution(accounts, now))
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
        self.with_program_id(instructions::treasury::pause_execution(
            accounts, paused, now,
        ))
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
        self.with_program_id(instructions::treasury::cancel_pending(accounts, now))
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
        self.with_program_id(instructions::governance::configure_multisig(accounts, args))
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
        self.with_program_id(instructions::governance::propose_override(
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
        self.with_program_id(instructions::governance::collect_override_signature(
            accounts, now,
        ))
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
        self.with_program_id(instructions::treasury::configure_swarm(accounts, args))
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
        self.with_program_id(instructions::policy::simulate_policy(accounts, args))
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
        self.with_program_id(instructions::policy::write_policy_receipt(accounts, args))
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
        self.with_program_id(instructions::policy::apply_policy_preset(accounts, args))
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
        self.with_program_id(instructions::budget::configure_budget_envelope(
            accounts, args,
        ))
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
        self.with_program_id(instructions::budget::init_exposure_group(accounts, args))
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
        self.with_program_id(instructions::budget::join_exposure_group(accounts))
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
        self.with_program_id(instructions::budget::configure_approval_ladder(
            accounts, args,
        ))
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
        self.with_program_id(instructions::execution::approve_pending_execution(
            accounts, args,
        ))
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
        self.with_program_id(instructions::operational::set_scoped_pause(accounts, args))
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
        self.with_program_id(instructions::lifecycle::grant_operator_role(accounts, args))
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
        self.with_program_id(instructions::lifecycle::revoke_operator_role(accounts, now))
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
        self.with_program_id(instructions::operational::init_external_liveness(
            accounts, args,
        ))
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
        self.with_program_id(instructions::budget::configure_liveness_guardrails(
            accounts, args,
        ))
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
        self.with_program_id(instructions::operational::refresh_external_liveness(
            accounts, args,
        ))
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
        self.with_program_id(instructions::policy::attest_policy(accounts, args))
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
        self.with_program_id(instructions::batch::propose_batch(accounts, args))
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
        self.with_program_id(instructions::policy::check_invariants(accounts, args))
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

    /// Builds `propose_ai_rotation`.
    pub fn propose_ai_rotation_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        new_ai_authority: Pubkey,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::OwnerTreasury { owner, treasury };
        self.with_program_id(instructions::governance::propose_ai_rotation(
            accounts,
            new_ai_authority,
            now,
        ))
    }

    /// Submits `propose_ai_rotation`.
    pub fn propose_ai_rotation(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        new_ai_authority: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction =
            self.propose_ai_rotation_instruction(owner.pubkey(), treasury, new_ai_authority, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `execute_ai_rotation`.
    pub fn execute_ai_rotation_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::OwnerTreasury { owner, treasury };
        self.with_program_id(instructions::governance::execute_ai_rotation(accounts, now))
    }

    /// Submits `execute_ai_rotation`.
    pub fn execute_ai_rotation(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.execute_ai_rotation_instruction(owner.pubkey(), treasury, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `cancel_ai_rotation`.
    pub fn cancel_ai_rotation_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::OwnerTreasury { owner, treasury };
        self.with_program_id(instructions::governance::cancel_ai_rotation(accounts, now))
    }

    /// Submits `cancel_ai_rotation`.
    pub fn cancel_ai_rotation(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.cancel_ai_rotation_instruction(owner.pubkey(), treasury, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `propose_guardian_rotation`.
    pub fn propose_guardian_rotation_instruction(
        &self,
        guardian: Pubkey,
        treasury: Pubkey,
        action: u8,
        target_guardian: Pubkey,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::VetoConfigChange { guardian, treasury };
        self.with_program_id(instructions::governance::propose_guardian_rotation(
            accounts,
            action,
            target_guardian,
            now,
        ))
    }

    /// Submits `propose_guardian_rotation`.
    pub fn propose_guardian_rotation(
        &self,
        guardian: &Keypair,
        treasury: Pubkey,
        action: u8,
        target_guardian: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.propose_guardian_rotation_instruction(
            guardian.pubkey(),
            treasury,
            action,
            target_guardian,
            now,
        );
        self.send_instructions(guardian, vec![instruction], &[])
    }

    /// Builds `execute_guardian_rotation`.
    pub fn execute_guardian_rotation_instruction(
        &self,
        guardian: Pubkey,
        treasury: Pubkey,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::VetoConfigChange { guardian, treasury };
        self.with_program_id(instructions::governance::execute_guardian_rotation(
            accounts, now,
        ))
    }

    /// Submits `execute_guardian_rotation`.
    pub fn execute_guardian_rotation(
        &self,
        guardian: &Keypair,
        treasury: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction =
            self.execute_guardian_rotation_instruction(guardian.pubkey(), treasury, now);
        self.send_instructions(guardian, vec![instruction], &[])
    }

    /// Builds `propose_config_change`.
    pub fn propose_config_change_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        change_id: u64,
        new_policy_config: aura_core::PolicyConfigRecord,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::OwnerTreasury { owner, treasury };
        self.with_program_id(instructions::governance::propose_config_change(
            accounts,
            change_id,
            new_policy_config,
            now,
        ))
    }

    /// Submits `propose_config_change`.
    pub fn propose_config_change(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        change_id: u64,
        new_policy_config: aura_core::PolicyConfigRecord,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.propose_config_change_instruction(
            owner.pubkey(),
            treasury,
            change_id,
            new_policy_config,
            now,
        );
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `execute_config_change`.
    pub fn execute_config_change_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        change_id: u64,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::OwnerTreasury { owner, treasury };
        self.with_program_id(instructions::governance::execute_config_change(
            accounts, change_id, now,
        ))
    }

    /// Submits `execute_config_change`.
    pub fn execute_config_change(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        change_id: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction =
            self.execute_config_change_instruction(owner.pubkey(), treasury, change_id, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `veto_config_change`.
    pub fn veto_config_change_instruction(
        &self,
        guardian: Pubkey,
        treasury: Pubkey,
        change_id: u64,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::VetoConfigChange { guardian, treasury };
        self.with_program_id(instructions::governance::veto_config_change(
            accounts, change_id, now,
        ))
    }

    /// Submits `veto_config_change`.
    pub fn veto_config_change(
        &self,
        guardian: &Keypair,
        treasury: Pubkey,
        change_id: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction =
            self.veto_config_change_instruction(guardian.pubkey(), treasury, change_id, now);
        self.send_instructions(guardian, vec![instruction], &[])
    }

    /// Builds `emergency_shutdown`.
    pub fn emergency_shutdown_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        recovery_pubkey: Pubkey,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::OwnerTreasury { owner, treasury };
        self.with_program_id(instructions::governance::emergency_shutdown(
            accounts,
            recovery_pubkey,
            now,
        ))
    }

    /// Submits `emergency_shutdown`.
    pub fn emergency_shutdown(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        recovery_pubkey: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction =
            self.emergency_shutdown_instruction(owner.pubkey(), treasury, recovery_pubkey, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `transition_agent_state`.
    pub fn transition_agent_state_instruction(
        &self,
        owner: Pubkey,
        treasury: Pubkey,
        target_state: u8,
        now: i64,
    ) -> Instruction {
        let accounts = aura_core::accounts::OwnerTreasury { owner, treasury };
        self.with_program_id(instructions::lifecycle::transition_agent_state(
            accounts,
            target_state,
            now,
        ))
    }

    /// Submits `transition_agent_state`.
    pub fn transition_agent_state(
        &self,
        owner: &Keypair,
        treasury: Pubkey,
        target_state: u8,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction =
            self.transition_agent_state_instruction(owner.pubkey(), treasury, target_state, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `migrate_treasury`.
    pub fn migrate_treasury_instruction(
        &self,
        accounts: aura_core::accounts::MigrateTreasury,
    ) -> Instruction {
        self.with_program_id(instructions::lifecycle::migrate_treasury(accounts))
    }

    /// Submits `migrate_treasury`.
    pub fn migrate_treasury(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::MigrateTreasury,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.migrate_treasury_instruction(accounts);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `issue_session_key`.
    pub fn issue_session_key_instruction(
        &self,
        accounts: aura_core::accounts::IssueSessionKey,
        args: aura_core::IssueSessionKeyArgs,
    ) -> Instruction {
        self.with_program_id(instructions::lifecycle::issue_session_key(accounts, args))
    }

    /// Submits `issue_session_key`.
    pub fn issue_session_key(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::IssueSessionKey,
        args: aura_core::IssueSessionKeyArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.issue_session_key_instruction(accounts, args);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `revoke_session_key`.
    pub fn revoke_session_key_instruction(
        &self,
        accounts: aura_core::accounts::RevokeSessionKey,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::lifecycle::revoke_session_key(accounts, now))
    }

    /// Submits `revoke_session_key`.
    pub fn revoke_session_key(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::RevokeSessionKey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.revoke_session_key_instruction(accounts, now);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `close_session_key`.
    pub fn close_session_key_instruction(
        &self,
        accounts: aura_core::accounts::CloseSessionKey,
    ) -> Instruction {
        self.with_program_id(instructions::lifecycle::close_session_key(accounts))
    }

    /// Submits `close_session_key`.
    pub fn close_session_key(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::CloseSessionKey,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.close_session_key_instruction(accounts);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `trigger_dead_mans_switch`.
    pub fn trigger_dead_mans_switch_instruction(&self, treasury: Pubkey, now: i64) -> Instruction {
        let accounts = aura_core::accounts::TriggerDeadMansSwitch { treasury };
        self.with_program_id(instructions::lifecycle::trigger_dead_mans_switch(
            accounts, now,
        ))
    }

    /// Submits `trigger_dead_mans_switch`.
    pub fn trigger_dead_mans_switch(
        &self,
        payer: &Keypair,
        treasury: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.trigger_dead_mans_switch_instruction(treasury, now);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `check_policy_cpi`.
    pub fn check_policy_cpi_instruction(
        &self,
        accounts: aura_core::accounts::CheckPolicyCpi,
        args: aura_core::CheckPolicyCpiArgs,
    ) -> Instruction {
        self.with_program_id(instructions::policy::check_policy_cpi(accounts, args))
    }

    /// Submits `check_policy_cpi`.
    pub fn check_policy_cpi(
        &self,
        fee_payer: &Keypair,
        accounts: aura_core::accounts::CheckPolicyCpi,
        args: aura_core::CheckPolicyCpiArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(fee_payer, accounts.fee_payer, "fee_payer")?;
        let instruction = self.check_policy_cpi_instruction(accounts, args);
        self.send_instructions(fee_payer, vec![instruction], &[])
    }

    /// Builds `init_health_score`.
    pub fn init_health_score_instruction(
        &self,
        accounts: aura_core::accounts::InitHealthScore,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::operational::init_health_score(accounts, now))
    }

    /// Submits `init_health_score`.
    pub fn init_health_score(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitHealthScore,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_health_score_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `refresh_health_score`.
    pub fn refresh_health_score_instruction(
        &self,
        accounts: aura_core::accounts::UpdateHealthScore,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::operational::refresh_health_score(
            accounts, now,
        ))
    }

    /// Submits `refresh_health_score`.
    pub fn refresh_health_score(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::UpdateHealthScore,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.refresh_health_score_instruction(accounts, now);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `close_health_score`.
    pub fn close_health_score_instruction(
        &self,
        accounts: aura_core::accounts::CloseHealthScore,
    ) -> Instruction {
        self.with_program_id(instructions::operational::close_health_score(accounts))
    }

    /// Submits `close_health_score`.
    pub fn close_health_score(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseHealthScore,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_health_score_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `take_snapshot`.
    pub fn take_snapshot_instruction(
        &self,
        accounts: aura_core::accounts::TakeSnapshot,
        snapshot_index: u32,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::operational::take_snapshot(
            accounts,
            snapshot_index,
            now,
        ))
    }

    /// Submits `take_snapshot`.
    pub fn take_snapshot(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::TakeSnapshot,
        snapshot_index: u32,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.take_snapshot_instruction(accounts, snapshot_index, now);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `record_policy_snapshot`.
    pub fn record_policy_snapshot_instruction(
        &self,
        accounts: aura_core::accounts::InitPolicyHistory,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::operational::record_policy_snapshot(
            accounts, now,
        ))
    }

    /// Submits `record_policy_snapshot`.
    pub fn record_policy_snapshot(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitPolicyHistory,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.record_policy_snapshot_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `close_snapshot`.
    pub fn close_snapshot_instruction(
        &self,
        accounts: aura_core::accounts::CloseSnapshot,
    ) -> Instruction {
        self.with_program_id(instructions::operational::close_snapshot(accounts))
    }

    /// Submits `close_snapshot`.
    pub fn close_snapshot(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseSnapshot,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_snapshot_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `init_activity_log`.
    pub fn init_activity_log_instruction(
        &self,
        accounts: aura_core::accounts::InitActivityLog,
    ) -> Instruction {
        self.with_program_id(instructions::operational::init_activity_log(accounts))
    }

    /// Submits `init_activity_log`.
    pub fn init_activity_log(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitActivityLog,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_activity_log_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `close_activity_log`.
    pub fn close_activity_log_instruction(
        &self,
        accounts: aura_core::accounts::CloseActivityLog,
    ) -> Instruction {
        self.with_program_id(instructions::operational::close_activity_log(accounts))
    }

    /// Submits `close_activity_log`.
    pub fn close_activity_log(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseActivityLog,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_activity_log_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `init_swarm_pool`.
    pub fn init_swarm_pool_instruction(
        &self,
        accounts: aura_core::accounts::InitSwarmPool,
        args: aura_core::InitSwarmPoolArgs,
    ) -> Instruction {
        self.with_program_id(instructions::swarm::init_swarm_pool(accounts, args))
    }

    /// Submits `init_swarm_pool`.
    pub fn init_swarm_pool(
        &self,
        creator: &Keypair,
        accounts: aura_core::accounts::InitSwarmPool,
        args: aura_core::InitSwarmPoolArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(creator, accounts.creator, "creator")?;
        let instruction = self.init_swarm_pool_instruction(accounts, args);
        self.send_instructions(creator, vec![instruction], &[])
    }

    /// Builds `join_swarm`.
    pub fn join_swarm_instruction(
        &self,
        accounts: aura_core::accounts::JoinSwarm,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::swarm::join_swarm(accounts, now))
    }

    /// Submits `join_swarm`.
    pub fn join_swarm(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::JoinSwarm,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.join_swarm_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `init_fee_vault`.
    pub fn init_fee_vault_instruction(
        &self,
        accounts: aura_core::accounts::InitFeeVault,
        protocol_fee_recipient: Pubkey,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::fees::init_fee_vault(
            accounts,
            protocol_fee_recipient,
            now,
        ))
    }

    /// Submits `init_fee_vault`.
    pub fn init_fee_vault(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitFeeVault,
        protocol_fee_recipient: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_fee_vault_instruction(accounts, protocol_fee_recipient, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `collect_fees`.
    pub fn collect_fees_instruction(
        &self,
        accounts: aura_core::accounts::CollectFees,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::fees::collect_fees(accounts, now))
    }

    /// Submits `collect_fees`.
    pub fn collect_fees(
        &self,
        protocol_authority: &Keypair,
        accounts: aura_core::accounts::CollectFees,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(
            protocol_authority,
            accounts.protocol_authority,
            "protocol_authority",
        )?;
        let instruction = self.collect_fees_instruction(accounts, now);
        self.send_instructions(protocol_authority, vec![instruction], &[])
    }

    /// Builds `close_fee_vault`.
    pub fn close_fee_vault_instruction(
        &self,
        accounts: aura_core::accounts::CloseFeeVault,
    ) -> Instruction {
        self.with_program_id(instructions::fees::close_fee_vault(accounts))
    }

    /// Submits `close_fee_vault`.
    pub fn close_fee_vault(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseFeeVault,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_fee_vault_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `init_address_list`.
    pub fn init_address_list_instruction(
        &self,
        accounts: aura_core::accounts::InitAddressList,
        mode: u8,
        chain: u8,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::address_lists::init_address_list(
            accounts, mode, chain, now,
        ))
    }

    /// Submits `init_address_list`.
    pub fn init_address_list(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitAddressList,
        mode: u8,
        chain: u8,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_address_list_instruction(accounts, mode, chain, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `manage_address_list`.
    pub fn manage_address_list_instruction(
        &self,
        accounts: aura_core::accounts::ManageAddressList,
        mode: u8,
        chain: u8,
        addresses: Vec<String>,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::address_lists::manage_address_list(
            accounts, mode, chain, addresses, now,
        ))
    }

    /// Submits `manage_address_list`.
    pub fn manage_address_list(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::ManageAddressList,
        mode: u8,
        chain: u8,
        addresses: Vec<String>,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction =
            self.manage_address_list_instruction(accounts, mode, chain, addresses, now);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `close_address_list`.
    pub fn close_address_list_instruction(
        &self,
        accounts: aura_core::accounts::CloseAddressList,
    ) -> Instruction {
        self.with_program_id(instructions::address_lists::close_address_list(accounts))
    }

    /// Submits `close_address_list`.
    pub fn close_address_list(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseAddressList,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_address_list_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `init_policy_history`.
    pub fn init_policy_history_instruction(
        &self,
        accounts: aura_core::accounts::InitPolicyHistory,
    ) -> Instruction {
        self.with_program_id(instructions::policy::init_policy_history(accounts))
    }

    /// Submits `init_policy_history`.
    pub fn init_policy_history(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitPolicyHistory,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_policy_history_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `close_policy_history`.
    pub fn close_policy_history_instruction(
        &self,
        accounts: aura_core::accounts::ClosePolicyHistory,
    ) -> Instruction {
        self.with_program_id(instructions::policy::close_policy_history(accounts))
    }

    /// Submits `close_policy_history`.
    pub fn close_policy_history(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ClosePolicyHistory,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_policy_history_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `refresh_dwallet_balance`.
    pub fn refresh_dwallet_balance_instruction(
        &self,
        accounts: aura_core::accounts::RefreshDwalletBalance,
        chain_code: u8,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::dwallet::refresh_dwallet_balance(
            accounts, chain_code, now,
        ))
    }

    /// Submits `refresh_dwallet_balance`.
    pub fn refresh_dwallet_balance(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::RefreshDwalletBalance,
        chain_code: u8,
        now: i64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.refresh_dwallet_balance_instruction(accounts, chain_code, now);
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
