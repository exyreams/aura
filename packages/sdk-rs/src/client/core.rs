//! Client send-helpers for core treasury, agent identity, trust, recovery, and
//! analytics instructions.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use solana_sdk::{
    instruction::Instruction,
    pubkey::Pubkey,
    signature::{Keypair, Signature, Signer},
};

use super::{ensure_signer_matches, AuraClient};
use crate::{
    instructions,
    types::{
        BreakGlassRecoverArgs, BreakGlassTransferAuthorityArgs, ConfigureSwarmArgs,
        ConfigureTrustPolicyArgs, CreateTreasuryArgs, ExecuteHandoverArgs, NominateSuccessorArgs,
        RegisterRecoveryDestinationArgs, SetAgentCapabilityArgs, SetAgentTripwiresArgs,
        SetRecipientLimitArgs, UpdateTreasuryMetadataArgs,
    },
    SdkError,
};

impl AuraClient {
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
        let accounts = aura_core::accounts::CancelPending {
            owner,
            treasury,
            dwallet_state: None,
        };
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

    /// Builds `update_treasury_metadata`.
    pub fn update_treasury_metadata_instruction(
        &self,
        accounts: aura_core::accounts::OwnerTreasury,
        args: UpdateTreasuryMetadataArgs,
    ) -> Instruction {
        self.with_program_id(instructions::treasury::update_treasury_metadata(
            accounts, args,
        ))
    }

    /// Submits `update_treasury_metadata`.
    pub fn update_treasury_metadata(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::OwnerTreasury,
        args: UpdateTreasuryMetadataArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.update_treasury_metadata_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `set_recipient_limit`.
    pub fn set_recipient_limit_instruction(
        &self,
        accounts: aura_core::accounts::OwnerTreasury,
        args: SetRecipientLimitArgs,
    ) -> Instruction {
        self.with_program_id(instructions::treasury::set_recipient_limit(accounts, args))
    }

    /// Submits `set_recipient_limit`.
    pub fn set_recipient_limit(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::OwnerTreasury,
        args: SetRecipientLimitArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.set_recipient_limit_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `remove_recipient_limit`.
    pub fn remove_recipient_limit_instruction(
        &self,
        accounts: aura_core::accounts::OwnerTreasury,
        chain: u8,
        address: String,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::treasury::remove_recipient_limit(
            accounts, chain, address, now,
        ))
    }

    /// Submits `remove_recipient_limit`.
    pub fn remove_recipient_limit(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::OwnerTreasury,
        chain: u8,
        address: String,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.remove_recipient_limit_instruction(accounts, chain, address, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `register_agent`.
    pub fn register_agent_instruction(
        &self,
        accounts: aura_core::accounts::AgentManage,
        args: crate::types::RegisterAgentArgs,
    ) -> Instruction {
        self.with_program_id(instructions::agent::register_agent(accounts, args))
    }

    /// Submits `register_agent`.
    pub fn register_agent(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::AgentManage,
        args: crate::types::RegisterAgentArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.register_agent_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `revoke_agent`.
    pub fn revoke_agent_instruction(
        &self,
        accounts: aura_core::accounts::AgentManage,
        key: Pubkey,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::agent::revoke_agent(accounts, key, now))
    }

    /// Submits `revoke_agent`.
    pub fn revoke_agent(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::AgentManage,
        key: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.revoke_agent_instruction(accounts, key, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `emergency_revoke_agent`.
    pub fn emergency_revoke_agent_instruction(
        &self,
        accounts: aura_core::accounts::EmergencyRevokeAgent,
        key: Pubkey,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::agent::emergency_revoke_agent(
            accounts, key, now,
        ))
    }

    /// Submits `emergency_revoke_agent`.
    pub fn emergency_revoke_agent(
        &self,
        caller: &Keypair,
        accounts: aura_core::accounts::EmergencyRevokeAgent,
        key: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(caller, accounts.caller, "caller")?;
        let instruction = self.emergency_revoke_agent_instruction(accounts, key, now);
        self.send_instructions(caller, vec![instruction], &[])
    }

    /// Builds `set_agent_capability`.
    pub fn set_agent_capability_instruction(
        &self,
        accounts: aura_core::accounts::AgentManage,
        args: SetAgentCapabilityArgs,
    ) -> Instruction {
        self.with_program_id(instructions::agent::set_agent_capability(accounts, args))
    }

    /// Submits `set_agent_capability`.
    pub fn set_agent_capability(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::AgentManage,
        args: SetAgentCapabilityArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.set_agent_capability_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `arm_capability_loosen`.
    pub fn arm_capability_loosen_instruction(
        &self,
        accounts: aura_core::accounts::AgentManage,
        key: Pubkey,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::agent::arm_capability_loosen(
            accounts, key, now,
        ))
    }

    /// Submits `arm_capability_loosen`.
    pub fn arm_capability_loosen(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::AgentManage,
        key: Pubkey,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.arm_capability_loosen_instruction(accounts, key, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `set_agent_tripwires`.
    pub fn set_agent_tripwires_instruction(
        &self,
        accounts: aura_core::accounts::TrustEnvelopeConfig,
        args: SetAgentTripwiresArgs,
    ) -> Instruction {
        self.with_program_id(instructions::agent::set_agent_tripwires(accounts, args))
    }

    /// Submits `set_agent_tripwires`.
    pub fn set_agent_tripwires(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::TrustEnvelopeConfig,
        args: SetAgentTripwiresArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.set_agent_tripwires_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `nominate_successor_owner`.
    pub fn nominate_successor_owner_instruction(
        &self,
        accounts: aura_core::accounts::OwnershipHandover,
        args: NominateSuccessorArgs,
    ) -> Instruction {
        self.with_program_id(instructions::agent::nominate_successor_owner(
            accounts, args,
        ))
    }

    /// Submits `nominate_successor_owner`.
    pub fn nominate_successor_owner(
        &self,
        caller: &Keypair,
        accounts: aura_core::accounts::OwnershipHandover,
        args: NominateSuccessorArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(caller, accounts.caller, "caller")?;
        let instruction = self.nominate_successor_owner_instruction(accounts, args);
        self.send_instructions(caller, vec![instruction], &[])
    }

    /// Builds `execute_ownership_handover`.
    pub fn execute_ownership_handover_instruction(
        &self,
        accounts: aura_core::accounts::ExecuteOwnershipHandover,
        args: ExecuteHandoverArgs,
    ) -> Instruction {
        self.with_program_id(instructions::agent::execute_ownership_handover(
            accounts, args,
        ))
    }

    /// Submits `execute_ownership_handover`.
    pub fn execute_ownership_handover(
        &self,
        caller: &Keypair,
        accounts: aura_core::accounts::ExecuteOwnershipHandover,
        args: ExecuteHandoverArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(caller, accounts.caller, "caller")?;
        let instruction = self.execute_ownership_handover_instruction(accounts, args);
        self.send_instructions(caller, vec![instruction], &[])
    }

    /// Builds `init_trust_identity`.
    pub fn init_trust_identity_instruction(
        &self,
        accounts: aura_core::accounts::InitTrustIdentity,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::trust::init_trust_identity(accounts, now))
    }

    /// Submits `init_trust_identity`.
    pub fn init_trust_identity(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitTrustIdentity,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_trust_identity_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `configure_trust_policy`.
    pub fn configure_trust_policy_instruction(
        &self,
        accounts: aura_core::accounts::TrustEnvelopeConfig,
        args: ConfigureTrustPolicyArgs,
    ) -> Instruction {
        self.with_program_id(instructions::trust::configure_trust_policy(accounts, args))
    }

    /// Submits `configure_trust_policy`.
    pub fn configure_trust_policy(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::TrustEnvelopeConfig,
        args: ConfigureTrustPolicyArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.configure_trust_policy_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `restore_trust`.
    pub fn restore_trust_instruction(
        &self,
        accounts: aura_core::accounts::TrustEnvelopeConfig,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::trust::restore_trust(accounts, now))
    }

    /// Submits `restore_trust`.
    pub fn restore_trust(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::TrustEnvelopeConfig,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.restore_trust_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `register_recovery_destination`.
    pub fn register_recovery_destination_instruction(
        &self,
        accounts: aura_core::accounts::RecoveryConfig,
        args: RegisterRecoveryDestinationArgs,
    ) -> Instruction {
        self.with_program_id(instructions::recovery::register_recovery_destination(
            accounts, args,
        ))
    }

    /// Submits `register_recovery_destination`.
    pub fn register_recovery_destination(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::RecoveryConfig,
        args: RegisterRecoveryDestinationArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.register_recovery_destination_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `break_glass_recover`.
    pub fn break_glass_recover_instruction(
        &self,
        accounts: aura_core::accounts::BreakGlassRecover,
        args: BreakGlassRecoverArgs,
    ) -> Instruction {
        self.with_program_id(instructions::recovery::break_glass_recover(accounts, args))
    }

    /// Submits `break_glass_recover`.
    pub fn break_glass_recover(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::BreakGlassRecover,
        args: BreakGlassRecoverArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.break_glass_recover_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `break_glass_transfer_authority`.
    pub fn break_glass_transfer_authority_instruction(
        &self,
        accounts: aura_core::accounts::BreakGlassTransferAuthority,
        args: BreakGlassTransferAuthorityArgs,
    ) -> Instruction {
        self.with_program_id(instructions::recovery::break_glass_transfer_authority(
            accounts, args,
        ))
    }

    /// Submits `break_glass_transfer_authority`.
    pub fn break_glass_transfer_authority(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::BreakGlassTransferAuthority,
        args: BreakGlassTransferAuthorityArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.break_glass_transfer_authority_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `init_treasury_analytics`.
    pub fn init_treasury_analytics_instruction(
        &self,
        accounts: aura_core::accounts::InitTreasuryAnalytics,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::analytics::init_treasury_analytics(
            accounts, now,
        ))
    }

    /// Submits `init_treasury_analytics`.
    pub fn init_treasury_analytics(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::InitTreasuryAnalytics,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_treasury_analytics_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `close_treasury_analytics`.
    pub fn close_treasury_analytics_instruction(
        &self,
        accounts: aura_core::accounts::CloseTreasuryAnalytics,
    ) -> Instruction {
        self.with_program_id(instructions::analytics::close_treasury_analytics(accounts))
    }

    /// Submits `close_treasury_analytics`.
    pub fn close_treasury_analytics(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseTreasuryAnalytics,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_treasury_analytics_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }
}
