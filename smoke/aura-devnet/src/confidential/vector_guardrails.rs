//! Devnet smoke test for the confidential vector FHE guardrail flow.
//!
//! This covers both vector outcomes through the two-transaction lifecycle:
//! `propose_confidential_vector_transaction` creates the pending proposal, then
//! `execute_pending_vector_fhe` submits the Encrypt vector graph in a fresh
//! transaction to avoid sharing the proposal instruction's BPF heap.

use std::time::Duration;

use anchor_lang::{
    prelude::Pubkey, system_program::ID as SYSTEM_PROGRAM_ID, InstructionData, ToAccountMetas,
};
use anyhow::{ensure, Context};
use aura_core::{
    accounts, instruction, ExecutePendingVectorFheArgs, ProposeConfidentialTransactionArgs,
    ENCRYPT_DEVNET_PROGRAM_ID, ID,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::signature::{Keypair, Signer};

use crate::*;

pub async fn run() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let rpc = devnet_rpc();
    let encrypt_program: Pubkey = ENCRYPT_DEVNET_PROGRAM_ID.parse()?;
    let ep = ensure_encrypt_deposit(&rpc, &payer, &encrypt_program)?;
    let seed = now_unix();

    let dwallet_program: Pubkey = aura_core::DWALLET_DEVNET_PROGRAM_ID.parse()?;

    run_vector_scenario(
        &rpc,
        &payer,
        None,
        None,
        &encrypt_program,
        &dwallet_program,
        &ep,
        &format!("conf-vector-deny-{seed}"),
        650,
        false,
    )
    .await?;
    println!("  ✓ Vector scenario A passed (denial)");

    println!("\nProvisioning live dWallet via DKG for vector approval...");
    let mut dwallet_client = connect_dwallet_client().await?;
    let live = provision_dwallet(&rpc, &payer, &mut dwallet_client, &dwallet_program).await?;
    println!("  dWallet PDA: {}", live.dwallet_pda);
    transfer_dwallet_authority(&rpc, &payer, &dwallet_program, &live.dwallet_pda)?;

    run_vector_scenario(
        &rpc,
        &payer,
        Some(&live),
        Some(&mut dwallet_client),
        &encrypt_program,
        &dwallet_program,
        &ep,
        &format!("conf-vector-approve-{seed}"),
        250,
        true,
    )
    .await?;
    println!("  ✓ Vector scenario B passed (approval + finalize)");

    println!("\n✓ AURA devnet confidential vector smoke test passed.");
    Ok(())
}

#[allow(clippy::too_many_arguments)]
async fn run_vector_scenario(
    rpc: &RpcClient,
    payer: &Keypair,
    live: Option<&LiveDWallet>,
    dwallet_client: Option<
        &mut ika_grpc::d_wallet_service_client::DWalletServiceClient<tonic::transport::Channel>,
    >,
    encrypt_program: &Pubkey,
    dwallet_program: &Pubkey,
    ep: &EncryptPdas,
    agent_id: &str,
    amount: u64,
    expect_approved: bool,
) -> anyhow::Result<()> {
    println!("\nVector scenario '{agent_id}'  amount={amount}  expect_approved={expect_approved}");
    let created_at = now_unix();
    let (treasury, _) = pda(
        &[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()],
        &ID,
    );

    println!("  Encrypting vector guardrail and amount ciphertexts...");
    let guardrail_vector = encrypt_u64_vector(&[1_000, 600, 0], &ID)
        .await
        .context("encrypt guardrail vector")?;
    let spend_delta_vector = encrypt_u64_vector(&[0u64.wrapping_sub(amount), 0, amount], &ID)
        .await
        .context("encrypt spend delta vector")?;
    let comparison_vector = encrypt_u64_vector(&[amount, amount], &ID)
        .await
        .context("encrypt comparison vector")?;
    let flag_indices_vector = encrypt_u64_vector(&vector_flag_indices(), &ID)
        .await
        .context("encrypt flag indices vector")?;
    let policy_output = encrypt_u64_vector(&[], &ID)
        .await
        .context("encrypt policy output vector")?;

    println!("  Waiting for vector ciphertexts to be verified on-chain...");
    wait_for_ciphertext_verified_with_timeout(
        rpc,
        &guardrail_vector,
        Duration::from_secs(600),
    )
    .context("guardrail vector ct not verified")?;
    wait_for_ciphertext_verified_with_timeout(rpc, &spend_delta_vector, Duration::from_secs(600))
        .context("spend delta vector ct not verified")?;
    wait_for_ciphertext_verified_with_timeout(rpc, &comparison_vector, Duration::from_secs(600))
        .context("comparison vector ct not verified")?;
    wait_for_ciphertext_verified_with_timeout(rpc, &flag_indices_vector, Duration::from_secs(600))
        .context("flag indices vector ct not verified")?;
    wait_for_ciphertext_verified_with_timeout(rpc, &policy_output, Duration::from_secs(600))
        .context("policy output vector ct not verified")?;

    send_tx(
        rpc,
        payer,
        vec![create_treasury_ix(
            payer,
            treasury,
            agent_id,
            created_at,
            aura_policy::PolicyConfig {
                daytime_hourly_limit_usd: 10_000,
                nighttime_hourly_limit_usd: 10_000,
                velocity_limit_usd: 10_000,
                ..Default::default()
            },
        )],
        &[],
    )
    .context("create_treasury failed")?;
    activate_treasury(rpc, payer, treasury, created_at + 1).context("activate_treasury failed")?;

    if let Some(live_dw) = live {
        send_tx(
            rpc,
            payer,
            vec![register_dwallet_ix(payer, treasury, live_dw, created_at + 2)],
            &[],
        )
        .context("register_dwallet failed")?;
    }

    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ConfigureConfidentialVectorGuardrails {
                owner: payer.pubkey(),
                treasury,
                guardrail_vector_ciphertext: guardrail_vector,
            }
            .to_account_metas(None),
            data: instruction::ConfigureConfidentialVectorGuardrails {
                now: created_at + 3,
            }
            .data(),
        }],
        &[],
    )
    .context("configure_confidential_vector_guardrails failed")?;

    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ProposeConfidentialVectorTransaction {
                ai_authority: payer.pubkey(),
                treasury,
                guardrail_vector_ciphertext: guardrail_vector,
                spend_delta_vector_ciphertext: spend_delta_vector,
                comparison_vector_ciphertext: comparison_vector,
                flag_indices_vector_ciphertext: flag_indices_vector,
                policy_result_vector_ciphertext: policy_output,
                encrypt_program: *encrypt_program,
                external_liveness: None,
            }
            .to_account_metas(None),
                data: instruction::ProposeConfidentialVectorTransaction {
                    args: ProposeConfidentialTransactionArgs {
                    amount_usd: amount,
                    target_chain: 2,
                    tx_type: 0,
                    protocol_id: None,
                    current_timestamp: created_at + 4,
                    expected_output_usd: None,
                    actual_output_usd: None,
                    quote_age_secs: None,
                    counterparty_risk_score: None,
                    recipient_or_contract: payer.pubkey().to_string(),
                },
            }
            .data(),
        }],
        &[],
    )
    .context("propose_confidential_vector_transaction failed")?;

    let domain = fetch_treasury_domain(rpc, &treasury)?;
    let pending = domain
        .pending
        .as_ref()
        .context("no pending proposal after vector proposal")?;
    ensure!(
        pending.policy_output_ciphertext_account.as_deref() == Some(&policy_output.to_string()),
        "pending vector proposal did not store expected policy output ciphertext"
    );
    let proposal_id = pending.proposal_id;

    let execute_metas = accounts::ExecutePendingVectorFhe {
        ai_authority: payer.pubkey(),
        treasury,
        guardrail_vector_ciphertext: guardrail_vector,
        spend_delta_vector_ciphertext: spend_delta_vector,
        comparison_vector_ciphertext: comparison_vector,
        flag_indices_vector_ciphertext: flag_indices_vector,
        policy_result_vector_ciphertext: policy_output,
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
    send_tx(
        rpc,
        payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: execute_metas,
            data: instruction::ExecutePendingVectorFhe {
                args: ExecutePendingVectorFheArgs {
                    proposal_id,
                    current_timestamp: created_at + 5,
                },
            }
            .data(),
        }],
        &[],
    )
    .context("execute_pending_vector_fhe failed")?;

    println!("  Waiting for vector FHE output ciphertext to be verified...");
    wait_for_ciphertext_verified_with_timeout(
        rpc,
        &policy_output,
        Duration::from_secs(600),
    )
    .context("vector policy output ciphertext not verified")?;

    let request_account = Keypair::new();
    let mut req_metas = accounts::RequestPolicyDecryption {
        operator: payer.pubkey(),
        treasury,
        request_account: request_account.pubkey(),
        ciphertext: policy_output,
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
                now: created_at + 6,
            }
            .data(),
        }],
        &[&request_account],
    )
    .context("request_policy_decryption failed")?;

    println!("  Waiting for vector decryption plaintext...");
    wait_for_decryption_ready_with_timeout(
        rpc,
        &request_account.pubkey(),
        Duration::from_secs(600),
    )
    .context("vector decryption request did not complete")?;

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
                now: created_at + 7,
            }
            .data(),
        }],
        &[],
    )
    .context("confirm_policy_decryption failed")?;

    let domain = fetch_treasury_domain(rpc, &treasury)?;
    let pending = domain
        .pending
        .as_ref()
        .context("no pending proposal after vector confirm")?;
    ensure!(
        pending.decision.approved == expect_approved,
        "vector approval result did not match expectation"
    );
    println!(
        "  Vector decryption confirmed — approved={} violation={}",
        pending.decision.approved, pending.decision.violation
    );

    if expect_approved {
        let live_dw = live.context("approved vector scenario requires a registered dWallet")?;
        let dw_client = dwallet_client.context("approved vector scenario requires dWallet gRPC client")?;
        finalize_via_dwallet(
            rpc,
            payer,
            dw_client,
            treasury,
            dwallet_program,
            live_dw,
            created_at + 8,
        )
        .await?;
    } else {
        execute_denied(rpc, payer, treasury, created_at + 8)
            .context("execute_pending (vector denial) failed")?;
        println!("  Vector denied proposal cleared.");
    }

    Ok(())
}

fn vector_flag_indices() -> Vec<u64> {
    (0usize..1024)
        .map(|index| match index {
            0 => 3,
            1 => 4,
            _ => (index + 3).min(1023) as u64,
        })
        .collect()
}
