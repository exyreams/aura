//! Client send-helpers for governance, rotation, session-key, operator-role,
//! and lifecycle-administration instructions.

use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signature, Signer},
};

use super::{ensure_signer_matches, AuraClient};
use crate::{
    instructions,
    types::{
        ConfigureMultisigArgs, GrantOperatorRoleArgs, IssueSessionKeyArgs, PolicyConfigRecord,
        UpdateOperatorRoleArgs, UpdateSessionKeyArgs,
    },
    SdkError,
};

impl AuraClient {
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
        new_policy_config: PolicyConfigRecord,
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
        new_policy_config: PolicyConfigRecord,
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

    /// Builds `grant_operator_role`.
    pub fn grant_operator_role_instruction(
        &self,
        accounts: aura_core::accounts::GrantOperatorRole,
        args: GrantOperatorRoleArgs,
    ) -> Instruction {
        self.with_program_id(instructions::lifecycle::grant_operator_role(accounts, args))
    }

    /// Submits `grant_operator_role`.
    pub fn grant_operator_role(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::GrantOperatorRole,
        args: GrantOperatorRoleArgs,
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

    /// Builds `update_operator_role`.
    pub fn update_operator_role_instruction(
        &self,
        accounts: aura_core::accounts::UpdateOperatorRole,
        args: UpdateOperatorRoleArgs,
    ) -> Instruction {
        self.with_program_id(instructions::lifecycle::update_operator_role(
            accounts, args,
        ))
    }

    /// Submits `update_operator_role`.
    pub fn update_operator_role(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::UpdateOperatorRole,
        args: UpdateOperatorRoleArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.update_operator_role_instruction(accounts, args);
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
        args: IssueSessionKeyArgs,
    ) -> Instruction {
        self.with_program_id(instructions::lifecycle::issue_session_key(accounts, args))
    }

    /// Submits `issue_session_key`.
    pub fn issue_session_key(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::IssueSessionKey,
        args: IssueSessionKeyArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.issue_session_key_instruction(accounts, args);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `update_session_key`.
    pub fn update_session_key_instruction(
        &self,
        accounts: aura_core::accounts::UpdateSessionKey,
        args: UpdateSessionKeyArgs,
    ) -> Instruction {
        self.with_program_id(instructions::lifecycle::update_session_key(accounts, args))
    }

    /// Submits `update_session_key`.
    pub fn update_session_key(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::UpdateSessionKey,
        args: UpdateSessionKeyArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.update_session_key_instruction(accounts, args);
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
}
