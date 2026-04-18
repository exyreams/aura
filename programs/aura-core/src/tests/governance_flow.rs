use crate::{EmergencyMultisig, ProtocolFees, TreasuryError};

use super::proposal_flow::treasury;

// EmergencyMultisig: propose

#[test]
fn unauthorized_guardian_cannot_propose_override() {
    let mut multisig = EmergencyMultisig {
        required_signatures: 2,
        guardians: vec!["g1".to_string(), "g2".to_string()],
        pending_override: None,
    };

    let result = multisig.propose("stranger", 20_000, 1_700_000_000);

    assert!(matches!(result, Err(TreasuryError::UnauthorizedGuardian)));
    assert!(multisig.pending_override.is_none());
}

#[test]
fn propose_override_sets_pending_with_correct_fields() {
    let mut multisig = EmergencyMultisig {
        required_signatures: 2,
        guardians: vec!["g1".to_string(), "g2".to_string()],
        pending_override: None,
    };

    multisig.propose("g1", 30_000, 1_700_000_000).unwrap();

    let proposal = multisig.pending_override.as_ref().unwrap();
    assert_eq!(proposal.new_daily_limit_usd, 30_000);
    assert_eq!(proposal.signatures_collected, vec!["g1"]);
    assert_eq!(proposal.expiration, 1_700_000_000 + 3_600);
}

// EmergencyMultisig: collect_signature

#[test]
fn collect_signature_fails_without_active_proposal() {
    let mut multisig = EmergencyMultisig {
        required_signatures: 2,
        guardians: vec!["g1".to_string(), "g2".to_string()],
        pending_override: None,
    };

    let result = multisig.collect_signature("g2");

    assert!(matches!(result, Err(TreasuryError::NoActiveOverride)));
}

#[test]
fn unauthorized_guardian_cannot_collect_signature() {
    let mut multisig = EmergencyMultisig {
        required_signatures: 2,
        guardians: vec!["g1".to_string(), "g2".to_string()],
        pending_override: None,
    };
    multisig.propose("g1", 20_000, 1_700_000_000).unwrap();

    let result = multisig.collect_signature("stranger");

    assert!(matches!(result, Err(TreasuryError::UnauthorizedGuardian)));
}

#[test]
fn duplicate_signature_is_deduplicated() {
    let mut multisig = EmergencyMultisig {
        required_signatures: 2,
        guardians: vec!["g1".to_string(), "g2".to_string()],
        pending_override: None,
    };
    multisig.propose("g1", 20_000, 1_700_000_000).unwrap();
    multisig.collect_signature("g1").unwrap();

    let proposal = multisig.pending_override.as_ref().unwrap();
    assert_eq!(proposal.signatures_collected.len(), 1);
}

#[test]
fn full_multisig_flow_propose_collect_apply() {
    let mut treasury = treasury();
    let mut multisig = EmergencyMultisig {
        required_signatures: 2,
        guardians: vec!["g1".to_string(), "g2".to_string(), "g3".to_string()],
        pending_override: None,
    };

    multisig.propose("g1", 50_000, 1_700_000_000).unwrap();
    multisig.collect_signature("g2").unwrap();

    assert!(multisig.ready(1_700_000_000));
    assert!(!multisig.ready(1_700_004_000)); // expired

    treasury.attach_multisig(multisig, 1_700_000_000);
    let applied = treasury.apply_ready_override(1_700_000_500).unwrap();

    assert!(applied);
    assert_eq!(treasury.policy_config.daily_limit_usd, 50_000);
    assert!(treasury
        .multisig
        .as_ref()
        .unwrap()
        .pending_override
        .is_none());
}

#[test]
fn override_not_applied_when_insufficient_signatures() {
    let mut treasury = treasury();
    let mut multisig = EmergencyMultisig {
        required_signatures: 3,
        guardians: vec!["g1".to_string(), "g2".to_string(), "g3".to_string()],
        pending_override: None,
    };

    multisig.propose("g1", 50_000, 1_700_000_000).unwrap();
    multisig.collect_signature("g2").unwrap();
    // only 2 of 3 required

    treasury.attach_multisig(multisig, 1_700_000_000);
    let applied = treasury.apply_ready_override(1_700_000_500).unwrap();

    assert!(!applied);
    assert_eq!(treasury.policy_config.daily_limit_usd, 10_000); // unchanged
}

#[test]
fn override_not_applied_when_expired() {
    let mut treasury = treasury();
    let mut multisig = EmergencyMultisig {
        required_signatures: 2,
        guardians: vec!["g1".to_string(), "g2".to_string()],
        pending_override: None,
    };

    multisig.propose("g1", 50_000, 1_700_000_000).unwrap();
    multisig.collect_signature("g2").unwrap();

    treasury.attach_multisig(multisig, 1_700_000_000);
    // apply after expiration (proposal_id + 3600 = 1_700_003_600)
    let applied = treasury.apply_ready_override(1_700_004_000).unwrap();

    assert!(!applied);
    assert_eq!(treasury.policy_config.daily_limit_usd, 10_000); // unchanged
}

#[test]
fn apply_ready_override_records_audit_event() {
    let mut treasury = treasury();
    let mut multisig = EmergencyMultisig {
        required_signatures: 1,
        guardians: vec!["g1".to_string()],
        pending_override: None,
    };
    multisig.propose("g1", 25_000, 1_700_000_000).unwrap();
    treasury.attach_multisig(multisig, 1_700_000_000);
    treasury.apply_ready_override(1_700_000_100).unwrap();

    let events = treasury.audit_trail.events();
    assert!(events
        .iter()
        .any(|e| e.detail.contains("daily limit raised to 25000")));
}

// ProtocolFees

#[test]
fn fee_for_amount_computes_correct_basis_points() {
    let fees = ProtocolFees::default(); // transaction_fee_bps = 10

    assert_eq!(fees.fee_for_amount(10_000), 10); // 10 bps of $10,000 = $10
    assert_eq!(fees.fee_for_amount(1_000), 1); // 10 bps of $1,000 = $1
    assert_eq!(fees.fee_for_amount(500), 0); // rounds down
}

#[test]
fn fee_for_amount_zero_returns_zero() {
    let fees = ProtocolFees::default();
    assert_eq!(fees.fee_for_amount(0), 0);
}

#[test]
fn fee_for_amount_saturates_on_overflow() {
    let fees = ProtocolFees {
        transaction_fee_bps: u64::MAX,
        ..ProtocolFees::default()
    };
    // saturating_mul should not panic
    let _ = fees.fee_for_amount(u64::MAX);
}

#[test]
fn custom_fee_bps_is_applied_correctly() {
    let fees = ProtocolFees {
        transaction_fee_bps: 50, // 0.5%
        ..ProtocolFees::default()
    };

    assert_eq!(fees.fee_for_amount(10_000), 50);
    assert_eq!(fees.fee_for_amount(200), 1);
}
