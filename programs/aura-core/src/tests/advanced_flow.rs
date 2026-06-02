use aura_policy::{Chain, PolicyConfig, TransactionContext, TransactionType, ViolationCode};

use crate::{
    audit::{AuditEvent, AuditKind},
    deny_pending_transaction, evaluate_batch_preview, finalize_signed_pending,
    program_accounts::{
        sha256_address, snapshot_policy_config, update_health_score, verify_merkle_inclusion,
        ActivityLogAccount, HealthScoreAccount, MemberSpendRecord, PolicyHistoryAccount,
        SessionKeyAccount, SwarmPoolAccount,
    },
    propose_transaction, AgentLifecycleState, AgentReputation, AgentSwarm, ConfigChangeKind,
    DeadMansSwitch, EmergencyMultisig, GuardianChangeAction, PendingConfigChange, TreasuryError,
};
use anchor_lang::prelude::Pubkey;

use super::proposal_flow::{request_signature_for_pending, treasury};

#[test]
fn multisig_override_can_raise_daily_limit() {
    let mut treasury = treasury();
    let mut multisig = EmergencyMultisig {
        required_signatures: 2,
        guardians: vec!["g1".to_string(), "g2".to_string(), "g3".to_string()],
        pending_override: None,
        pending_guardian_change: None,
        guardian_weights: Vec::new(),
        required_approval_weight: 0,
    };

    multisig.propose("g1", 25_000, 1_700_000_000).unwrap();
    multisig.collect_signature("g2").unwrap();
    treasury.attach_multisig(multisig, 1_700_000_000);

    let applied = treasury.apply_ready_override(1_700_000_500).unwrap();

    assert!(applied);
    assert_eq!(treasury.policy_config.daily_limit_usd, 25_000);
}

#[test]
fn swarm_limit_constrains_shared_pool_spend() {
    let mut treasury = treasury();
    let mut swarm = AgentSwarm::new("swarm-01", vec!["agent-02".to_string()], 800);
    swarm.total_swarm_spent_usd = 700; // 700 already spent; adding 200 would exceed the 800 pool limit.
    treasury.attach_swarm(swarm, 1_700_000_000);

    let ai = treasury.ai_authority.clone();
    propose_transaction(
        &mut treasury,
        &ai,
        TransactionContext {
            amount_usd: 200,
            target_chain: Chain::Ethereum,
            tx_type: TransactionType::Transfer,
            protocol_id: None,
            current_timestamp: 43_200,
            expected_output_usd: None,
            actual_output_usd: None,
            quote_age_secs: None,
            counterparty_risk_score: None,
            recipient_or_contract: Some("0xrecipient".to_string()),
        },
        "0xrecipient",
    )
    .expect("proposal should be stored");

    let receipt =
        deny_pending_transaction(&mut treasury, 43_260).expect("denial should return a receipt");

    assert!(!receipt.approved);
    assert_eq!(receipt.violation, ViolationCode::SharedPoolLimit);
}

#[test]
fn reputation_adjusts_effective_daily_limit() {
    let mut treasury = treasury();
    treasury.policy_config.per_tx_limit_usd = 3_000;
    treasury.policy_state.spent_today_usd = 10_500;
    treasury.policy_state.last_reset_timestamp = 43_200;
    treasury.policy_state.hourly_bucket_started_at = 43_200;
    treasury.reputation = AgentReputation {
        total_transactions: 10,
        successful_transactions: 9,
        failed_transactions: 1,
        total_volume_usd: 40_000,
    };
    // Score = 9/10 * 100 = 90 → high tier → 150% of base 10_000 = 15_000.
    // spent_today is 10_500, so the 2_000 tx fits within the 15_000 effective limit.

    let ai = treasury.ai_authority.clone();
    propose_transaction(
        &mut treasury,
        &ai,
        TransactionContext {
            amount_usd: 2_000,
            target_chain: Chain::Ethereum,
            tx_type: TransactionType::Transfer,
            protocol_id: None,
            current_timestamp: 43_200,
            expected_output_usd: None,
            actual_output_usd: None,
            quote_age_secs: None,
            counterparty_risk_score: None,
            recipient_or_contract: Some("0xrecipient".to_string()),
        },
        "0xrecipient",
    )
    .expect("proposal should be stored");

    let (message, _) = request_signature_for_pending(&mut treasury, 43_240);
    let receipt = finalize_signed_pending(&mut treasury, message, "ef".repeat(64), 0, 43_260)
        .expect("execution should succeed");

    assert!(receipt.approved);
    assert_eq!(receipt.effective_daily_limit_usd, 15_000);
}

#[test]
fn batch_evaluation_uses_current_stateful_context() {
    let mut treasury = treasury();
    treasury.policy_config.per_tx_limit_usd = 800;
    treasury.policy_config.daily_limit_usd = 1_200;

    let decisions = evaluate_batch_preview(
        &treasury,
        &[
            TransactionContext {
                amount_usd: 700,
                target_chain: Chain::Ethereum,
                tx_type: TransactionType::Transfer,
                protocol_id: None,
                current_timestamp: 43_200,
                expected_output_usd: None,
                actual_output_usd: None,
                quote_age_secs: None,
                counterparty_risk_score: None,
                recipient_or_contract: Some("0xrecipient".to_string()),
            },
            TransactionContext {
                amount_usd: 700,
                target_chain: Chain::Ethereum,
                tx_type: TransactionType::Transfer,
                protocol_id: None,
                current_timestamp: 43_500,
                expected_output_usd: None,
                actual_output_usd: None,
                quote_age_secs: None,
                counterparty_risk_score: None,
                recipient_or_contract: Some("0xrecipient".to_string()),
            },
        ],
    );

    assert_eq!(decisions.len(), 2);
    assert!(decisions[0].approved);
    assert!(!decisions[1].approved);
    assert_eq!(decisions[1].violation, ViolationCode::DailyLimit);
}

#[test]
fn duplicate_dwallet_registration_is_rejected() {
    let mut treasury = treasury();

    let result = treasury.register_dwallet(
        Chain::Ethereum,
        "dw-eth-02",
        "0xAURA2",
        10_000,
        1_700_000_500,
    );

    assert!(matches!(
        result,
        Err(TreasuryError::DWalletAlreadyRegistered(Chain::Ethereum))
    ));
}

fn queued_tx(amount_usd: u64, timestamp: i64) -> TransactionContext {
    TransactionContext {
        amount_usd,
        target_chain: Chain::Ethereum,
        tx_type: TransactionType::Transfer,
        protocol_id: None,
        current_timestamp: timestamp,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
        recipient_or_contract: Some("0xrecipient".to_string()),
    }
}

#[test]
fn proposal_queue_accepts_three_slots_and_rejects_fourth() {
    let mut treasury = treasury();
    let ai = treasury.ai_authority.clone();

    for index in 0..3 {
        let id = propose_transaction(
            &mut treasury,
            &ai,
            queued_tx(100 + index, 43_200 + index as i64),
            format!("0xrecipient{index}"),
        )
        .expect("queue slot should accept proposal");
        assert_eq!(id, index + 1);
    }

    let result = propose_transaction(&mut treasury, &ai, queued_tx(100, 43_300), "0xoverflow");

    assert!(matches!(
        result,
        Err(TreasuryError::PendingTransactionExists)
    ));
    assert_eq!(treasury.pending_count(), 3);
    assert_eq!(treasury.pending.as_ref().map(|p| p.proposal_id), Some(1));
}

#[test]
fn ai_rotation_requires_timelock_before_key_changes() {
    let mut treasury = treasury();
    let owner = treasury.owner.clone();
    let new_ai = anchor_lang::prelude::Pubkey::new_unique().to_string();
    let old_ai = treasury.ai_authority.clone();

    treasury
        .propose_ai_rotation(&owner, new_ai.clone(), 100)
        .expect("owner can propose rotation");

    let early = treasury.execute_ai_rotation(100 + 3_600);
    assert!(matches!(early, Err(TreasuryError::TimelockNotElapsed)));
    assert_eq!(treasury.ai_authority, old_ai);

    treasury
        .execute_ai_rotation(100 + crate::constants::AI_ROTATION_TIMELOCK_SECS)
        .expect("rotation should execute after timelock");
    assert_eq!(treasury.ai_authority, new_ai);
    assert!(treasury.pending_ai_rotation.is_none());
}

#[test]
fn config_change_records_timelock_and_policy_payload() {
    let treasury = treasury();
    let mut next_policy = treasury.policy_config.clone();
    next_policy.daily_limit_usd = 20_000;

    let change =
        PendingConfigChange::policy_limits(42, 1_000, treasury.owner.clone(), next_policy.clone());

    assert_eq!(change.change_id, 42);
    assert_eq!(change.kind, ConfigChangeKind::PolicyLimits);
    assert_eq!(
        change.executable_after,
        1_000 + crate::constants::CONFIG_CHANGE_TIMELOCK_SECS
    );
    assert_eq!(
        change
            .new_policy_config
            .as_ref()
            .map(|policy| policy.daily_limit_usd),
        Some(20_000)
    );
    assert!(!change.vetoed);
}

#[test]
fn circuit_breaker_auto_pauses_after_violation_spike() {
    let mut treasury = treasury();
    treasury.circuit_breaker.config.violation_threshold = 2;
    treasury.policy_config.per_tx_limit_usd = 10;
    let ai = treasury.ai_authority.clone();

    for index in 0..2 {
        propose_transaction(
            &mut treasury,
            &ai,
            queued_tx(100, 43_200 + index),
            format!("0xdenied{index}"),
        )
        .expect("denied proposal should still be queued");
        let receipt = deny_pending_transaction(&mut treasury, 43_300 + index)
            .expect("denial should clear proposal");
        assert!(!receipt.approved);
    }

    assert!(treasury.execution_paused);
    assert_eq!(treasury.agent_state, AgentLifecycleState::Suspended);
    assert_eq!(treasury.circuit_breaker.total_trips, 1);
}

#[test]
fn lifecycle_deadman_guardian_rotation_and_shutdown_paths_work() {
    let mut treasury = treasury();
    assert_eq!(treasury.agent_state, AgentLifecycleState::Active);

    treasury
        .transition_agent_state(AgentLifecycleState::Suspended, 100)
        .expect("active can suspend");
    treasury
        .transition_agent_state(AgentLifecycleState::Active, 101)
        .expect("suspended can resume");

    treasury.dead_mans_switch = Some(DeadMansSwitch {
        enabled: true,
        inactivity_threshold_secs: 10,
        triggered: false,
        triggered_at: None,
        recovery_authority: "recovery".to_string(),
    });
    treasury.last_owner_activity_at = 100;
    treasury
        .trigger_dead_mans_switch(111)
        .expect("inactivity threshold should trigger");
    assert!(treasury.execution_paused);

    let mut multisig = EmergencyMultisig {
        required_signatures: 2,
        guardians: vec!["g1".to_string(), "g2".to_string()],
        pending_override: None,
        pending_guardian_change: None,
        guardian_weights: Vec::new(),
        required_approval_weight: 0,
    };
    multisig
        .propose_guardian_change("g1", GuardianChangeAction::Add, "g3".to_string(), 200)
        .expect("guardian can propose rotation");
    multisig
        .collect_guardian_change_signature("g2")
        .expect("guardian can cosign rotation");
    let action = multisig
        .execute_guardian_change(201)
        .expect("quorum can execute rotation");
    assert_eq!(action, GuardianChangeAction::Add);
    assert!(multisig.guardians.contains(&"g3".to_string()));

    treasury.attach_multisig(multisig, 202);
    let owner = treasury.owner.clone();
    treasury
        .emergency_shutdown(&owner, "recovery".to_string(), 203)
        .expect("owner can initiate shutdown");
    assert_eq!(treasury.agent_state, AgentLifecycleState::Decommissioning);
    assert_eq!(
        treasury.shutdown_recovery_pubkey.as_deref(),
        Some("recovery")
    );
}

#[test]
fn cooldown_blocks_large_transactions_until_delay_elapsed() {
    let mut treasury = treasury();
    treasury.policy_config = PolicyConfig {
        cooldown_config: Some(aura_policy::CooldownConfig {
            threshold_usd: 500,
            cooldown_secs: 60,
        }),
        ..treasury.policy_config.clone()
    };
    treasury.last_large_tx_at = Some(1_000);
    let ai = treasury.ai_authority.clone();

    let result = propose_transaction(&mut treasury, &ai, queued_tx(600, 1_030), "0xlarge");

    assert!(matches!(
        result,
        Err(TreasuryError::CooldownNotElapsed { remaining_secs: 30 })
    ));

    propose_transaction(&mut treasury, &ai, queued_tx(600, 1_061), "0xlarge")
        .expect("cooldown should elapse");
}

#[test]
fn activity_log_ring_buffer_keeps_recent_queryable_history() {
    let treasury_key = Pubkey::new_unique();
    let owner = Pubkey::new_unique();
    let mut log = ActivityLogAccount {
        bump: 1,
        treasury: treasury_key,
        owner,
        total_events: 0,
        ring_head: 0,
        capacity: 2,
        events: Vec::new(),
    };

    log.append(
        &AuditEvent::new(AuditKind::ProposalCreated, "proposal 1", 10),
        100,
        Some(1),
        Some(100),
        Some(2),
        owner,
        0,
    );
    log.append(
        &AuditEvent::new(AuditKind::ProposalExecuted, "proposal 1 executed", 20),
        101,
        Some(1),
        Some(100),
        Some(2),
        owner,
        0,
    );
    log.append(
        &AuditEvent::new(AuditKind::ProposalDenied, "proposal 2 denied", 30),
        102,
        Some(2),
        Some(900),
        Some(2),
        owner,
        1,
    );

    assert_eq!(log.total_events, 3);
    assert_eq!(log.events.len(), 2);
    assert_eq!(log.ring_head, 1);
    assert_eq!(log.events[0].seq, 2);
    assert!(log.events[0].was_violation);
    assert_eq!(log.events[1].seq, 1);
}

#[test]
fn advanced_pda_helpers_track_history_health_swarm_and_session_limits() {
    let mut treasury = treasury();
    let treasury_key = Pubkey::new_unique();
    let owner = Pubkey::new_unique();

    let mut pool = SwarmPoolAccount {
        bump: 1,
        swarm_id_hash: [7; 32],
        swarm_id: "swarm-01".to_string(),
        creator: owner,
        shared_pool_limit_usd: 1_000,
        total_spent_usd: 0,
        member_count: 0,
        created_at: 100,
        last_spend_at: 100,
        member_spend: Vec::<MemberSpendRecord>::new(),
    };
    pool.record_spend(treasury_key, 250, 120);
    pool.record_spend(treasury_key, 50, 130);
    assert_eq!(pool.total_spent_usd, 300);
    assert_eq!(pool.member_count, 1);
    assert_eq!(pool.member_spend[0].spent_usd, 300);

    let session_key = Pubkey::new_unique();
    let mut session = SessionKeyAccount {
        bump: 1,
        treasury: treasury_key,
        session_key,
        issued_by: owner,
        issued_at: 100,
        expires_at: 1_000,
        revoked: false,
        max_amount_usd_per_tx: Some(500),
        max_daily_spend_usd: Some(700),
        session_spent_today_usd: 250,
        session_last_reset: 100,
        allowed_chains: vec![2],
        allowed_tx_types: vec![0],
        max_proposal_count: Some(1),
        proposals_submitted: 0,
    };
    assert!(session.allows(300, 2, 0, 200));
    session.proposals_submitted = 1;
    assert!(!session.allows(300, 2, 0, 200));

    let mut history = PolicyHistoryAccount {
        bump: 1,
        treasury: treasury_key,
        version_count: 0,
        ring_head: 0,
        snapshots: Vec::new(),
    };
    snapshot_policy_config(&mut history, &treasury.policy_config, owner, 200);
    assert_eq!(history.version_count, 1);
    assert_eq!(
        history.snapshots[0].daily_limit_usd,
        treasury.policy_config.daily_limit_usd
    );

    treasury.policy_state.spent_today_usd = 500;
    let mut health = HealthScoreAccount {
        bump: 1,
        treasury: treasury_key,
        score: 0,
        last_updated_at: 0,
        last_updated_slot: 0,
        reputation_score: 0,
        policy_utilization_score: 0,
        violation_rate_score: 0,
        operational_score: 0,
        liquidity_score: 0,
        execution_paused: false,
        circuit_breaker_active: false,
        pending_queue_depth: 0,
        days_since_last_violation: 0,
    };
    update_health_score(&mut health, treasury_key, &treasury, 300, 99);
    assert_eq!(health.last_updated_slot, 99);
    assert_eq!(health.treasury, treasury_key);
    assert!(health.score > 0);
}

#[test]
fn sanctions_merkle_helper_verifies_non_empty_proofs() {
    use sha2::{Digest, Sha256};

    let leaf_a = sha256_address("0xA");
    let leaf_b = sha256_address("0xB");
    let mut hasher = Sha256::new();
    if leaf_a <= leaf_b {
        hasher.update(leaf_a);
        hasher.update(leaf_b);
    } else {
        hasher.update(leaf_b);
        hasher.update(leaf_a);
    }
    let root: [u8; 32] = hasher.finalize().into();

    assert!(verify_merkle_inclusion(&root, &leaf_a, &[leaf_b]));
    assert!(!verify_merkle_inclusion(
        &root,
        &sha256_address("0xC"),
        &[leaf_b]
    ));
}
