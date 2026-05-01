use anchor_lang::prelude::Pubkey;
use aura_policy::{ApprovalLadder, ApprovalLevel, Chain, TransactionContext, TransactionType};

use crate::{
    approve_pending_execution, enforce_pending_approval,
    program_accounts::{
        role_permissions, BudgetEnvelopeAccount, ExposureGroupAccount, ExternalLivenessAccount,
        OperatorRoleAccount,
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
