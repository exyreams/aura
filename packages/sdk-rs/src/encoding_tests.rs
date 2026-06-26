//! Encoding and decoding correctness tests.
//!
//! These complement the compile-time surface tests: they execute against real
//! Anchor serialization to guarantee that
//!
//! 1. every program instruction's discriminator matches the canonical
//!    `sha256("global:<name>")[..8]` value (computed independently here, so the
//!    check is not circular), and
//! 2. the client's instruction builders emit those discriminators and target
//!    the configured program ID, and
//! 3. account decoding fails gracefully on malformed data.

use anchor_lang::Discriminator;
use sha2::{Digest, Sha256};
use solana_sdk::pubkey::Pubkey;

use crate::{
    accounts::{decode_treasury_account, decode_treasury_domain},
    AuraClient, SdkError,
};

/// Canonical Anchor instruction discriminator: first 8 bytes of
/// `sha256("global:<snake_case_name>")`.
fn global_discriminator(name: &str) -> [u8; 8] {
    let mut hasher = Sha256::new();
    hasher.update(b"global:");
    hasher.update(name.as_bytes());
    let digest = hasher.finalize();
    let mut out = [0u8; 8];
    out.copy_from_slice(&digest[..8]);
    out
}

/// Asserts every `aura_core::instruction` type carries the canonical
/// discriminator for its on-chain name. Exhaustive over the full 161-instruction
/// surface, so any rename, reorder, or stale binding is caught.
#[test]
fn all_instruction_discriminators_are_canonical() {
    macro_rules! check {
        ($($ty:ident => $name:literal),* $(,)?) => {{
            $(
                assert_eq!(
                    <aura_core::instruction::$ty as Discriminator>::DISCRIMINATOR,
                    &global_discriminator($name)[..],
                    concat!("discriminator mismatch for ", $name),
                );
            )*
        }};
    }

    check! {
        AbandonProposal => "abandon_proposal",
        ApplyBillingTemplate => "apply_billing_template",
        ApplyOrgProfile => "apply_org_profile",
        ApplyPolicyPreset => "apply_policy_preset",
        ApplyPolicyTemplate => "apply_policy_template",
        ApplyPolicyTemplateParameterized => "apply_policy_template_parameterized",
        ApprovePendingExecution => "approve_pending_execution",
        ArmCapabilityLoosen => "arm_capability_loosen",
        AttestPolicy => "attest_policy",
        BreakGlassRecover => "break_glass_recover",
        BreakGlassTransferAuthority => "break_glass_transfer_authority",
        CancelAiRotation => "cancel_ai_rotation",
        CancelPending => "cancel_pending",
        CheckInvariants => "check_invariants",
        CheckPolicyCpi => "check_policy_cpi",
        ClearAddressList => "clear_address_list",
        ClearScheduledIntentInFlight => "clear_scheduled_intent_in_flight",
        CloseActivityLog => "close_activity_log",
        CloseAddressList => "close_address_list",
        CloseBillingTemplate => "close_billing_template",
        CloseConditionalProposal => "close_conditional_proposal",
        CloseConfidentialGuardrails => "close_confidential_guardrails",
        CloseExposureGroup => "close_exposure_group",
        CloseExternalLiveness => "close_external_liveness",
        CloseFeeSchedule => "close_fee_schedule",
        CloseFeeVault => "close_fee_vault",
        CloseHealthScore => "close_health_score",
        ClosePolicyHistory => "close_policy_history",
        ClosePolicyTemplate => "close_policy_template",
        CloseScheduledIntent => "close_scheduled_intent",
        CloseSessionKey => "close_session_key",
        CloseSnapshot => "close_snapshot",
        CloseSwarmPool => "close_swarm_pool",
        CloseTreasuryAnalytics => "close_treasury_analytics",
        CollectFees => "collect_fees",
        CollectOverrideSignature => "collect_override_signature",
        CommitProtocolConfig => "commit_protocol_config",
        ConfigureApprovalLadder => "configure_approval_ladder",
        ConfigureBudgetEnvelope => "configure_budget_envelope",
        ConfigureConfidentialGuardrails => "configure_confidential_guardrails",
        ConfigureLivenessGuardrails => "configure_liveness_guardrails",
        ConfigureMultisig => "configure_multisig",
        ConfigureSwarm => "configure_swarm",
        ConfigureTrustPolicy => "configure_trust_policy",
        ConfirmPolicyDecryption => "confirm_policy_decryption",
        ConfirmSettlement => "confirm_settlement",
        CreateBillingTemplate => "create_billing_template",
        CreatePolicyTemplate => "create_policy_template",
        CreateScheduledIntent => "create_scheduled_intent",
        CreateTreasury => "create_treasury",
        DepositFees => "deposit_fees",
        DisableConfidentialGuardrails => "disable_confidential_guardrails",
        DiscardCanary => "discard_canary",
        EmergencyRevokeAgent => "emergency_revoke_agent",
        EmergencyShutdown => "emergency_shutdown",
        ExecuteAiRotation => "execute_ai_rotation",
        ExecuteConfigChange => "execute_config_change",
        ExecuteGuardianRotation => "execute_guardian_rotation",
        ExecuteOwnershipHandover => "execute_ownership_handover",
        ExecutePending => "execute_pending",
        ExecuteScheduledIntent => "execute_scheduled_intent",
        FinalizeExecution => "finalize_execution",
        GrantOperatorRole => "grant_operator_role",
        InitActivityLog => "init_activity_log",
        InitAddressList => "init_address_list",
        InitConfidentialGuardrails => "init_confidential_guardrails",
        InitDwalletState => "init_dwallet_state",
        InitExposureGroup => "init_exposure_group",
        InitExternalLiveness => "init_external_liveness",
        InitFeeSchedule => "init_fee_schedule",
        InitFeeVault => "init_fee_vault",
        InitHealthScore => "init_health_score",
        InitPolicyHistory => "init_policy_history",
        InitProtocolConfig => "init_protocol_config",
        InitSwarmPool => "init_swarm_pool",
        InitTreasuryAnalytics => "init_treasury_analytics",
        InitTrustIdentity => "init_trust_identity",
        IssueSessionKey => "issue_session_key",
        JoinExposureGroup => "join_exposure_group",
        JoinSwarm => "join_swarm",
        LeaveExposureGroup => "leave_exposure_group",
        LeaveSwarm => "leave_swarm",
        ManageAddressList => "manage_address_list",
        MarkSettlementBroadcast => "mark_settlement_broadcast",
        MigrateTreasury => "migrate_treasury",
        NominateSuccessorOwner => "nominate_successor_owner",
        PauseExecution => "pause_execution",
        PauseScheduledIntent => "pause_scheduled_intent",
        PromoteCanary => "promote_canary",
        ProposeAiRotation => "propose_ai_rotation",
        ProposeBatch => "propose_batch",
        ProposeConditionalTransaction => "propose_conditional_transaction",
        ProposeConfidentialBatch => "propose_confidential_batch",
        ProposeConfidentialTransaction => "propose_confidential_transaction",
        ProposeConfigChange => "propose_config_change",
        ProposeGuardianRotation => "propose_guardian_rotation",
        ProposeOverride => "propose_override",
        ProposeTransaction => "propose_transaction",
        ReconcileDwalletBalance => "reconcile_dwallet_balance",
        RecordDeposit => "record_deposit",
        RecordPolicySnapshot => "record_policy_snapshot",
        RefreshAssetBalance => "refresh_asset_balance",
        RefreshDwalletBalance => "refresh_dwallet_balance",
        RefreshExternalLiveness => "refresh_external_liveness",
        RefreshHealthScore => "refresh_health_score",
        RefreshVerifiedAssetBalance => "refresh_verified_asset_balance",
        RegisterAgent => "register_agent",
        RegisterChainProfile => "register_chain_profile",
        RegisterDwallet => "register_dwallet",
        RegisterRecoveryDestination => "register_recovery_destination",
        ReleaseDwalletSpend => "release_dwallet_spend",
        RemoveBudgetEnvelope => "remove_budget_envelope",
        RemoveDwallet => "remove_dwallet",
        RemoveRecipientLimit => "remove_recipient_limit",
        RequestPolicyDecryption => "request_policy_decryption",
        ReserveDwalletSpend => "reserve_dwallet_spend",
        ResetConfidentialCounters => "reset_confidential_counters",
        RestoreTrust => "restore_trust",
        ResubmitProposal => "resubmit_proposal",
        ResumeScheduledIntent => "resume_scheduled_intent",
        RevokeAgent => "revoke_agent",
        RevokeOperatorRole => "revoke_operator_role",
        RevokeSessionKey => "revoke_session_key",
        RollbackPolicy => "rollback_policy",
        RotateConfidentialGuardrails => "rotate_confidential_guardrails",
        RotateDwalletAuthority => "rotate_dwallet_authority",
        SetAgentCapability => "set_agent_capability",
        SetAgentTripwires => "set_agent_tripwires",
        SetAssetFeed => "set_asset_feed",
        SetAssetOracleFeed => "set_asset_oracle_feed",
        SetDefaultChain => "set_default_chain",
        SetDwalletLabel => "set_dwallet_label",
        SetDwalletLimits => "set_dwallet_limits",
        SetDwalletStatus => "set_dwallet_status",
        SetFeeSplits => "set_fee_splits",
        SetRecipientLimit => "set_recipient_limit",
        SetScopedPause => "set_scoped_pause",
        SettleDwalletSpend => "settle_dwallet_spend",
        SimulatePolicy => "simulate_policy",
        StartCanary => "start_canary",
        TakeSnapshot => "take_snapshot",
        TransitionAgentState => "transition_agent_state",
        TriggerDeadMansSwitch => "trigger_dead_mans_switch",
        TryTrigger => "try_trigger",
        UpdateAddressListEntry => "update_address_list_entry",
        UpdateBillingTemplate => "update_billing_template",
        UpdateChainProfile => "update_chain_profile",
        UpdateConfidentialGuardrails => "update_confidential_guardrails",
        UpdateExposureGroup => "update_exposure_group",
        UpdateFeeRecipient => "update_fee_recipient",
        UpdateFeeSchedule => "update_fee_schedule",
        UpdateOperatorRole => "update_operator_role",
        UpdatePolicyTemplate => "update_policy_template",
        UpdateProtocolConfig => "update_protocol_config",
        UpdateScheduledIntent => "update_scheduled_intent",
        UpdateSessionKey => "update_session_key",
        UpdateSwarm => "update_swarm",
        UpdateTreasuryMetadata => "update_treasury_metadata",
        VetoConfigChange => "veto_config_change",
        WithdrawUnusedFees => "withdraw_unused_fees",
        WritePolicyReceipt => "write_policy_receipt",
    }
}

/// Builds an instruction with a localhost client and asserts it targets the
/// program ID and carries the canonical discriminator for `name`.
fn assert_builder(instruction: solana_sdk::instruction::Instruction, name: &str) {
    assert_eq!(
        instruction.program_id,
        aura_core::ID,
        "program id for {name}"
    );
    assert!(
        instruction.data.len() >= 8,
        "instruction data for {name} is shorter than a discriminator"
    );
    assert_eq!(
        &instruction.data[..8],
        &global_discriminator(name)[..],
        "builder discriminator mismatch for {name}"
    );
    assert!(
        !instruction.accounts.is_empty(),
        "instruction {name} has no account metas"
    );
}

/// Exercises the client's `Pubkey`-shaped instruction builders end to end:
/// each produces real Anchor bytes with the correct discriminator.
#[test]
fn client_builders_emit_canonical_encodings() {
    let client = AuraClient::devnet();
    let a = Pubkey::new_unique();
    let b = Pubkey::new_unique();
    let c = Pubkey::new_unique();

    let (_, create) = client.create_treasury_instruction(
        a,
        crate::types::CreateTreasuryArgs {
            agent_id: "agent-1".to_string(),
            ai_authority: b,
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
    assert_builder(create, "create_treasury");

    assert_builder(
        client.pause_execution_instruction(a, b, true, 0),
        "pause_execution",
    );
    assert_builder(client.cancel_pending_instruction(a, b, 0), "cancel_pending");
    assert_builder(
        client.propose_override_instruction(a, b, 1_000, 0),
        "propose_override",
    );
    assert_builder(
        client.collect_override_signature_instruction(a, b, 0),
        "collect_override_signature",
    );
    assert_builder(
        client.propose_ai_rotation_instruction(a, b, c, 0),
        "propose_ai_rotation",
    );
    assert_builder(
        client.execute_ai_rotation_instruction(a, b, 0),
        "execute_ai_rotation",
    );
    assert_builder(
        client.cancel_ai_rotation_instruction(a, b, 0),
        "cancel_ai_rotation",
    );
    assert_builder(
        client.propose_guardian_rotation_instruction(a, b, 0, c, 0),
        "propose_guardian_rotation",
    );
    assert_builder(
        client.execute_guardian_rotation_instruction(a, b, 0),
        "execute_guardian_rotation",
    );
    assert_builder(
        client.veto_config_change_instruction(a, b, 1, 0),
        "veto_config_change",
    );
    assert_builder(
        client.execute_config_change_instruction(a, b, 1, 0),
        "execute_config_change",
    );
    assert_builder(
        client.emergency_shutdown_instruction(a, b, c, 0),
        "emergency_shutdown",
    );
    assert_builder(
        client.transition_agent_state_instruction(a, b, 1, 0),
        "transition_agent_state",
    );
    assert_builder(
        client.trigger_dead_mans_switch_instruction(b, 0),
        "trigger_dead_mans_switch",
    );
    assert_builder(
        client.confirm_policy_decryption_instruction(a, b, c, 0, 0),
        "confirm_policy_decryption",
    );
    assert_builder(
        client.configure_confidential_guardrails_instruction(a, b, c, c, c, 0),
        "configure_confidential_guardrails",
    );
    assert_builder(
        client.propose_config_change_instruction(
            a,
            b,
            1,
            aura_core::PolicyConfigRecord::from_domain(&aura_policy::PolicyConfig::default()),
            0,
        ),
        "propose_config_change",
    );
    assert_builder(
        client.configure_multisig_instruction(
            a,
            b,
            crate::types::ConfigureMultisigArgs {
                required_signatures: 2,
                guardians: vec![Pubkey::new_unique(), Pubkey::new_unique()],
                guardian_weights: Vec::new(),
                required_approval_weight: 0,
                timestamp: 0,
            },
        ),
        "configure_multisig",
    );
}

/// Confirms a distinct-discriminator pair that shares an account context is not
/// accidentally cross-wired (a classic copy-paste hazard).
#[test]
fn paused_and_resumed_scheduled_intent_differ() {
    assert_ne!(
        global_discriminator("pause_scheduled_intent"),
        global_discriminator("resume_scheduled_intent"),
    );
    assert_eq!(
        <aura_core::instruction::PauseScheduledIntent as Discriminator>::DISCRIMINATOR,
        &global_discriminator("pause_scheduled_intent")[..],
    );
    assert_eq!(
        <aura_core::instruction::ResumeScheduledIntent as Discriminator>::DISCRIMINATOR,
        &global_discriminator("resume_scheduled_intent")[..],
    );
}

#[test]
fn decode_treasury_account_rejects_empty_data() {
    assert!(matches!(
        decode_treasury_account(&[]),
        Err(SdkError::AccountDecode { .. })
    ));
}

#[test]
fn decode_treasury_account_rejects_wrong_discriminator() {
    let mut data = vec![0u8; 512];
    data[..8].copy_from_slice(&[1, 2, 3, 4, 5, 6, 7, 8]);
    assert!(matches!(
        decode_treasury_account(&data),
        Err(SdkError::AccountDecode { .. })
    ));
}

#[test]
fn decode_treasury_domain_propagates_decode_error() {
    assert!(matches!(
        decode_treasury_domain(&[0u8; 4]),
        Err(SdkError::AccountDecode { .. })
    ));
}
