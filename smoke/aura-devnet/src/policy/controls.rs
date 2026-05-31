//! Pending proposal, pause, and guardrail reconfiguration smoke scenarios.

use super::{harness::*, prelude::*};

/// [5] Cancel pending — owner cancels a confidential proposal before decryption
pub(super) async fn scenario_cancel_pending(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[5] Cancel pending");
    let agent_id = format!("pol-cancel-{seed}");
    let (treasury, created_at) =
        setup_treasury(rpc, payer, &agent_id, aura_policy::PolicyConfig::default())?;

    // Encrypt and verify inputs, configure guardrails
    let daily_ct = encrypt_u64(10_000, &ID).await?;
    let per_tx_ct = encrypt_u64(1_000, &ID).await?;
    let spent_ct = encrypt_u64(0, &ID).await?;
    let amount_ct = encrypt_u64(200, &ID).await?;
    wait_for_ciphertext_verified(rpc, &daily_ct)?;
    wait_for_ciphertext_verified(rpc, &per_tx_ct)?;
    wait_for_ciphertext_verified(rpc, &spent_ct)?;
    wait_for_ciphertext_verified(rpc, &amount_ct)?;

    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfigureConfidentialGuardrails {
                owner: payer.pubkey(),
                treasury,
                daily_limit_ciphertext: daily_ct,
                per_tx_limit_ciphertext: per_tx_ct,
                spent_today_ciphertext: spent_ct,
            }
            .to_account_metas(None),
            data: instruction::ConfigureConfidentialGuardrails {
                now: created_at + 1,
            }
            .data(),
        }],
        &[],
    )?;

    // Propose (only needs to exist, not wait for FHE)
    let policy_output = Keypair::new();
    let mut metas = accounts::ProposeConfidentialTransaction {
        ai_authority: payer.pubkey(),
        treasury,
        daily_limit_ciphertext: daily_ct,
        per_tx_limit_ciphertext: per_tx_ct,
        spent_today_ciphertext: spent_ct,
        amount_ciphertext: amount_ct,
        policy_output_ciphertext: policy_output.pubkey(),
        encrypt_program: *encrypt_program,
        config: ep.config_pda,
        deposit: ep.deposit_pda,
        caller_program: ID,
        cpi_authority: ep.cpi_authority,
        network_encryption_key: ep.network_key_pda,
        event_authority: ep.event_authority,
        external_liveness: None,
        system_program: SYSTEM_PROGRAM_ID,
    }
    .to_account_metas(None);
    mark_account_meta_signer(&mut metas, policy_output.pubkey())?;
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: metas,
            data: instruction::ProposeConfidentialTransaction {
                args: ProposeConfidentialTransactionArgs {
                    amount_usd: 200,
                    target_chain: 2,
                    tx_type: 0,
                    protocol_id: None,
                    current_timestamp: created_at + 2,
                    expected_output_usd: None,
                    actual_output_usd: None,
                    quote_age_secs: None,
                    counterparty_risk_score: None,
                    recipient_or_contract: payer.pubkey().to_string(),
                },
            }
            .data(),
        }],
        &[&policy_output],
    )?;

    ensure!(
        fetch_treasury_domain(rpc, &treasury)?.pending.is_some(),
        "[5] pending should exist"
    );

    // Cancel
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::CancelPending {
                owner: payer.pubkey(),
                treasury,
                dwallet_state: None,
            }
            .to_account_metas(None),
            data: instruction::CancelPending {
                now: created_at + 3,
            }
            .data(),
        }],
        &[],
    )?;

    ensure!(
        fetch_treasury_domain(rpc, &treasury)?.pending.is_none(),
        "[5] pending should be cleared"
    );
    println!("  ✓ cancelled");
    Ok(())
}

/// [6] Pause / resume — propose blocked while paused, unblocked after resume
pub(super) async fn scenario_pause_resume(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[6] Pause / resume");
    let agent_id = format!("pol-pause-{seed}");
    let (treasury, created_at) =
        setup_treasury(rpc, payer, &agent_id, aura_policy::PolicyConfig::default())?;

    // Pause
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::PauseExecution {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::PauseExecution {
                paused: true,
                now: created_at + 1,
            }
            .data(),
        }],
        &[],
    )?;
    ensure!(
        fetch_treasury_domain(rpc, &treasury)?.execution_paused,
        "[6] should be paused"
    );
    println!("  ✓ paused");

    // Encrypt inputs (so we can attempt a proposal)
    let daily_ct = encrypt_u64(10_000, &ID).await?;
    let per_tx_ct = encrypt_u64(1_000, &ID).await?;
    let spent_ct = encrypt_u64(0, &ID).await?;
    let amount_ct = encrypt_u64(200, &ID).await?;
    wait_for_ciphertext_verified(rpc, &daily_ct)?;
    wait_for_ciphertext_verified(rpc, &per_tx_ct)?;
    wait_for_ciphertext_verified(rpc, &spent_ct)?;
    wait_for_ciphertext_verified(rpc, &amount_ct)?;

    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfigureConfidentialGuardrails {
                owner: payer.pubkey(),
                treasury,
                daily_limit_ciphertext: daily_ct,
                per_tx_limit_ciphertext: per_tx_ct,
                spent_today_ciphertext: spent_ct,
            }
            .to_account_metas(None),
            data: instruction::ConfigureConfidentialGuardrails {
                now: created_at + 2,
            }
            .data(),
        }],
        &[],
    )?;

    // Attempt propose while paused — must fail
    let dummy_output = Keypair::new();
    let mut metas = accounts::ProposeConfidentialTransaction {
        ai_authority: payer.pubkey(),
        treasury,
        daily_limit_ciphertext: daily_ct,
        per_tx_limit_ciphertext: per_tx_ct,
        spent_today_ciphertext: spent_ct,
        amount_ciphertext: amount_ct,
        policy_output_ciphertext: dummy_output.pubkey(),
        encrypt_program: *encrypt_program,
        config: ep.config_pda,
        deposit: ep.deposit_pda,
        caller_program: ID,
        cpi_authority: ep.cpi_authority,
        network_encryption_key: ep.network_key_pda,
        event_authority: ep.event_authority,
        external_liveness: None,
        system_program: SYSTEM_PROGRAM_ID,
    }
    .to_account_metas(None);
    mark_account_meta_signer(&mut metas, dummy_output.pubkey())?;
    let paused_result = send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: metas,
            data: instruction::ProposeConfidentialTransaction {
                args: ProposeConfidentialTransactionArgs {
                    amount_usd: 200,
                    target_chain: 2,
                    tx_type: 0,
                    protocol_id: None,
                    current_timestamp: created_at + 3,
                    expected_output_usd: None,
                    actual_output_usd: None,
                    quote_age_secs: None,
                    counterparty_risk_score: None,
                    recipient_or_contract: payer.pubkey().to_string(),
                },
            }
            .data(),
        }],
        &[&dummy_output],
    );
    ensure!(
        paused_result.is_err(),
        "[6] propose should fail while paused"
    );
    println!("  ✓ propose rejected while paused");

    // Resume
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::PauseExecution {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::PauseExecution {
                paused: false,
                now: created_at + 4,
            }
            .data(),
        }],
        &[],
    )?;
    ensure!(
        !fetch_treasury_domain(rpc, &treasury)?.execution_paused,
        "[6] should be resumed"
    );
    println!("  ✓ resumed");

    // Propose after resume must succeed
    let policy_output = Keypair::new();
    let mut metas2 = accounts::ProposeConfidentialTransaction {
        ai_authority: payer.pubkey(),
        treasury,
        daily_limit_ciphertext: daily_ct,
        per_tx_limit_ciphertext: per_tx_ct,
        spent_today_ciphertext: spent_ct,
        amount_ciphertext: amount_ct,
        policy_output_ciphertext: policy_output.pubkey(),
        encrypt_program: *encrypt_program,
        config: ep.config_pda,
        deposit: ep.deposit_pda,
        caller_program: ID,
        cpi_authority: ep.cpi_authority,
        network_encryption_key: ep.network_key_pda,
        event_authority: ep.event_authority,
        external_liveness: None,
        system_program: SYSTEM_PROGRAM_ID,
    }
    .to_account_metas(None);
    mark_account_meta_signer(&mut metas2, policy_output.pubkey())?;
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: metas2,
            data: instruction::ProposeConfidentialTransaction {
                args: ProposeConfidentialTransactionArgs {
                    amount_usd: 200,
                    target_chain: 2,
                    tx_type: 0,
                    protocol_id: None,
                    current_timestamp: created_at + 5,
                    expected_output_usd: None,
                    actual_output_usd: None,
                    quote_age_secs: None,
                    counterparty_risk_score: None,
                    recipient_or_contract: payer.pubkey().to_string(),
                },
            }
            .data(),
        }],
        &[&policy_output],
    )?;
    ensure!(
        fetch_treasury_domain(rpc, &treasury)?.pending.is_some(),
        "[6] proposal should exist after resume"
    );
    println!("  ✓ proposal accepted after resume");

    // Clean up
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::CancelPending {
                owner: payer.pubkey(),
                treasury,
                dwallet_state: None,
            }
            .to_account_metas(None),
            data: instruction::CancelPending {
                now: created_at + 6,
            }
            .data(),
        }],
        &[],
    )?;
    Ok(())
}

/// [12] Re-configure guardrails — denied under old limits, approved after update
pub(super) async fn scenario_reconfigure_guardrails(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[12] Re-configure guardrails mid-lifecycle");
    let agent_id = format!("pol-reconfig-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 200,
            per_tx_limit_usd: 100,
            daytime_hourly_limit_usd: 10_000,
            nighttime_hourly_limit_usd: 10_000,
            velocity_limit_usd: 10_000,
            ..Default::default()
        },
    )?;
    send_tx(
        rpc,
        payer,
        vec![register_dwallet_ix(payer, treasury, live, created_at + 1)],
        &[],
    )?;

    // 150 denied under per_tx=100
    let d1 = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        200,
        100,
        0,
        150,
        created_at,
        2,
    )
    .await?;
    ensure!(
        !d1.pending.context("[12] no pending (1)")?.decision.approved,
        "[12] should be denied"
    );
    println!("  ✓ denied under original limits (per_tx=100, amount=150)");
    execute_denied(rpc, payer, treasury, created_at + 25)?;

    // Re-configure with higher limits
    let new_daily = encrypt_u64(2_000, &ID).await?;
    let new_per_tx = encrypt_u64(500, &ID).await?;
    let new_spent = encrypt_u64(0, &ID).await?;
    wait_for_ciphertext_verified(rpc, &new_daily)?;
    wait_for_ciphertext_verified(rpc, &new_per_tx)?;
    wait_for_ciphertext_verified(rpc, &new_spent)?;

    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfigureConfidentialGuardrails {
                owner: payer.pubkey(),
                treasury,
                daily_limit_ciphertext: new_daily,
                per_tx_limit_ciphertext: new_per_tx,
                spent_today_ciphertext: new_spent,
            }
            .to_account_metas(None),
            data: instruction::ConfigureConfidentialGuardrails {
                now: created_at + 30,
            }
            .data(),
        }],
        &[],
    )?;
    println!("  ✓ guardrails re-configured (per_tx=500, daily=2 000)");

    // 150 approved under per_tx=500
    let mut dw = connect_dwallet_client().await?;
    let d2 = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        2_000,
        500,
        0,
        150,
        created_at,
        35,
    )
    .await?;
    ensure!(
        d2.pending.context("[12] no pending (2)")?.decision.approved,
        "[12] should be approved after reconfig"
    );
    println!("  ✓ approved under new limits (per_tx=500, amount=150)");
    finalize_via_dwallet(
        rpc,
        payer,
        &mut dw,
        treasury,
        dwallet_program,
        live,
        created_at + 60,
    )
    .await
}
