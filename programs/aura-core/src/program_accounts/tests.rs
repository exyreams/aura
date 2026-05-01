use super::*;
use crate::{audit::AuditKind, state::ProtocolDeployment};

#[test]
fn treasury_account_roundtrip_preserves_domain_state() {
    let deployment =
        ProtocolDeployment::devnet_pre_alpha("DKbak7cSattSzqLauaMTYUDFEJu4GTUKFVmjeM7uKNeP")
            .expect("deployment should validate");
    let mut treasury = AgentTreasury::new(
        "agent-01",
        Pubkey::new_unique().to_string(),
        Pubkey::new_unique().to_string(),
        100,
        PolicyConfig::default(),
        deployment,
    );
    treasury
        .register_dwallet(Chain::Ethereum, "dw-01", "0xAURA", 10_000, 100)
        .expect("register should succeed");
    treasury
        .audit_trail
        .record(AuditKind::ProposalCreated, "test", 101);

    let account = TreasuryAccount::from_domain(254, &treasury, 200).expect("serialize");
    let roundtrip = account.to_domain().expect("deserialize");

    assert_eq!(roundtrip.agent_id, treasury.agent_id);
    assert_eq!(roundtrip.owner, treasury.owner);
    assert_eq!(roundtrip.ai_authority, treasury.ai_authority);
    assert_eq!(roundtrip.dwallets.len(), 1);
    assert_eq!(roundtrip.next_proposal_id, treasury.next_proposal_id);
}

#[test]
fn treasury_account_space_budget_covers_populated_state() {
    assert!(
        TREASURY_ACCOUNT_SPACE <= 10 * 1024,
        "treasury account init space must stay within Solana's CPI allocation ceiling"
    );

    let deployment =
        ProtocolDeployment::devnet_pre_alpha("DKbak7cSattSzqLauaMTYUDFEJu4GTUKFVmjeM7uKNeP")
            .expect("deployment should validate");
    let mut treasury = AgentTreasury::new(
        "agent-space-budget",
        Pubkey::new_unique().to_string(),
        Pubkey::new_unique().to_string(),
        1_000,
        PolicyConfig {
            shared_pool_limit_usd: Some(500_000),
            ..PolicyConfig::default()
        },
        deployment,
    );

    for (index, chain) in [
        Chain::Bitcoin,
        Chain::Ethereum,
        Chain::Solana,
        Chain::Polygon,
        Chain::Arbitrum,
        Chain::Optimism,
    ]
    .into_iter()
    .enumerate()
    {
        treasury
            .register_dwallet(
                chain,
                format!("dw-{index}"),
                Pubkey::new_unique().to_string(),
                10_000 + index as u64,
                1_000 + index as i64,
            )
            .expect("register should succeed");
        treasury
            .configure_dwallet_runtime(
                chain,
                Some(Pubkey::new_unique().to_string()),
                Some(Pubkey::new_unique().to_string()),
                Some(hex::encode([index as u8; 32])),
                Some(hex::encode([0xAAu8; 32])),
                1_010 + index as i64,
            )
            .expect("runtime update should succeed");
    }

    treasury.configure_confidential_guardrails(
        Pubkey::new_unique().to_string(),
        Pubkey::new_unique().to_string(),
        Pubkey::new_unique().to_string(),
        1_100,
    );

    treasury
        .register_dwallet(Chain::Solana, "duplicate", "ignored", 0, 0)
        .err();

    treasury.attach_swarm(
        AgentSwarm::new(
            "swarm-alpha",
            vec![
                "agent-space-budget".to_string(),
                "agent-secondary".to_string(),
            ],
            500_000,
        ),
        1_120,
    );
    if let Some(swarm) = treasury.swarm.as_mut() {
        swarm.total_swarm_spent_usd = 25_000;
    }

    treasury.attach_multisig(
        EmergencyMultisig {
            guardians: vec![
                Pubkey::new_unique().to_string(),
                Pubkey::new_unique().to_string(),
                Pubkey::new_unique().to_string(),
            ],
            required_signatures: 2,
            pending_override: Some(OverrideProposal {
                proposal_id: 77,
                new_daily_limit_usd: 25_000,
                signatures_collected: vec![Pubkey::new_unique().to_string()],
                expiration: 1_500,
            }),
            pending_guardian_change: None,
        },
        1_125,
    );

    treasury.pending = Some(PendingTransaction {
        proposal_id: 42,
        proposal_digest: hex::encode([0x11u8; 32]),
        policy_graph_name: "confidential_spend_guardrails".to_string(),
        policy_output_digest: hex::encode([0x22u8; 32]),
        policy_output_ciphertext_account: Some(Pubkey::new_unique().to_string()),
        policy_output_fhe_type: Some(crate::ENCRYPT_FHE_UINT64),
        target_chain: Chain::Solana,
        tx_type: TransactionType::Transfer,
        amount_usd: 250,
        recipient_or_contract: Pubkey::new_unique().to_string(),
        protocol_id: Some(1),
        submitted_at: 1_300,
        expires_at: 2_200,
        last_updated_at: 1_310,
        execution_attempts: 2,
        status: ProposalStatus::SignaturePending,
        decryption_request: Some(PendingDecryptionRequest {
            ciphertext_account: Pubkey::new_unique().to_string(),
            request_account: Pubkey::new_unique().to_string(),
            expected_digest: hex::encode([0x33u8; 32]),
            requested_at: 1_301,
            verified_at: Some(1_302),
            plaintext_sha256: Some(hex::encode([0x44u8; 32])),
        }),
        signature_request: Some(PendingSignatureRequest {
            approval_id: "approval-42".to_string(),
            dwallet_account: Pubkey::new_unique().to_string(),
            message_approval_account: Pubkey::new_unique().to_string(),
            message_digest: hex::encode([0x55u8; 32]),
            message_metadata_digest: hex::encode([0x66u8; 32]),
            signature_scheme: SignatureScheme::EddsaSha512,
            requested_at: 1_303,
        }),
        decision: PolicyDecision {
            approved: true,
            violation: ViolationCode::None,
            next_state: PolicyState::default(),
            effective_daily_limit_usd: 25_000,
            risk_score: 12,
            risk_factors: Vec::new(),
            regulatory_flags: 0,
            trace: vec![
                RuleOutcome::passed("daily_limit", "within budget"),
                RuleOutcome::passed("signature_ready", "message approval requested"),
            ],
        },
        risk_score: 12,
        requires_guardian_cosign: false,
        policy_version: 1,
        compliance_metadata: None,
    });

    let account = TreasuryAccount::from_domain(7, &treasury, 1_400).expect("serialize");
    let mut buf = Vec::new();
    account.try_serialize(&mut buf).expect("anchor serialize");
    let serialized_len = buf.len();

    assert!(
        8 + serialized_len <= TREASURY_ACCOUNT_SPACE,
        "serialized treasury account exceeded fixed allocation: {} > {}",
        8 + serialized_len,
        TREASURY_ACCOUNT_SPACE
    );
}
