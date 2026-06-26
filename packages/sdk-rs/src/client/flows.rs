//! Client send-helpers for proposal, execution, settlement, batch, conditional,
//! scheduled-intent, and confidential-execution instructions.

use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signature, Signer},
};

use super::{ensure_signer_matches, AuraClient};
use crate::{
    instructions,
    types::{
        ApprovePendingExecutionArgs, ConditionalProposalArgs, ConfirmSettlementArgs,
        MarkSettlementBroadcastArgs, ProposeBatchArgs, ProposeConfidentialBatchArgs,
        ProposeConfidentialTransactionArgs, ProposeTransactionArgs, ResubmitProposalArgs,
        ScheduledIntentArgs,
    },
    SdkError,
};

impl AuraClient {
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
            dwallet_state: None,
            chain_profile: None,
            trust_identity: None,
            policy_canary: None,
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

    /// Builds `approve_pending_execution`.
    pub fn approve_pending_execution_instruction(
        &self,
        accounts: aura_core::accounts::ApprovePendingExecution,
        args: ApprovePendingExecutionArgs,
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
        args: ApprovePendingExecutionArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(approver, accounts.approver, "approver")?;
        let instruction = self.approve_pending_execution_instruction(accounts, args);
        self.send_instructions(approver, vec![instruction], &[])
    }

    /// Builds `confirm_settlement`.
    pub fn confirm_settlement_instruction(
        &self,
        accounts: aura_core::accounts::ConfirmSettlement,
        args: ConfirmSettlementArgs,
    ) -> Instruction {
        self.with_program_id(instructions::execution::confirm_settlement(accounts, args))
    }

    /// Submits `confirm_settlement`.
    pub fn confirm_settlement(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::ConfirmSettlement,
        args: ConfirmSettlementArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.confirm_settlement_instruction(accounts, args);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `mark_settlement_broadcast`.
    pub fn mark_settlement_broadcast_instruction(
        &self,
        accounts: aura_core::accounts::MarkSettlementBroadcast,
        args: MarkSettlementBroadcastArgs,
    ) -> Instruction {
        self.with_program_id(instructions::execution::mark_settlement_broadcast(
            accounts, args,
        ))
    }

    /// Submits `mark_settlement_broadcast`.
    pub fn mark_settlement_broadcast(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::MarkSettlementBroadcast,
        args: MarkSettlementBroadcastArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.mark_settlement_broadcast_instruction(accounts, args);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `resubmit_proposal`.
    pub fn resubmit_proposal_instruction(
        &self,
        accounts: aura_core::accounts::ResubmitProposal,
        args: ResubmitProposalArgs,
    ) -> Instruction {
        self.with_program_id(instructions::execution::resubmit_proposal(accounts, args))
    }

    /// Submits `resubmit_proposal`.
    pub fn resubmit_proposal(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::ResubmitProposal,
        args: ResubmitProposalArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.resubmit_proposal_instruction(accounts, args);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `abandon_proposal`.
    pub fn abandon_proposal_instruction(
        &self,
        accounts: aura_core::accounts::AbandonProposal,
        proposal_id: u64,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::execution::abandon_proposal(
            accounts,
            proposal_id,
            now,
        ))
    }

    /// Submits `abandon_proposal`.
    pub fn abandon_proposal(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::AbandonProposal,
        proposal_id: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.abandon_proposal_instruction(accounts, proposal_id, now);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `propose_batch`.
    pub fn propose_batch_instruction(
        &self,
        accounts: aura_core::accounts::ProposeBatch,
        args: ProposeBatchArgs,
    ) -> Instruction {
        self.with_program_id(instructions::batch::propose_batch(accounts, args))
    }

    /// Submits `propose_batch`.
    pub fn propose_batch(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::ProposeBatch,
        args: ProposeBatchArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.propose_batch_instruction(accounts, args);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `propose_conditional_transaction`.
    pub fn propose_conditional_transaction_instruction(
        &self,
        accounts: aura_core::accounts::ProposeConditionalTransaction,
        proposal_id: u64,
        args: ConditionalProposalArgs,
    ) -> Instruction {
        self.with_program_id(instructions::conditional::propose_conditional_transaction(
            accounts,
            proposal_id,
            args,
        ))
    }

    /// Submits `propose_conditional_transaction`.
    pub fn propose_conditional_transaction(
        &self,
        ai_authority: &Keypair,
        accounts: aura_core::accounts::ProposeConditionalTransaction,
        proposal_id: u64,
        args: ConditionalProposalArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(ai_authority, accounts.ai_authority, "ai_authority")?;
        let instruction =
            self.propose_conditional_transaction_instruction(accounts, proposal_id, args);
        self.send_instructions(ai_authority, vec![instruction], &[])
    }

    /// Builds `try_trigger`.
    pub fn try_trigger_instruction(
        &self,
        accounts: aura_core::accounts::TryTrigger,
    ) -> Instruction {
        self.with_program_id(instructions::conditional::try_trigger(accounts))
    }

    /// Submits `try_trigger`.
    pub fn try_trigger(
        &self,
        caller: &Keypair,
        accounts: aura_core::accounts::TryTrigger,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(caller, accounts.caller, "caller")?;
        let instruction = self.try_trigger_instruction(accounts);
        self.send_instructions(caller, vec![instruction], &[])
    }

    /// Builds `close_conditional_proposal`.
    pub fn close_conditional_proposal_instruction(
        &self,
        accounts: aura_core::accounts::CloseConditionalProposal,
    ) -> Instruction {
        self.with_program_id(instructions::conditional::close_conditional_proposal(
            accounts,
        ))
    }

    /// Submits `close_conditional_proposal`.
    pub fn close_conditional_proposal(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseConditionalProposal,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_conditional_proposal_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `create_scheduled_intent`.
    pub fn create_scheduled_intent_instruction(
        &self,
        accounts: aura_core::accounts::CreateScheduledIntent,
        intent_id: u64,
        args: ScheduledIntentArgs,
    ) -> Instruction {
        self.with_program_id(instructions::scheduled_intents::create_scheduled_intent(
            accounts, intent_id, args,
        ))
    }

    /// Submits `create_scheduled_intent`.
    pub fn create_scheduled_intent(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CreateScheduledIntent,
        intent_id: u64,
        args: ScheduledIntentArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.create_scheduled_intent_instruction(accounts, intent_id, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `update_scheduled_intent`.
    pub fn update_scheduled_intent_instruction(
        &self,
        accounts: aura_core::accounts::ManageScheduledIntent,
        args: ScheduledIntentArgs,
    ) -> Instruction {
        self.with_program_id(instructions::scheduled_intents::update_scheduled_intent(
            accounts, args,
        ))
    }

    /// Submits `update_scheduled_intent`.
    pub fn update_scheduled_intent(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageScheduledIntent,
        args: ScheduledIntentArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.update_scheduled_intent_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `pause_scheduled_intent`.
    pub fn pause_scheduled_intent_instruction(
        &self,
        accounts: aura_core::accounts::ManageScheduledIntent,
    ) -> Instruction {
        self.with_program_id(instructions::scheduled_intents::pause_scheduled_intent(
            accounts,
        ))
    }

    /// Submits `pause_scheduled_intent`.
    pub fn pause_scheduled_intent(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageScheduledIntent,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.pause_scheduled_intent_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `resume_scheduled_intent`.
    pub fn resume_scheduled_intent_instruction(
        &self,
        accounts: aura_core::accounts::ManageScheduledIntent,
    ) -> Instruction {
        self.with_program_id(instructions::scheduled_intents::resume_scheduled_intent(
            accounts,
        ))
    }

    /// Submits `resume_scheduled_intent`.
    pub fn resume_scheduled_intent(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageScheduledIntent,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.resume_scheduled_intent_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `close_scheduled_intent`.
    pub fn close_scheduled_intent_instruction(
        &self,
        accounts: aura_core::accounts::CloseScheduledIntent,
    ) -> Instruction {
        self.with_program_id(instructions::scheduled_intents::close_scheduled_intent(
            accounts,
        ))
    }

    /// Submits `close_scheduled_intent`.
    pub fn close_scheduled_intent(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseScheduledIntent,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_scheduled_intent_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `clear_scheduled_intent_in_flight`.
    pub fn clear_scheduled_intent_in_flight_instruction(
        &self,
        accounts: aura_core::accounts::ClearScheduledIntentInFlight,
        proposal_id: u64,
        now: i64,
    ) -> Instruction {
        self.with_program_id(
            instructions::scheduled_intents::clear_scheduled_intent_in_flight(
                accounts,
                proposal_id,
                now,
            ),
        )
    }

    /// Submits `clear_scheduled_intent_in_flight`.
    pub fn clear_scheduled_intent_in_flight(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ClearScheduledIntentInFlight,
        proposal_id: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction =
            self.clear_scheduled_intent_in_flight_instruction(accounts, proposal_id, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `execute_scheduled_intent`.
    pub fn execute_scheduled_intent_instruction(
        &self,
        accounts: aura_core::accounts::ExecuteScheduledIntent,
    ) -> Instruction {
        self.with_program_id(instructions::scheduled_intents::execute_scheduled_intent(
            accounts,
        ))
    }

    /// Submits `execute_scheduled_intent`.
    pub fn execute_scheduled_intent(
        &self,
        caller: &Keypair,
        accounts: aura_core::accounts::ExecuteScheduledIntent,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(caller, accounts.caller, "caller")?;
        let instruction = self.execute_scheduled_intent_instruction(accounts);
        self.send_instructions(caller, vec![instruction], &[])
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

    /// Builds `request_policy_decryption`.
    pub fn request_policy_decryption_instruction(
        &self,
        accounts: aura_core::accounts::RequestPolicyDecryption,
        now: i64,
        current_epoch_id: u64,
    ) -> Instruction {
        self.with_program_id(instructions::confidential::request_policy_decryption(
            accounts,
            now,
            current_epoch_id,
        ))
    }

    /// Submits `request_policy_decryption`.
    pub fn request_policy_decryption(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::RequestPolicyDecryption,
        now: i64,
        current_epoch_id: u64,
        extra_signers: &[&Keypair],
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction =
            self.request_policy_decryption_instruction(accounts, now, current_epoch_id);
        self.send_instructions(operator, vec![instruction], extra_signers)
    }

    /// Builds `confirm_policy_decryption`.
    pub fn confirm_policy_decryption_instruction(
        &self,
        operator: Pubkey,
        treasury: Pubkey,
        request_account: Pubkey,
        now: i64,
        current_epoch_id: u64,
    ) -> Instruction {
        let accounts = aura_core::accounts::ConfirmPolicyDecryption {
            operator,
            treasury,
            request_account,
            confidential_guardrails: None,
        };
        self.with_program_id(instructions::confidential::confirm_policy_decryption(
            accounts,
            now,
            current_epoch_id,
        ))
    }

    /// Submits `confirm_policy_decryption`.
    pub fn confirm_policy_decryption(
        &self,
        operator: &Keypair,
        treasury: Pubkey,
        request_account: Pubkey,
        now: i64,
        current_epoch_id: u64,
    ) -> Result<Signature, SdkError> {
        let instruction = self.confirm_policy_decryption_instruction(
            operator.pubkey(),
            treasury,
            request_account,
            now,
            current_epoch_id,
        );
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `init_confidential_guardrails`.
    pub fn init_confidential_guardrails_instruction(
        &self,
        accounts: aura_core::accounts::InitConfidentialGuardrails,
        epoch_id: u64,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::confidential::init_confidential_guardrails(
            accounts, epoch_id, now,
        ))
    }

    /// Submits `init_confidential_guardrails`.
    pub fn init_confidential_guardrails(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitConfidentialGuardrails,
        epoch_id: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_confidential_guardrails_instruction(accounts, epoch_id, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `update_confidential_guardrails`.
    pub fn update_confidential_guardrails_instruction(
        &self,
        accounts: aura_core::accounts::ManageConfidentialGuardrails,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::confidential::update_confidential_guardrails(
            accounts, now,
        ))
    }

    /// Submits `update_confidential_guardrails`.
    pub fn update_confidential_guardrails(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageConfidentialGuardrails,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.update_confidential_guardrails_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `rotate_confidential_guardrails`.
    pub fn rotate_confidential_guardrails_instruction(
        &self,
        accounts: aura_core::accounts::ManageConfidentialGuardrails,
        new_epoch_id: u64,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::confidential::rotate_confidential_guardrails(
            accounts,
            new_epoch_id,
            now,
        ))
    }

    /// Submits `rotate_confidential_guardrails`.
    pub fn rotate_confidential_guardrails(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageConfidentialGuardrails,
        new_epoch_id: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction =
            self.rotate_confidential_guardrails_instruction(accounts, new_epoch_id, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `reset_confidential_counters`.
    pub fn reset_confidential_counters_instruction(
        &self,
        accounts: aura_core::accounts::ManageConfidentialGuardrails,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::confidential::reset_confidential_counters(
            accounts, now,
        ))
    }

    /// Submits `reset_confidential_counters`.
    pub fn reset_confidential_counters(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageConfidentialGuardrails,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.reset_confidential_counters_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `disable_confidential_guardrails`.
    pub fn disable_confidential_guardrails_instruction(
        &self,
        accounts: aura_core::accounts::DisableConfidentialGuardrails,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::confidential::disable_confidential_guardrails(
            accounts, now,
        ))
    }

    /// Submits `disable_confidential_guardrails`.
    pub fn disable_confidential_guardrails(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::DisableConfidentialGuardrails,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.disable_confidential_guardrails_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `close_confidential_guardrails`.
    pub fn close_confidential_guardrails_instruction(
        &self,
        accounts: aura_core::accounts::CloseConfidentialGuardrails,
    ) -> Instruction {
        self.with_program_id(instructions::confidential::close_confidential_guardrails(
            accounts,
        ))
    }

    /// Submits `close_confidential_guardrails`.
    pub fn close_confidential_guardrails(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseConfidentialGuardrails,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_confidential_guardrails_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `propose_confidential_batch`.
    pub fn propose_confidential_batch_instruction(
        &self,
        accounts: aura_core::accounts::ProposeConfidentialBatch,
        args: ProposeConfidentialBatchArgs,
    ) -> Instruction {
        self.with_program_id(instructions::confidential::propose_confidential_batch(
            accounts, args,
        ))
    }

    /// Submits `propose_confidential_batch`.
    pub fn propose_confidential_batch(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::ProposeConfidentialBatch,
        args: ProposeConfidentialBatchArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.propose_confidential_batch_instruction(accounts, args);
        self.send_instructions(payer, vec![instruction], &[])
    }
}
