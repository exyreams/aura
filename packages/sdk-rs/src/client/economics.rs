//! Client send-helpers for fee vaults & schedules, billing templates & org
//! profiles, and protocol-level configuration.

use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signature},
};

use super::{ensure_signer_matches, AuraClient};
use crate::{
    instructions,
    types::{
        CreateBillingTemplateArgs, FeeScheduleRecord, FeeSplitRecord, ProtocolConfigArgs,
        UpdateBillingTemplateArgs,
    },
    SdkError,
};

impl AuraClient {
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

    /// Builds `deposit_fees`.
    pub fn deposit_fees_instruction(
        &self,
        accounts: aura_core::accounts::ManageFeeVault,
        amount: u64,
    ) -> Instruction {
        self.with_program_id(instructions::fees::deposit_fees(accounts, amount))
    }

    /// Submits `deposit_fees`.
    pub fn deposit_fees(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageFeeVault,
        amount: u64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.deposit_fees_instruction(accounts, amount);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `withdraw_unused_fees`.
    pub fn withdraw_unused_fees_instruction(
        &self,
        accounts: aura_core::accounts::ManageFeeVault,
        amount: u64,
    ) -> Instruction {
        self.with_program_id(instructions::fees::withdraw_unused_fees(accounts, amount))
    }

    /// Submits `withdraw_unused_fees`.
    pub fn withdraw_unused_fees(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageFeeVault,
        amount: u64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.withdraw_unused_fees_instruction(accounts, amount);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `set_fee_splits`.
    pub fn set_fee_splits_instruction(
        &self,
        accounts: aura_core::accounts::ManageFeeVault,
        splits: Vec<FeeSplitRecord>,
        low_balance_mode: u8,
    ) -> Instruction {
        self.with_program_id(instructions::fees::set_fee_splits(
            accounts,
            splits,
            low_balance_mode,
        ))
    }

    /// Submits `set_fee_splits`.
    pub fn set_fee_splits(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageFeeVault,
        splits: Vec<FeeSplitRecord>,
        low_balance_mode: u8,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.set_fee_splits_instruction(accounts, splits, low_balance_mode);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `update_fee_recipient`.
    pub fn update_fee_recipient_instruction(
        &self,
        accounts: aura_core::accounts::UpdateFeeRecipient,
        new_recipient: Pubkey,
    ) -> Instruction {
        self.with_program_id(instructions::fees::update_fee_recipient(
            accounts,
            new_recipient,
        ))
    }

    /// Submits `update_fee_recipient`.
    pub fn update_fee_recipient(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::UpdateFeeRecipient,
        new_recipient: Pubkey,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.update_fee_recipient_instruction(accounts, new_recipient);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `init_fee_schedule`.
    pub fn init_fee_schedule_instruction(
        &self,
        accounts: aura_core::accounts::InitFeeSchedule,
        schedule: FeeScheduleRecord,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::fees::init_fee_schedule(
            accounts, schedule, now,
        ))
    }

    /// Submits `init_fee_schedule`.
    pub fn init_fee_schedule(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitFeeSchedule,
        schedule: FeeScheduleRecord,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_fee_schedule_instruction(accounts, schedule, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `update_fee_schedule`.
    pub fn update_fee_schedule_instruction(
        &self,
        accounts: aura_core::accounts::UpdateFeeSchedule,
        schedule: FeeScheduleRecord,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::fees::update_fee_schedule(
            accounts, schedule, now,
        ))
    }

    /// Submits `update_fee_schedule`.
    pub fn update_fee_schedule(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::UpdateFeeSchedule,
        schedule: FeeScheduleRecord,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.update_fee_schedule_instruction(accounts, schedule, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `close_fee_schedule`.
    pub fn close_fee_schedule_instruction(
        &self,
        accounts: aura_core::accounts::CloseFeeSchedule,
    ) -> Instruction {
        self.with_program_id(instructions::fees::close_fee_schedule(accounts))
    }

    /// Submits `close_fee_schedule`.
    pub fn close_fee_schedule(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseFeeSchedule,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_fee_schedule_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `create_billing_template`.
    pub fn create_billing_template_instruction(
        &self,
        accounts: aura_core::accounts::CreateBillingTemplate,
        args: CreateBillingTemplateArgs,
    ) -> Instruction {
        self.with_program_id(instructions::billing::create_billing_template(
            accounts, args,
        ))
    }

    /// Submits `create_billing_template`.
    pub fn create_billing_template(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CreateBillingTemplate,
        args: CreateBillingTemplateArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.create_billing_template_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `update_billing_template`.
    pub fn update_billing_template_instruction(
        &self,
        accounts: aura_core::accounts::ManageBillingTemplate,
        args: UpdateBillingTemplateArgs,
    ) -> Instruction {
        self.with_program_id(instructions::billing::update_billing_template(
            accounts, args,
        ))
    }

    /// Submits `update_billing_template`.
    pub fn update_billing_template(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageBillingTemplate,
        args: UpdateBillingTemplateArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.update_billing_template_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `close_billing_template`.
    pub fn close_billing_template_instruction(
        &self,
        accounts: aura_core::accounts::CloseBillingTemplate,
    ) -> Instruction {
        self.with_program_id(instructions::billing::close_billing_template(accounts))
    }

    /// Submits `close_billing_template`.
    pub fn close_billing_template(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseBillingTemplate,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_billing_template_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `apply_billing_template`.
    pub fn apply_billing_template_instruction(
        &self,
        accounts: aura_core::accounts::ApplyBillingTemplate,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::billing::apply_billing_template(accounts, now))
    }

    /// Submits `apply_billing_template`.
    pub fn apply_billing_template(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ApplyBillingTemplate,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.apply_billing_template_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `apply_org_profile`.
    pub fn apply_org_profile_instruction(
        &self,
        accounts: aura_core::accounts::ApplyOrgProfile,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::billing::apply_org_profile(accounts, now))
    }

    /// Submits `apply_org_profile`.
    pub fn apply_org_profile(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ApplyOrgProfile,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.apply_org_profile_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `init_protocol_config`.
    pub fn init_protocol_config_instruction(
        &self,
        accounts: aura_core::accounts::InitProtocolConfig,
        args: ProtocolConfigArgs,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::protocol_config::init_protocol_config(
            accounts, args, now,
        ))
    }

    /// Submits `init_protocol_config`.
    pub fn init_protocol_config(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::InitProtocolConfig,
        args: ProtocolConfigArgs,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.init_protocol_config_instruction(accounts, args, now);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `update_protocol_config`.
    pub fn update_protocol_config_instruction(
        &self,
        accounts: aura_core::accounts::ProtocolConfigAuthority,
        args: ProtocolConfigArgs,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::protocol_config::update_protocol_config(
            accounts, args, now,
        ))
    }

    /// Submits `update_protocol_config`.
    pub fn update_protocol_config(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::ProtocolConfigAuthority,
        args: ProtocolConfigArgs,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.update_protocol_config_instruction(accounts, args, now);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `commit_protocol_config`.
    pub fn commit_protocol_config_instruction(
        &self,
        accounts: aura_core::accounts::ProtocolConfigAuthority,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::protocol_config::commit_protocol_config(
            accounts, now,
        ))
    }

    /// Submits `commit_protocol_config`.
    pub fn commit_protocol_config(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::ProtocolConfigAuthority,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.commit_protocol_config_instruction(accounts, now);
        self.send_instructions(authority, vec![instruction], &[])
    }
}
