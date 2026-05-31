use anchor_lang::prelude::Pubkey;
use aura_policy::{
    ApprovalLadder, ApprovalLevel, Chain, CheckMode, PolicyConfig, PolicyState, TransactionContext,
    TransactionType,
};

use crate::{
    approve_pending_execution, enforce_pending_approval,
    instructions::external_liveness::{enforce_liveness_gate, LivenessGate},
    program_accounts::{
        role_permissions, BudgetEnvelopeAccount, ExposureGroupAccount, ExternalLivenessAccount,
        OperatorRoleAccount, PolicyConfigRecord, PolicyStateRecord,
    },
    propose_transaction, TreasuryError,
};

use super::proposal_flow::treasury;

fn tx(amount_usd: u64, now: i64) -> TransactionContext {
    TransactionContext {
        amount_usd,
        target_chain: Chain::Ethereum,
        tx_type: TransactionType::Transfer,
        protocol_id: None,
        current_timestamp: now,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
        recipient_or_contract: Some("0xrecipient".to_string()),
    }
}

#[test]
fn approval_ladder_metadata_blocks_until_required_level_is_satisfied() {
    let mut treasury = treasury();
    treasury.policy_config.approval_ladder = Some(ApprovalLadder {
        guardian_above_usd: 100,
        multisig_above_usd: 200,
        timelock_above_usd: 1_000,
        deny_above_usd: 5_000,
        risk_guardian_bps: 8_000,
        risk_multisig_bps: 9_000,
        risk_timelock_bps: 10_000,
        timelock_secs: 60,
    });
    let ai = treasury.ai_authority.clone();
    propose_transaction(&mut treasury, &ai, tx(250, 43_200), "0xrecipient")
        .expect("proposal should be queued");

    let pending = treasury.pending.as_ref().expect("pending");
    assert_eq!(
        pending.required_approval_level,
        ApprovalLevel::Multisig.code()
    );
    assert_eq!(pending.satisfied_approval_level, ApprovalLevel::None.code());
    assert!(matches!(
        enforce_pending_approval(pending, 43_210),
        Err(TreasuryError::ApprovalLevelNotSatisfied)
    ));

    let owner = treasury.owner.clone();
    approve_pending_execution(&mut treasury, &owner, 1, ApprovalLevel::Multisig, 43_220)
        .expect("owner can satisfy multisig-level approval");
    enforce_pending_approval(treasury.pending.as_ref().unwrap(), 43_221)
        .expect("approval is now satisfied");
}

#[test]
fn timelock_level_waits_until_earliest_execution_time() {
    let mut treasury = treasury();
    treasury.policy_config.approval_ladder = Some(ApprovalLadder {
        guardian_above_usd: 100,
        multisig_above_usd: 200,
        timelock_above_usd: 300,
        deny_above_usd: 5_000,
        risk_guardian_bps: 8_000,
        risk_multisig_bps: 9_000,
        risk_timelock_bps: 10_000,
        timelock_secs: 90,
    });
    let ai = treasury.ai_authority.clone();
    propose_transaction(&mut treasury, &ai, tx(350, 50_000), "0xrecipient")
        .expect("proposal should be queued");

    let pending = treasury.pending.as_ref().expect("pending");
    assert_eq!(
        pending.required_approval_level,
        ApprovalLevel::Timelock.code()
    );
    assert_eq!(
        pending.satisfied_approval_level,
        ApprovalLevel::Timelock.code()
    );
    assert_eq!(pending.earliest_execution_at, 50_090);
    assert!(matches!(
        enforce_pending_approval(pending, 50_089),
        Err(TreasuryError::PendingExecutionTimelockActive)
    ));
    enforce_pending_approval(pending, 50_090).expect("timelock has elapsed");
}

#[test]
fn approval_ladder_uses_risk_score_even_when_amount_is_small() {
    let mut treasury = treasury();
    treasury.policy_config.max_counterparty_risk_score = Some(90);
    treasury.policy_config.approval_ladder = Some(ApprovalLadder {
        guardian_above_usd: 10_000,
        multisig_above_usd: 20_000,
        timelock_above_usd: 30_000,
        deny_above_usd: 40_000,
        risk_guardian_bps: 2_000,
        risk_multisig_bps: 8_000,
        risk_timelock_bps: 9_500,
        timelock_secs: 60,
    });

    let mut risky = tx(50, 43_200);
    risky.counterparty_risk_score = Some(80);
    let ai = treasury.ai_authority.clone();
    propose_transaction(&mut treasury, &ai, risky, "0xrecipient")
        .expect("proposal should be queued");

    let pending = treasury.pending.as_ref().expect("pending");
    assert!(pending.decision.approved);
    assert!(pending.risk_score > 0);
    assert_eq!(
        pending.required_approval_level,
        ApprovalLevel::Guardian.code()
    );
    assert_eq!(pending.satisfied_approval_level, ApprovalLevel::None.code());
}

#[test]
fn budget_envelope_and_exposure_group_accounts_reset_daily_counters() {
    let treasury_key = Pubkey::new_unique();
    let mut envelope = BudgetEnvelopeAccount {
        bump: 1,
        treasury: treasury_key,
        scope_kind: 0,
        chain: Some(1),
        tx_type: None,
        protocol_id: None,
        daily_limit_usd: 200,
        weekly_limit_usd: 600,
        spent_today_usd: 190,
        spent_week_usd: 400,
        last_reset_day: 1,
        created_at: 1,
        updated_at: 1,
    };
    envelope
        .assert_available(150, 1, 0, None, 86_400 * 2)
        .expect("stale daily spend resets before checking");
    envelope.record_spend(150, 86_400 * 2);
    assert_eq!(envelope.spent_today_usd, 150);
    assert_eq!(envelope.last_reset_day, 2);

    let mut group = ExposureGroupAccount {
        bump: 1,
        authority: Pubkey::new_unique(),
        group_id: [3; 16],
        daily_limit_usd: 300,
        spent_today_usd: 290,
        last_reset_day: 1,
        member_count: 1,
        members: vec![treasury_key],
    };
    group.assert_member(treasury_key).unwrap();
    group
        .assert_available(250, 86_400 * 2)
        .expect("stale group daily spend resets before checking");
    group.record_spend(250, 86_400 * 2);
    assert_eq!(group.spent_today_usd, 250);
}

#[test]
fn budget_envelope_accounts_enforce_scope_and_weekly_boundaries() {
    let treasury_key = Pubkey::new_unique();
    let mut envelope = BudgetEnvelopeAccount {
        bump: 1,
        treasury: treasury_key,
        scope_kind: 2,
        chain: None,
        tx_type: None,
        protocol_id: Some(7),
        daily_limit_usd: 1_000,
        weekly_limit_usd: 600,
        spent_today_usd: 100,
        spent_week_usd: 590,
        last_reset_day: 3,
        created_at: 1,
        updated_at: 1,
    };

    envelope
        .assert_available(500, 1, 0, Some(9), 86_400 * 3)
        .expect("non-matching protocol scope should not consume this envelope");
    assert!(envelope
        .assert_available(20, 1, 0, Some(7), 86_400 * 3)
        .is_err());

    envelope
        .assert_available(600, 1, 0, Some(7), 86_400 * 10)
        .expect("weekly spend resets after seven day boundary");
    envelope.record_spend(600, 86_400 * 10);
    assert_eq!(envelope.spent_today_usd, 600);
    assert_eq!(envelope.spent_week_usd, 600);
    assert_eq!(envelope.last_reset_day, 10);
}

#[test]
fn exposure_group_accounts_reject_non_members_and_overruns() {
    let treasury_key = Pubkey::new_unique();
    let mut group = ExposureGroupAccount {
        bump: 1,
        authority: Pubkey::new_unique(),
        group_id: [4; 16],
        daily_limit_usd: 300,
        spent_today_usd: 250,
        last_reset_day: 5,
        member_count: 1,
        members: vec![treasury_key],
    };

    assert!(group.assert_member(Pubkey::new_unique()).is_err());
    assert!(group.assert_available(51, 86_400 * 5).is_err());
    group
        .assert_available(300, 86_400 * 6)
        .expect("daily exposure resets on the next day");
    group.record_spend(300, 86_400 * 6);
    assert_eq!(group.spent_today_usd, 300);
    assert_eq!(group.last_reset_day, 6);
}

#[test]
fn envelope_and_exposure_record_spend_saturate_instead_of_overflowing() {
    let treasury_key = Pubkey::new_unique();
    let mut envelope = BudgetEnvelopeAccount {
        bump: 1,
        treasury: treasury_key,
        scope_kind: 0,
        chain: Some(1),
        tx_type: None,
        protocol_id: None,
        daily_limit_usd: u64::MAX,
        weekly_limit_usd: u64::MAX,
        spent_today_usd: u64::MAX - 1,
        spent_week_usd: u64::MAX - 1,
        last_reset_day: 7,
        created_at: 1,
        updated_at: 1,
    };
    envelope.record_spend(10, 86_400 * 7);
    assert_eq!(envelope.spent_today_usd, u64::MAX);
    assert_eq!(envelope.spent_week_usd, u64::MAX);

    let mut group = ExposureGroupAccount {
        bump: 1,
        authority: Pubkey::new_unique(),
        group_id: [5; 16],
        daily_limit_usd: u64::MAX,
        spent_today_usd: u64::MAX - 1,
        last_reset_day: 7,
        member_count: 1,
        members: vec![treasury_key],
    };
    group.record_spend(10, 86_400 * 7);
    assert_eq!(group.spent_today_usd, u64::MAX);
}

#[test]
fn operator_roles_and_liveness_accounts_enforce_scoped_permissions() {
    let treasury_key = Pubkey::new_unique();
    let operator = Pubkey::new_unique();
    let role = OperatorRoleAccount {
        bump: 1,
        treasury: treasury_key,
        operator,
        permission_mask: role_permissions::RUN_SIMULATION | role_permissions::REFRESH_LIVENESS,
        expires_at: 1_000,
        revoked: false,
        granted_by: Pubkey::new_unique(),
        granted_at: 1,
    };
    role.assert_permission(
        treasury_key,
        operator,
        role_permissions::RUN_SIMULATION,
        500,
    )
    .expect("role allows simulation");
    assert!(role
        .assert_permission(
            treasury_key,
            operator,
            role_permissions::MANAGE_SCOPED_PAUSE,
            500
        )
        .is_err());
    assert!(role
        .assert_permission(
            treasury_key,
            operator,
            role_permissions::RUN_SIMULATION,
            1_000
        )
        .is_err());

    let liveness = ExternalLivenessAccount {
        bump: 1,
        treasury: treasury_key,
        encrypt_last_verified_at: 100,
        dwallet_last_verified_at: 100,
        balance_oracle_last_verified_at: 100,
        compliance_oracle_last_verified_at: 100,
        max_staleness_secs: 10,
        updated_by: operator,
    };
    liveness.require_encrypt_fresh(110).unwrap();
    assert!(liveness.require_dwallet_fresh(111).is_err());
}

#[test]
fn operator_roles_reject_wrong_identity_and_revocation() {
    let treasury_key = Pubkey::new_unique();
    let operator = Pubkey::new_unique();
    let role = OperatorRoleAccount {
        bump: 1,
        treasury: treasury_key,
        operator,
        permission_mask: role_permissions::REFRESH_LIVENESS,
        expires_at: 1_000,
        revoked: false,
        granted_by: Pubkey::new_unique(),
        granted_at: 1,
    };

    assert!(role
        .assert_permission(
            Pubkey::new_unique(),
            operator,
            role_permissions::REFRESH_LIVENESS,
            10,
        )
        .is_err());
    assert!(role
        .assert_permission(
            treasury_key,
            Pubkey::new_unique(),
            role_permissions::REFRESH_LIVENESS,
            10,
        )
        .is_err());

    let revoked = OperatorRoleAccount {
        revoked: true,
        ..role
    };
    assert!(revoked
        .assert_permission(
            treasury_key,
            operator,
            role_permissions::REFRESH_LIVENESS,
            10,
        )
        .is_err());
}

#[test]
fn external_liveness_boundary_requires_positive_recent_timestamp() {
    assert!(!ExternalLivenessAccount::fresh(0, 10, 1));
    assert!(ExternalLivenessAccount::fresh(100, 10, 110));
    assert!(!ExternalLivenessAccount::fresh(100, 10, 111));
}

fn stale_liveness(treasury_key: Pubkey) -> ExternalLivenessAccount {
    ExternalLivenessAccount {
        bump: 1,
        treasury: treasury_key,
        encrypt_last_verified_at: 100,
        dwallet_last_verified_at: 100,
        balance_oracle_last_verified_at: 100,
        compliance_oracle_last_verified_at: 100,
        max_staleness_secs: 10,
        updated_by: Pubkey::new_unique(),
    }
}

#[test]
fn liveness_gate_warn_allows_within_fail_open_budget() {
    let treasury_key = Pubkey::new_unique();
    let mut config = PolicyConfig::default();
    config.failure_modes.encrypt_liveness = CheckMode::Warn;
    config.failure_modes.max_fail_open_usd = 1_000;
    config.failure_modes.fail_open_budget_usd = 1_000;
    config.failure_modes.fail_open_max_per_window = 1;

    let softened = enforce_liveness_gate(
        treasury_key,
        &PolicyConfigRecord::from_domain(&config),
        &PolicyStateRecord::from_domain(&PolicyState::default()),
        Some(&stale_liveness(treasury_key)),
        LivenessGate::Encrypt,
        500,
        111,
    )
    .expect("warn mode allows stale liveness inside fail-open budget");

    assert!(softened);
}

#[test]
fn liveness_gate_force_enforces_when_fail_open_amount_cap_is_exceeded() {
    let treasury_key = Pubkey::new_unique();
    let mut config = PolicyConfig::default();
    config.failure_modes.dwallet_liveness = CheckMode::Degrade;
    config.failure_modes.max_fail_open_usd = 100;
    config.failure_modes.fail_open_budget_usd = 10_000;
    config.failure_modes.fail_open_max_per_window = 5;

    assert!(enforce_liveness_gate(
        treasury_key,
        &PolicyConfigRecord::from_domain(&config),
        &PolicyStateRecord::from_domain(&PolicyState::default()),
        Some(&stale_liveness(treasury_key)),
        LivenessGate::DWallet,
        500,
        111,
    )
    .is_err());
}

#[test]
fn liveness_gate_degrade_respects_fallback_clamp() {
    let treasury_key = Pubkey::new_unique();
    let mut config = PolicyConfig::default();
    config.failure_modes.dwallet_liveness = CheckMode::Degrade;
    config.failure_modes.max_fail_open_usd = 10_000;
    config.failure_modes.fail_open_budget_usd = 10_000;
    config.failure_modes.fail_open_max_per_window = 5;
    config.failure_modes.stale_fallback_limit_usd = 100;

    assert!(enforce_liveness_gate(
        treasury_key,
        &PolicyConfigRecord::from_domain(&config),
        &PolicyStateRecord::from_domain(&PolicyState::default()),
        Some(&stale_liveness(treasury_key)),
        LivenessGate::DWallet,
        500,
        111,
    )
    .is_err());
}
