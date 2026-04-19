//! Devnet smoke tests for all confidential FHE policy scenarios.
//!
//! Provisions one live Ed25519 dWallet and one Encrypt deposit account, then
//! runs 12 independent treasury PDAs through every policy branch:
//!
//!  1. Per-transaction limit — deny  (amount > per_tx_limit)
//!  2. Per-transaction limit — approve + finalize
//!  3. Daily limit           — deny  (spent_today + amount > daily_limit)
//!  4. Daily limit           — approve + finalize
//!  5. Cancel pending        (owner cancels before decryption)
//!  6. Pause / resume        (propose blocked while paused, unblocked after)
//!  7. Multisig override     (2-of-3 guardians raise daily limit)
//!  8. Swarm shared pool     (first tx approved, second denied when pool full)
//!  9. Single-guardian override (1-of-1 instant quorum)
//! 10. Multi-chain registration (SOL + ETH + BTC dWallets on one treasury)
//! 11. Reputation scaling   (high-rep effective limit > raw limit)
//! 12. Re-configure guardrails (denied under old limits, approved after update)
//!
//! Requires a funded devnet keypair at `PAYER_KEYPAIR` env var or
//! `~/.config/solana/id.json`.
//!
//! Run with:
//!   cargo run -p aura-devnet --bin policy

use anchor_lang::{
    prelude::{system_instruction, Pubkey},
    system_program::ID as SYSTEM_PROGRAM_ID,
    InstructionData, ToAccountMetas,
};
use anyhow::{ensure, Context};
use aura_core::{
    accounts, instruction, ConfigureMultisigArgs, ConfigureSwarmArgs,
    ProposeConfidentialTransactionArgs, RegisterDwalletArgs, ENCRYPT_DEVNET_PROGRAM_ID, ID,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::signature::{Keypair, Signer};

use aura_devnet::*;

// Core helpers

const GUARDIAN_FUNDING_LAMPORTS: u64 = 10_000_000;

fn fund_ephemeral_signers(
    rpc: &RpcClient,
    payer: &Keypair,
    signers: &[&Keypair],
) -> anyhow::Result<()> {
    let transfers = signers
        .iter()
        .map(|signer| {
            system_instruction::transfer(
                &payer.pubkey(),
                &signer.pubkey(),
                GUARDIAN_FUNDING_LAMPORTS,
            )
        })
        .collect();
    send_tx(rpc, payer, transfers, &[]).context("fund ephemeral signer accounts")?;
    Ok(())
}

/// Derive a treasury PDA for `agent_id` owned by `payer`.
fn treasury_pda(payer: &Keypair, agent_id: &str) -> Pubkey {
    pda(
        &[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()],
        &ID,
    )
    .0
}

/// Create a treasury for `agent_id` with the given `policy` and return the
/// `(treasury_pubkey, created_at)` pair.
fn setup_treasury(
    rpc: &RpcClient,
    payer: &Keypair,
    agent_id: &str,
    policy: aura_policy::PolicyConfig,
) -> anyhow::Result<(Pubkey, i64)> {
    let created_at = now_unix();
    let treasury = treasury_pda(payer, agent_id);
    send_tx(
        rpc,
        payer,
        vec![create_treasury_ix(
            payer, treasury, agent_id, created_at, policy,
        )],
        &[],
    )
    .with_context(|| format!("create_treasury '{agent_id}'"))?;
    Ok((treasury, created_at))
}

/// Run the confidential proposal cycle.
///
/// If the proposal survives the public precheck, this waits for the FHE output
/// ciphertext, requests decryption, waits for the plaintext, and confirms the
/// result. If the public precheck denies immediately, there is no policy output
/// ciphertext, so the pending decision is returned as-is without decryption.
async fn run_confidential_cycle(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    daily_limit: u64,
    per_tx_limit: u64,
    spent_today: u64,
    amount: u64,
    created_at: i64,
    // Added to `created_at` to avoid nonce collisions between consecutive
    // calls on the same treasury.
    time_offset: i64,
) -> anyhow::Result<aura_core::AgentTreasury> {
    // 1 — encrypt inputs
    let daily_ct = encrypt_u64(daily_limit, &ID)
        .await
        .context("encrypt daily_limit")?;
    let per_tx_ct = encrypt_u64(per_tx_limit, &ID)
        .await
        .context("encrypt per_tx_limit")?;
    let spent_ct = encrypt_u64(spent_today, &ID)
        .await
        .context("encrypt spent_today")?;
    let amount_ct = encrypt_u64(amount, &ID).await.context("encrypt amount")?;

    // 2 — wait for all four to be verified
    wait_for_ciphertext_verified(rpc, &daily_ct)?;
    wait_for_ciphertext_verified(rpc, &per_tx_ct)?;
    wait_for_ciphertext_verified(rpc, &spent_ct)?;
    wait_for_ciphertext_verified(rpc, &amount_ct)?;

    // 3 — configure guardrails
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
                now: created_at + time_offset,
            }
            .data(),
        }],
        &[],
    )
    .context("configure_confidential_guardrails")?;

    // 4 — propose
    let policy_output = Keypair::new();
    let mut propose_metas = accounts::ProposeConfidentialTransaction {
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
        system_program: SYSTEM_PROGRAM_ID,
    }
    .to_account_metas(None);
    mark_account_meta_signer(&mut propose_metas, policy_output.pubkey())?;
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: propose_metas,
            data: instruction::ProposeConfidentialTransaction {
                args: ProposeConfidentialTransactionArgs {
                    amount_usd: amount,
                    target_chain: 2,
                    tx_type: 0,
                    protocol_id: None,
                    current_timestamp: created_at + time_offset + 1,
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
    )
    .context("propose_confidential_transaction")?;

    let proposed = fetch_treasury_domain(rpc, &treasury)?;
    let needs_policy_decryption = proposed
        .pending
        .as_ref()
        .map(|pending| pending.policy_output_ciphertext_account.is_some())
        .unwrap_or(false);
    if !needs_policy_decryption {
        return Ok(proposed);
    }

    // 5 — wait for output ciphertext
    wait_for_ciphertext_verified(rpc, &policy_output.pubkey())?;

    // 6 — request decryption
    let request_account = Keypair::new();
    let mut req_metas = accounts::RequestPolicyDecryption {
        operator: payer.pubkey(),
        treasury,
        request_account: request_account.pubkey(),
        ciphertext: policy_output.pubkey(),
        encrypt_program: *encrypt_program,
        config: ep.config_pda,
        deposit: ep.deposit_pda,
        caller_program: ID,
        cpi_authority: ep.cpi_authority,
        network_encryption_key: ep.network_key_pda,
        event_authority: ep.event_authority,
        system_program: SYSTEM_PROGRAM_ID,
    }
    .to_account_metas(None);
    mark_account_meta_signer(&mut req_metas, request_account.pubkey())?;
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: req_metas,
            data: instruction::RequestPolicyDecryption {
                now: created_at + time_offset + 2,
            }
            .data(),
        }],
        &[&request_account],
    )
    .context("request_policy_decryption")?;

    // 7 — wait for plaintext
    wait_for_decryption_ready(rpc, &request_account.pubkey())
        .context("decryption did not complete")?;

    // 8 — confirm
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfirmPolicyDecryption {
                operator: payer.pubkey(),
                treasury,
                request_account: request_account.pubkey(),
            }
            .to_account_metas(None),
            data: instruction::ConfirmPolicyDecryption {
                now: created_at + time_offset + 3,
            }
            .data(),
        }],
        &[],
    )
    .context("confirm_policy_decryption")?;

    fetch_treasury_domain(rpc, &treasury)
}

// Scenarios

/// [1] Per-transaction limit — deny (amount 800 > per_tx_limit 500)
async fn scenario_per_tx_deny(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[1] Per-tx limit — DENY");
    let agent_id = format!("pol-pertx-deny-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            per_tx_limit_usd: 500,
            daily_limit_usd: 10_000,
            daytime_hourly_limit_usd: 10_000,
            nighttime_hourly_limit_usd: 10_000,
            velocity_limit_usd: 10_000,
            ..Default::default()
        },
    )?;
    let domain = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        10_000,
        500,
        0,
        800,
        created_at,
        0,
    )
    .await?;
    let pending = domain.pending.context("[1] no pending")?;
    ensure!(!pending.decision.approved, "[1] should be denied");
    println!("  ✓ denied — violation={}", pending.decision.violation);
    execute_denied(rpc, payer, treasury, created_at + 20)
}

/// [2] Per-transaction limit — approve + finalize (amount 250 < per_tx_limit 500)
async fn scenario_per_tx_approve(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[2] Per-tx limit — APPROVE + finalize");
    let agent_id = format!("pol-pertx-approve-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            per_tx_limit_usd: 500,
            daily_limit_usd: 10_000,
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

    let domain = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        10_000,
        500,
        0,
        250,
        created_at,
        2,
    )
    .await?;
    let pending = domain.pending.context("[2] no pending")?;
    ensure!(pending.decision.approved, "[2] should be approved");
    println!("  ✓ approved");

    let mut dw = connect_dwallet_client().await?;
    finalize_via_dwallet(
        rpc,
        payer,
        &mut dw,
        treasury,
        dwallet_program,
        live,
        created_at + 20,
    )
    .await
}

/// [3] Daily limit — deny (spent_today 800 + amount 400 > daily_limit 1 000)
async fn scenario_daily_deny(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[3] Daily limit — DENY");
    let agent_id = format!("pol-daily-deny-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 1_000,
            per_tx_limit_usd: 5_000,
            daytime_hourly_limit_usd: 10_000,
            nighttime_hourly_limit_usd: 10_000,
            velocity_limit_usd: 10_000,
            ..Default::default()
        },
    )?;
    let domain = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        1_000,
        5_000,
        800,
        400,
        created_at,
        0,
    )
    .await?;
    let pending = domain.pending.context("[3] no pending")?;
    ensure!(!pending.decision.approved, "[3] should be denied");
    println!("  ✓ denied — violation={}", pending.decision.violation);
    execute_denied(rpc, payer, treasury, created_at + 20)
}

/// [4] Daily limit — approve + finalize (spent_today 200 + amount 300 < daily_limit 1 000)
async fn scenario_daily_approve(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[4] Daily limit — APPROVE + finalize");
    let agent_id = format!("pol-daily-approve-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 1_000,
            per_tx_limit_usd: 5_000,
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

    let domain = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        1_000,
        5_000,
        200,
        300,
        created_at,
        2,
    )
    .await?;
    let pending = domain.pending.context("[4] no pending")?;
    ensure!(pending.decision.approved, "[4] should be approved");
    println!("  ✓ approved");

    let mut dw = connect_dwallet_client().await?;
    finalize_via_dwallet(
        rpc,
        payer,
        &mut dw,
        treasury,
        dwallet_program,
        live,
        created_at + 20,
    )
    .await
}

/// [5] Cancel pending — owner cancels a confidential proposal before decryption
async fn scenario_cancel_pending(
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
async fn scenario_pause_resume(
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

/// [7] Emergency multisig override — 2-of-3 guardians raise daily limit from 500 to 2 000
async fn scenario_multisig_override(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[7] Multisig override 2-of-3");
    let g1 = Keypair::new();
    let g2 = Keypair::new();
    let g3 = Keypair::new();
    fund_ephemeral_signers(rpc, payer, &[&g1, &g2, &g3])?;

    let agent_id = format!("pol-multisig-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 500,
            per_tx_limit_usd: 5_000,
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

    // Attach 2-of-3 multisig
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfigureMultisig {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::ConfigureMultisig {
                args: ConfigureMultisigArgs {
                    required_signatures: 2,
                    guardians: vec![g1.pubkey(), g2.pubkey(), g3.pubkey()],
                    timestamp: created_at + 2,
                },
            }
            .data(),
        }],
        &[],
    )?;
    ensure!(
        fetch_treasury_domain(rpc, &treasury)?.multisig.is_some(),
        "[7] multisig not attached"
    );
    println!("  ✓ 2-of-3 multisig configured (daily_limit=500)");

    // 600 USD should be denied under limit 500
    let domain_deny = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        500,
        5_000,
        0,
        600,
        created_at,
        3,
    )
    .await?;
    ensure!(
        !domain_deny
            .pending
            .context("[7] no pending")?
            .decision
            .approved,
        "[7] should be denied before override"
    );
    println!("  ✓ 600 USD denied under original limit");
    execute_denied(rpc, payer, treasury, created_at + 30)?;

    // g1 proposes override to 2 000
    send_tx(
        rpc,
        &g1,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ProposeOverride {
                guardian: g1.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::ProposeOverride {
                new_daily_limit_usd: 2_000,
                now: created_at + 40,
            }
            .data(),
        }],
        &[],
    )?;
    println!("  ✓ g1 proposed override (1/2 signatures)");

    // g2 collects — quorum reached, override applied immediately
    send_tx(
        rpc,
        &g2,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::CollectOverrideSignature {
                guardian: g2.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::CollectOverrideSignature {
                now: created_at + 41,
            }
            .data(),
        }],
        &[],
    )?;

    let domain_override = fetch_treasury_domain(rpc, &treasury)?;
    ensure!(
        domain_override.policy_config.daily_limit_usd == 2_000,
        "[7] daily limit should be 2 000"
    );
    ensure!(
        domain_override
            .multisig
            .as_ref()
            .map(|m| m.pending_override.is_none())
            .unwrap_or(false),
        "[7] pending override should be cleared"
    );
    println!("  ✓ quorum reached, daily limit raised to 2 000");

    // 600 USD should now be approved
    let mut dw = connect_dwallet_client().await?;
    let domain_approve = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        2_000,
        5_000,
        0,
        600,
        created_at,
        50,
    )
    .await?;
    ensure!(
        domain_approve
            .pending
            .context("[7] no pending")?
            .decision
            .approved,
        "[7] should be approved after override"
    );
    println!("  ✓ 600 USD approved under raised limit");
    finalize_via_dwallet(
        rpc,
        payer,
        &mut dw,
        treasury,
        dwallet_program,
        live,
        created_at + 80,
    )
    .await
}

/// [8] Swarm shared-pool — first tx (200) approved, second (200) denied when pool full
async fn scenario_swarm_pool(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[8] Swarm shared-pool limit");
    let agent_id = format!("pol-swarm-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 10_000,
            per_tx_limit_usd: 10_000,
            daytime_hourly_limit_usd: 10_000,
            nighttime_hourly_limit_usd: 10_000,
            velocity_limit_usd: 10_000,
            shared_pool_limit_usd: Some(300),
            ..Default::default()
        },
    )?;
    send_tx(
        rpc,
        payer,
        vec![register_dwallet_ix(payer, treasury, live, created_at + 1)],
        &[],
    )?;

    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfigureSwarm {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::ConfigureSwarm {
                args: ConfigureSwarmArgs {
                    swarm_id: format!("swarm-{seed}"),
                    member_agents: vec![agent_id.clone()],
                    shared_pool_limit_usd: 300,
                    timestamp: created_at + 2,
                },
            }
            .data(),
        }],
        &[],
    )?;
    ensure!(
        fetch_treasury_domain(rpc, &treasury)?.swarm.is_some(),
        "[8] swarm not attached"
    );
    println!("  ✓ swarm configured (pool_limit=300)");

    // First tx: 200 USD — within pool
    let mut dw = connect_dwallet_client().await?;
    let d1 = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        10_000,
        10_000,
        0,
        200,
        created_at,
        3,
    )
    .await?;
    ensure!(
        d1.pending.context("[8] no pending (1)")?.decision.approved,
        "[8] first tx should be approved"
    );
    println!("  ✓ first tx (200) approved");
    finalize_via_dwallet(
        rpc,
        payer,
        &mut dw,
        treasury,
        dwallet_program,
        live,
        created_at + 30,
    )
    .await?;
    println!("  ✓ finalized, pool spent=200");

    // Second tx: 200 USD — pool has 100 remaining, should deny
    let d2 = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        10_000,
        10_000,
        0,
        200,
        created_at,
        40,
    )
    .await?;
    ensure!(
        !d2.pending.context("[8] no pending (2)")?.decision.approved,
        "[8] second tx should be denied"
    );
    println!("  ✓ second tx (200) denied — pool exhausted");
    execute_denied(rpc, payer, treasury, created_at + 80)
}

/// [9] Single-guardian override — 1-of-1 quorum reached instantly on propose
async fn scenario_single_guardian_override(
    rpc: &RpcClient,
    payer: &Keypair,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[9] Single-guardian override (1-of-1)");
    let guardian = Keypair::new();
    fund_ephemeral_signers(rpc, payer, &[&guardian])?;

    let agent_id = format!("pol-1of1-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 100,
            per_tx_limit_usd: 5_000,
            ..Default::default()
        },
    )?;

    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfigureMultisig {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::ConfigureMultisig {
                args: ConfigureMultisigArgs {
                    required_signatures: 1,
                    guardians: vec![guardian.pubkey()],
                    timestamp: created_at + 1,
                },
            }
            .data(),
        }],
        &[],
    )?;

    // Single propose → quorum → override applied in same instruction
    send_tx(
        rpc,
        &guardian,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ProposeOverride {
                guardian: guardian.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::ProposeOverride {
                new_daily_limit_usd: 5_000,
                now: created_at + 2,
            }
            .data(),
        }],
        &[],
    )?;

    let domain = fetch_treasury_domain(rpc, &treasury)?;
    ensure!(
        domain.policy_config.daily_limit_usd == 5_000,
        "[9] daily limit should be 5 000"
    );
    ensure!(
        domain
            .multisig
            .as_ref()
            .map(|m| m.pending_override.is_none())
            .unwrap_or(false),
        "[9] pending override should be cleared"
    );
    println!("  ✓ 1-of-1 override applied instantly, daily_limit=5 000");
    Ok(())
}

/// [10] Multi-chain registration — SOL + ETH + BTC dWallets on one treasury
async fn scenario_multi_chain(
    rpc: &RpcClient,
    payer: &Keypair,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[10] Multi-chain dWallet registration");
    let agent_id = format!("pol-multichain-{seed}");
    let (treasury, created_at) =
        setup_treasury(rpc, payer, &agent_id, aura_policy::PolicyConfig::default())?;

    send_tx(
        rpc,
        payer,
        vec![register_dwallet_ix(payer, treasury, live, created_at + 1)],
        &[],
    )?;

    // Mock Ethereum dWallet (chain code 1)
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::RegisterDwallet {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::RegisterDwallet {
                args: RegisterDwalletArgs {
                    chain: 1,
                    dwallet_id: format!("eth-mock-{seed}"),
                    address: "0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef".to_string(),
                    balance_usd: 0,
                    dwallet_account: None,
                    authorized_user_pubkey: None,
                    message_metadata_digest: None,
                    public_key_hex: None,
                    timestamp: created_at + 2,
                },
            }
            .data(),
        }],
        &[],
    )?;

    // Mock Bitcoin dWallet (chain code 0)
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::RegisterDwallet {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::RegisterDwallet {
                args: RegisterDwalletArgs {
                    chain: 0,
                    dwallet_id: format!("btc-mock-{seed}"),
                    address: "bc1qmockaddress00000000000000000000000000000".to_string(),
                    balance_usd: 0,
                    dwallet_account: None,
                    authorized_user_pubkey: None,
                    message_metadata_digest: None,
                    public_key_hex: None,
                    timestamp: created_at + 3,
                },
            }
            .data(),
        }],
        &[],
    )?;

    let domain = fetch_treasury_domain(rpc, &treasury)?;
    ensure!(
        domain.dwallets.len() == 3,
        "[10] expected 3 dWallets, got {}",
        domain.dwallets.len()
    );
    ensure!(
        domain.dwallets.contains_key(&aura_policy::Chain::Solana),
        "[10] SOL missing"
    );
    ensure!(
        domain.dwallets.contains_key(&aura_policy::Chain::Ethereum),
        "[10] ETH missing"
    );
    ensure!(
        domain.dwallets.contains_key(&aura_policy::Chain::Bitcoin),
        "[10] BTC missing"
    );
    println!("  ✓ SOL + ETH + BTC dWallets registered");
    Ok(())
}

/// [11] Reputation scaling — amount 500 approved under reputation-adjusted limit
/// (raw per_tx=400, reputation 150 % → effective=600, amount=500 → approve)
async fn scenario_reputation_scaling(
    rpc: &RpcClient,
    payer: &Keypair,
    encrypt_program: &Pubkey,
    ep: &EncryptPdas,
    dwallet_program: &Pubkey,
    live: &LiveDWallet,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[11] Reputation-adjusted limit scaling");
    let agent_id = format!("pol-rep-{seed}");
    let (treasury, created_at) = setup_treasury(
        rpc,
        payer,
        &agent_id,
        aura_policy::PolicyConfig {
            daily_limit_usd: 10_000,
            per_tx_limit_usd: 400,
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

    // We pass the reputation-adjusted per_tx_limit (600) as the ciphertext so
    // the FHE graph sees the scaled value. Real deployments compute this
    // off-chain via `policy_config.effective_daily_limit_usd(score)` before
    // encrypting the ciphertext that gets written to the guardrails account.
    let mut dw = connect_dwallet_client().await?;
    let domain = run_confidential_cycle(
        rpc,
        payer,
        treasury,
        encrypt_program,
        ep,
        10_000,
        600, /* effective per_tx */
        0,
        500,
        created_at,
        2,
    )
    .await?;
    ensure!(
        domain.pending.context("[11] no pending")?.decision.approved,
        "[11] should be approved"
    );
    println!("  ✓ 500 approved under effective per_tx_limit=600 (raw=400, 150 % rep)");
    finalize_via_dwallet(
        rpc,
        payer,
        &mut dw,
        treasury,
        dwallet_program,
        live,
        created_at + 30,
    )
    .await
}

/// [12] Re-configure guardrails — denied under old limits, approved after update
async fn scenario_reconfigure_guardrails(
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

// Main

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let rpc = devnet_rpc();
    let encrypt_program: Pubkey = ENCRYPT_DEVNET_PROGRAM_ID.parse()?;
    let dwallet_program: Pubkey = aura_core::DWALLET_DEVNET_PROGRAM_ID.parse()?;

    println!("Payer: {}", payer.pubkey());

    // shared setup
    println!("\nEnsuring Encrypt deposit account...");
    let ep = ensure_encrypt_deposit(&rpc, &payer, &encrypt_program)?;

    println!("\nProvisioning live dWallet via DKG...");
    let mut dwallet_client = connect_dwallet_client().await?;
    let live = provision_dwallet(&rpc, &payer, &mut dwallet_client, &dwallet_program).await?;
    println!("  dWallet PDA: {}", live.dwallet_pda);
    transfer_dwallet_authority(&rpc, &payer, &dwallet_program, &live.dwallet_pda)?;
    drop(dwallet_client); // each scenario opens its own connection for finalize

    let seed = now_unix();

    // run scenarios sequentially
    scenario_per_tx_deny(&rpc, &payer, &encrypt_program, &ep, seed).await?;
    println!("  ✓ [1] passed");

    scenario_per_tx_approve(
        &rpc,
        &payer,
        &encrypt_program,
        &ep,
        &dwallet_program,
        &live,
        seed,
    )
    .await?;
    println!("  ✓ [2] passed");

    scenario_daily_deny(&rpc, &payer, &encrypt_program, &ep, seed).await?;
    println!("  ✓ [3] passed");

    scenario_daily_approve(
        &rpc,
        &payer,
        &encrypt_program,
        &ep,
        &dwallet_program,
        &live,
        seed,
    )
    .await?;
    println!("  ✓ [4] passed");

    scenario_cancel_pending(&rpc, &payer, &encrypt_program, &ep, seed).await?;
    println!("  ✓ [5] passed");

    scenario_pause_resume(&rpc, &payer, &encrypt_program, &ep, seed).await?;
    println!("  ✓ [6] passed");

    scenario_multisig_override(
        &rpc,
        &payer,
        &encrypt_program,
        &ep,
        &dwallet_program,
        &live,
        seed,
    )
    .await?;
    println!("  ✓ [7] passed");

    scenario_swarm_pool(
        &rpc,
        &payer,
        &encrypt_program,
        &ep,
        &dwallet_program,
        &live,
        seed,
    )
    .await?;
    println!("  ✓ [8] passed");

    scenario_single_guardian_override(&rpc, &payer, seed).await?;
    println!("  ✓ [9] passed");

    scenario_multi_chain(&rpc, &payer, &live, seed).await?;
    println!("  ✓ [10] passed");

    scenario_reputation_scaling(
        &rpc,
        &payer,
        &encrypt_program,
        &ep,
        &dwallet_program,
        &live,
        seed,
    )
    .await?;
    println!("  ✓ [11] passed");

    scenario_reconfigure_guardrails(
        &rpc,
        &payer,
        &encrypt_program,
        &ep,
        &dwallet_program,
        &live,
        seed,
    )
    .await?;
    println!("  ✓ [12] passed");

    println!("\n✓ All 12 AURA policy scenarios passed on devnet.");
    Ok(())
}
