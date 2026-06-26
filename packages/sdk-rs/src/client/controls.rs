//! Client send-helpers for policy controls, budget envelopes, operational
//! surface, address lists, and swarm pools.

use solana_sdk::{
    instruction::Instruction,
    signature::{Keypair, Signature, Signer},
};

use super::{ensure_signer_matches, AuraClient};
use crate::{
    instructions,
    types::{
        ApplyPolicyPresetArgs, AttestPolicyArgs, CheckInvariantsArgs, CheckPolicyCpiArgs,
        ConfigureApprovalLadderArgs, ConfigureBudgetEnvelopeArgs, ConfigureLivenessGuardrailsArgs,
        CreatePolicyTemplateArgs, InitExposureGroupArgs, InitExternalLivenessArgs,
        InitSwarmPoolArgs, ParameterizedOverrides, PolicyConfigRecord, RefreshExternalLivenessArgs,
        SetScopedPauseArgs, SimulatePolicyArgs, UpdatePolicyTemplateArgs, WritePolicyReceiptArgs,
    },
    SdkError,
};

impl AuraClient {
    /// Builds `simulate_policy`.
    pub fn simulate_policy_instruction(
        &self,
        accounts: aura_core::accounts::SimulatePolicy,
        args: SimulatePolicyArgs,
    ) -> Instruction {
        self.with_program_id(instructions::policy::simulate_policy(accounts, args))
    }

    /// Submits `simulate_policy`.
    pub fn simulate_policy(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::SimulatePolicy,
        args: SimulatePolicyArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.simulate_policy_instruction(accounts, args);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `write_policy_receipt`.
    pub fn write_policy_receipt_instruction(
        &self,
        accounts: aura_core::accounts::WritePolicyReceipt,
        args: WritePolicyReceiptArgs,
    ) -> Instruction {
        self.with_program_id(instructions::policy::write_policy_receipt(accounts, args))
    }

    /// Submits `write_policy_receipt`.
    pub fn write_policy_receipt(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::WritePolicyReceipt,
        args: WritePolicyReceiptArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.write_policy_receipt_instruction(accounts, args);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `apply_policy_preset`.
    pub fn apply_policy_preset_instruction(
        &self,
        accounts: aura_core::accounts::ApplyPolicyPreset,
        args: ApplyPolicyPresetArgs,
    ) -> Instruction {
        self.with_program_id(instructions::policy::apply_policy_preset(accounts, args))
    }

    /// Submits `apply_policy_preset`.
    pub fn apply_policy_preset(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ApplyPolicyPreset,
        args: ApplyPolicyPresetArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.apply_policy_preset_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `attest_policy`.
    pub fn attest_policy_instruction(
        &self,
        accounts: aura_core::accounts::AttestPolicy,
        args: AttestPolicyArgs,
    ) -> Instruction {
        self.with_program_id(instructions::policy::attest_policy(accounts, args))
    }

    /// Submits `attest_policy`.
    pub fn attest_policy(
        &self,
        payer: &Keypair,
        attester: &Keypair,
        accounts: aura_core::accounts::AttestPolicy,
        args: AttestPolicyArgs,
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

    /// Builds `check_invariants`.
    pub fn check_invariants_instruction(
        &self,
        accounts: aura_core::accounts::CheckInvariants,
        args: CheckInvariantsArgs,
    ) -> Instruction {
        self.with_program_id(instructions::policy::check_invariants(accounts, args))
    }

    /// Submits `check_invariants`.
    pub fn check_invariants(
        &self,
        payer: &Keypair,
        accounts: aura_core::accounts::CheckInvariants,
        args: CheckInvariantsArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(payer, accounts.payer, "payer")?;
        let instruction = self.check_invariants_instruction(accounts, args);
        self.send_instructions(payer, vec![instruction], &[])
    }

    /// Builds `check_policy_cpi`.
    pub fn check_policy_cpi_instruction(
        &self,
        accounts: aura_core::accounts::CheckPolicyCpi,
        args: CheckPolicyCpiArgs,
    ) -> Instruction {
        self.with_program_id(instructions::policy::check_policy_cpi(accounts, args))
    }

    /// Submits `check_policy_cpi`.
    pub fn check_policy_cpi(
        &self,
        fee_payer: &Keypair,
        accounts: aura_core::accounts::CheckPolicyCpi,
        args: CheckPolicyCpiArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(fee_payer, accounts.fee_payer, "fee_payer")?;
        let instruction = self.check_policy_cpi_instruction(accounts, args);
        self.send_instructions(fee_payer, vec![instruction], &[])
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

    /// Builds `rollback_policy`.
    pub fn rollback_policy_instruction(
        &self,
        accounts: aura_core::accounts::RollbackPolicy,
        target_version: u32,
        candidate: PolicyConfigRecord,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::policy::rollback_policy(
            accounts,
            target_version,
            candidate,
            now,
        ))
    }

    /// Submits `rollback_policy`.
    pub fn rollback_policy(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::RollbackPolicy,
        target_version: u32,
        candidate: PolicyConfigRecord,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction =
            self.rollback_policy_instruction(accounts, target_version, candidate, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `start_canary`.
    pub fn start_canary_instruction(
        &self,
        accounts: aura_core::accounts::StartCanary,
        candidate: PolicyConfigRecord,
        sample_cap: u32,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::policy::start_canary(
            accounts, candidate, sample_cap, now,
        ))
    }

    /// Submits `start_canary`.
    pub fn start_canary(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::StartCanary,
        candidate: PolicyConfigRecord,
        sample_cap: u32,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.start_canary_instruction(accounts, candidate, sample_cap, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `promote_canary`.
    pub fn promote_canary_instruction(
        &self,
        accounts: aura_core::accounts::PromoteCanary,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::policy::promote_canary(accounts, now))
    }

    /// Submits `promote_canary`.
    pub fn promote_canary(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::PromoteCanary,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.promote_canary_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `discard_canary`.
    pub fn discard_canary_instruction(
        &self,
        accounts: aura_core::accounts::DiscardCanary,
    ) -> Instruction {
        self.with_program_id(instructions::policy::discard_canary(accounts))
    }

    /// Submits `discard_canary`.
    pub fn discard_canary(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::DiscardCanary,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.discard_canary_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `create_policy_template`.
    pub fn create_policy_template_instruction(
        &self,
        accounts: aura_core::accounts::CreatePolicyTemplate,
        args: CreatePolicyTemplateArgs,
    ) -> Instruction {
        self.with_program_id(instructions::policy::create_policy_template(accounts, args))
    }

    /// Submits `create_policy_template`.
    pub fn create_policy_template(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CreatePolicyTemplate,
        args: CreatePolicyTemplateArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.create_policy_template_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `update_policy_template`.
    pub fn update_policy_template_instruction(
        &self,
        accounts: aura_core::accounts::ManagePolicyTemplate,
        args: UpdatePolicyTemplateArgs,
    ) -> Instruction {
        self.with_program_id(instructions::policy::update_policy_template(accounts, args))
    }

    /// Submits `update_policy_template`.
    pub fn update_policy_template(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManagePolicyTemplate,
        args: UpdatePolicyTemplateArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.update_policy_template_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `close_policy_template`.
    pub fn close_policy_template_instruction(
        &self,
        accounts: aura_core::accounts::ClosePolicyTemplate,
    ) -> Instruction {
        self.with_program_id(instructions::policy::close_policy_template(accounts))
    }

    /// Submits `close_policy_template`.
    pub fn close_policy_template(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ClosePolicyTemplate,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_policy_template_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `apply_policy_template`.
    pub fn apply_policy_template_instruction(
        &self,
        accounts: aura_core::accounts::ApplyPolicyTemplate,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::policy::apply_policy_template(accounts, now))
    }

    /// Submits `apply_policy_template`.
    pub fn apply_policy_template(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ApplyPolicyTemplate,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.apply_policy_template_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `apply_policy_template_parameterized`.
    pub fn apply_policy_template_parameterized_instruction(
        &self,
        accounts: aura_core::accounts::ApplyPolicyTemplate,
        overrides: ParameterizedOverrides,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::policy::apply_policy_template_parameterized(
            accounts, overrides, now,
        ))
    }

    /// Submits `apply_policy_template_parameterized`.
    pub fn apply_policy_template_parameterized(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ApplyPolicyTemplate,
        overrides: ParameterizedOverrides,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction =
            self.apply_policy_template_parameterized_instruction(accounts, overrides, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `configure_budget_envelope`.
    pub fn configure_budget_envelope_instruction(
        &self,
        accounts: aura_core::accounts::ConfigureBudgetEnvelope,
        args: ConfigureBudgetEnvelopeArgs,
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
        args: ConfigureBudgetEnvelopeArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.configure_budget_envelope_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `init_exposure_group`.
    pub fn init_exposure_group_instruction(
        &self,
        accounts: aura_core::accounts::InitExposureGroup,
        args: InitExposureGroupArgs,
    ) -> Instruction {
        self.with_program_id(instructions::budget::init_exposure_group(accounts, args))
    }

    /// Submits `init_exposure_group`.
    pub fn init_exposure_group(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::InitExposureGroup,
        args: InitExposureGroupArgs,
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

    /// Builds `remove_budget_envelope`.
    pub fn remove_budget_envelope_instruction(
        &self,
        accounts: aura_core::accounts::RemoveBudgetEnvelope,
        envelope_id: u64,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::budget::remove_budget_envelope(
            accounts,
            envelope_id,
            now,
        ))
    }

    /// Submits `remove_budget_envelope`.
    pub fn remove_budget_envelope(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::RemoveBudgetEnvelope,
        envelope_id: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.remove_budget_envelope_instruction(accounts, envelope_id, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `leave_exposure_group`.
    pub fn leave_exposure_group_instruction(
        &self,
        accounts: aura_core::accounts::ManageExposureGroup,
    ) -> Instruction {
        self.with_program_id(instructions::budget::leave_exposure_group(accounts))
    }

    /// Submits `leave_exposure_group`.
    pub fn leave_exposure_group(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::ManageExposureGroup,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.leave_exposure_group_instruction(accounts);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `update_exposure_group`.
    pub fn update_exposure_group_instruction(
        &self,
        accounts: aura_core::accounts::ManageExposureGroup,
        daily_limit_usd: Option<u64>,
    ) -> Instruction {
        self.with_program_id(instructions::budget::update_exposure_group(
            accounts,
            daily_limit_usd,
        ))
    }

    /// Submits `update_exposure_group`.
    pub fn update_exposure_group(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::ManageExposureGroup,
        daily_limit_usd: Option<u64>,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.update_exposure_group_instruction(accounts, daily_limit_usd);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `close_exposure_group`.
    pub fn close_exposure_group_instruction(
        &self,
        accounts: aura_core::accounts::CloseExposureGroup,
    ) -> Instruction {
        self.with_program_id(instructions::budget::close_exposure_group(accounts))
    }

    /// Submits `close_exposure_group`.
    pub fn close_exposure_group(
        &self,
        authority: &Keypair,
        accounts: aura_core::accounts::CloseExposureGroup,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(authority, accounts.authority, "authority")?;
        let instruction = self.close_exposure_group_instruction(accounts);
        self.send_instructions(authority, vec![instruction], &[])
    }

    /// Builds `configure_approval_ladder`.
    pub fn configure_approval_ladder_instruction(
        &self,
        accounts: aura_core::accounts::ConfigureApprovalLadder,
        args: ConfigureApprovalLadderArgs,
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
        args: ConfigureApprovalLadderArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.configure_approval_ladder_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `configure_liveness_guardrails`.
    pub fn configure_liveness_guardrails_instruction(
        &self,
        accounts: aura_core::accounts::ConfigureLivenessGuardrails,
        args: ConfigureLivenessGuardrailsArgs,
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
        args: ConfigureLivenessGuardrailsArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.configure_liveness_guardrails_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `set_scoped_pause`.
    pub fn set_scoped_pause_instruction(
        &self,
        accounts: aura_core::accounts::SetScopedPause,
        args: SetScopedPauseArgs,
    ) -> Instruction {
        self.with_program_id(instructions::operational::set_scoped_pause(accounts, args))
    }

    /// Submits `set_scoped_pause`.
    pub fn set_scoped_pause(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::SetScopedPause,
        args: SetScopedPauseArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.set_scoped_pause_instruction(accounts, args);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `init_external_liveness`.
    pub fn init_external_liveness_instruction(
        &self,
        accounts: aura_core::accounts::InitExternalLiveness,
        args: InitExternalLivenessArgs,
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
        args: InitExternalLivenessArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.init_external_liveness_instruction(accounts, args);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `refresh_external_liveness`.
    pub fn refresh_external_liveness_instruction(
        &self,
        accounts: aura_core::accounts::RefreshExternalLiveness,
        args: RefreshExternalLivenessArgs,
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
        args: RefreshExternalLivenessArgs,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.refresh_external_liveness_instruction(accounts, args);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `close_external_liveness`.
    pub fn close_external_liveness_instruction(
        &self,
        accounts: aura_core::accounts::CloseExternalLiveness,
    ) -> Instruction {
        self.with_program_id(instructions::operational::close_external_liveness(accounts))
    }

    /// Submits `close_external_liveness`.
    pub fn close_external_liveness(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::CloseExternalLiveness,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.close_external_liveness_instruction(accounts);
        self.send_instructions(owner, vec![instruction], &[])
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

    /// Builds `update_address_list_entry`.
    pub fn update_address_list_entry_instruction(
        &self,
        accounts: aura_core::accounts::ManageAddressList,
        address: String,
        add: bool,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::address_lists::update_address_list_entry(
            accounts, address, add, now,
        ))
    }

    /// Submits `update_address_list_entry`.
    pub fn update_address_list_entry(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::ManageAddressList,
        address: String,
        add: bool,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.update_address_list_entry_instruction(accounts, address, add, now);
        self.send_instructions(operator, vec![instruction], &[])
    }

    /// Builds `clear_address_list`.
    pub fn clear_address_list_instruction(
        &self,
        accounts: aura_core::accounts::ManageAddressList,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::address_lists::clear_address_list(
            accounts, now,
        ))
    }

    /// Submits `clear_address_list`.
    pub fn clear_address_list(
        &self,
        operator: &Keypair,
        accounts: aura_core::accounts::ManageAddressList,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(operator, accounts.operator, "operator")?;
        let instruction = self.clear_address_list_instruction(accounts, now);
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

    /// Builds `init_swarm_pool`.
    pub fn init_swarm_pool_instruction(
        &self,
        accounts: aura_core::accounts::InitSwarmPool,
        args: InitSwarmPoolArgs,
    ) -> Instruction {
        self.with_program_id(instructions::swarm::init_swarm_pool(accounts, args))
    }

    /// Submits `init_swarm_pool`.
    pub fn init_swarm_pool(
        &self,
        creator: &Keypair,
        accounts: aura_core::accounts::InitSwarmPool,
        args: InitSwarmPoolArgs,
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

    /// Builds `leave_swarm`.
    pub fn leave_swarm_instruction(
        &self,
        accounts: aura_core::accounts::ManageSwarm,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::swarm::leave_swarm(accounts, now))
    }

    /// Submits `leave_swarm`.
    pub fn leave_swarm(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageSwarm,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.leave_swarm_instruction(accounts, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `update_swarm`.
    pub fn update_swarm_instruction(
        &self,
        accounts: aura_core::accounts::ManageSwarm,
        shared_pool_limit_usd: u64,
        now: i64,
    ) -> Instruction {
        self.with_program_id(instructions::swarm::update_swarm(
            accounts,
            shared_pool_limit_usd,
            now,
        ))
    }

    /// Submits `update_swarm`.
    pub fn update_swarm(
        &self,
        owner: &Keypair,
        accounts: aura_core::accounts::ManageSwarm,
        shared_pool_limit_usd: u64,
        now: i64,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(owner, accounts.owner, "owner")?;
        let instruction = self.update_swarm_instruction(accounts, shared_pool_limit_usd, now);
        self.send_instructions(owner, vec![instruction], &[])
    }

    /// Builds `close_swarm_pool`.
    pub fn close_swarm_pool_instruction(
        &self,
        accounts: aura_core::accounts::CloseSwarmPool,
    ) -> Instruction {
        self.with_program_id(instructions::swarm::close_swarm_pool(accounts))
    }

    /// Submits `close_swarm_pool`.
    pub fn close_swarm_pool(
        &self,
        creator: &Keypair,
        accounts: aura_core::accounts::CloseSwarmPool,
    ) -> Result<Signature, SdkError> {
        ensure_signer_matches(creator, accounts.creator, "creator")?;
        let instruction = self.close_swarm_pool_instruction(accounts);
        self.send_instructions(creator, vec![instruction], &[])
    }
}
