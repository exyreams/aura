//! Devnet smoke test for the confidential (FHE scalar) signing flow.
//!
//! Runs two end-to-end scenarios against the live Ika devnet:
//!
//! **Scenario A — Denial**  
//!   amount (650) > per_tx_limit (600) → FHE graph outputs violation_code=1 → denied
//!
//! **Scenario B — Approval + finalize**  
//!   amount (250) < per_tx_limit (600), daily_limit (1 000) → approved → finalized via dWallet
//!
//! Both scenarios share one provisioned dWallet but use independent treasury PDAs.
//!
//! Requires a funded devnet keypair at `PAYER_KEYPAIR` env var or
//! `~/.config/solana/id.json`.
//!
//! Run with:
//!   cargo run -p aura-devnet --bin confidential

use anchor_lang::{
    prelude::Pubkey, system_program::ID as SYSTEM_PROGRAM_ID, InstructionData, ToAccountMetas,
};
use anyhow::{ensure, Context};
use aura_core::{
    accounts, instruction, ProposeConfidentialTransactionArgs, ENCRYPT_DEVNET_PROGRAM_ID, ID,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::signature::{Keypair, Signer};

use aura_devnet::*;

/// Run one complete confidential scenario end-to-end.
///
/// Order of operations:
/// 1. Encrypt four scalar `u64` ciphertexts (daily_limit, per_tx_limit,
///    spent_today, amount) via the Ika Encrypt gRPC service.
/// 2. Wait for all four to reach "verified" status on-chain.
/// 3. Create a treasury and optionally register a dWallet.
/// 4. `configure_confidential_guardrails` — bind the three limit ciphertexts.
/// 5. `propose_confidential_transaction` — executes the FHE graph via CPI.
/// 6. Wait for the output ciphertext to be verified.
/// 7. `request_policy_decryption` — submit decryption request to Encrypt.
/// 8. Wait for the plaintext to be written.
/// 9. `confirm_policy_decryption` — apply the decision on-chain.
/// 10. Either finalize (approved) or execute the denial path.
#[allow(clippy::too_many_arguments)]
async fn run_confidential_scenario(
    rpc: &RpcClient,
    payer: &Keypair,
    live: Option<&LiveDWallet>,
    dwallet_client: Option<
        &mut ika_grpc::d_wallet_service_client::DWalletServiceClient<tonic::transport::Channel>,
    >,
    agent_id: &str,
    encrypt_program: &Pubkey,
    dwallet_program: &Pubkey,
    ep: &EncryptPdas,
    daily_limit: u64,
    per_tx_limit: u64,
    spent_today: u64,
    amount: u64,
    expect_approved: bool,
) -> anyhow::Result<()> {
    println!("\nScenario '{agent_id}'  amount={amount}  expect_approved={expect_approved}");
    let created_at = now_unix();
    let (treasury, _) = pda(
        &[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()],
        &ID,
    );

    // 1-2: create and verify the four input ciphertexts
    println!("  Encrypting input ciphertexts...");
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

    println!("  Waiting for input ciphertexts to be verified on-chain...");
    wait_for_ciphertext_verified(rpc, &daily_ct).context("daily_limit ct not verified")?;
    wait_for_ciphertext_verified(rpc, &per_tx_ct).context("per_tx_limit ct not verified")?;
    wait_for_ciphertext_verified(rpc, &spent_ct).context("spent_today ct not verified")?;
    wait_for_ciphertext_verified(rpc, &amount_ct).context("amount ct not verified")?;

    // 3: create treasury (and optionally register dWallet)
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

    if let Some(live_dw) = live {
        send_tx(
            rpc,
            payer,
            vec![register_dwallet_ix(
                payer,
                treasury,
                live_dw,
                created_at + 1,
            )],
            &[],
        )
        .context("register_dwallet failed")?;
    }

    // 4: configure scalar FHE guardrails
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
    )
    .context("configure_confidential_guardrails failed")?;

    // 5: propose confidential transaction
    // The policy_output keypair must sign so the Encrypt program can create
    // the ciphertext account on behalf of our CPI authority.
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
                    target_chain: 2, // Solana
                    tx_type: 0,      // Transfer
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
        &[&policy_output],
    )
    .context("propose_confidential_transaction failed")?;

    // 6: wait for output ciphertext
    println!("  Waiting for FHE output ciphertext to be verified...");
    wait_for_ciphertext_verified(rpc, &policy_output.pubkey())
        .context("policy output ciphertext not verified")?;

    // 7: request decryption
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
                now: created_at + 4,
            }
            .data(),
        }],
        &[&request_account],
    )
    .context("request_policy_decryption failed")?;

    // 8: wait for plaintext
    println!("  Waiting for decryption plaintext...");
    wait_for_decryption_ready(rpc, &request_account.pubkey())
        .context("decryption request did not complete")?;

    // 9: confirm decryption
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
                now: created_at + 5,
            }
            .data(),
        }],
        &[],
    )
    .context("confirm_policy_decryption failed")?;

    let domain = fetch_treasury_domain(rpc, &treasury)?;
    let pending = domain
        .pending
        .clone()
        .context("no pending proposal after confirm_policy_decryption")?;

    println!(
        "  Decryption confirmed — approved={} violation={}",
        pending.decision.approved, pending.decision.violation
    );

    // 10: approve or deny
    if expect_approved {
        ensure!(pending.decision.approved, "expected approved result");
        let live_dw = live.context("approved scenario requires a registered dWallet")?;
        let dw_client = dwallet_client.context("approved scenario requires dWallet gRPC client")?;
        finalize_via_dwallet(
            rpc,
            payer,
            dw_client,
            treasury,
            dwallet_program,
            live_dw,
            created_at + 6,
        )
        .await?;
    } else {
        ensure!(!pending.decision.approved, "expected denied result");
        execute_denied(rpc, payer, treasury, created_at + 6)
            .context("execute_pending (denial) failed")?;
        println!("  Denied proposal cleared.");
    }

    Ok(())
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let rpc = devnet_rpc();
    let encrypt_program: Pubkey = ENCRYPT_DEVNET_PROGRAM_ID.parse()?;
    let dwallet_program: Pubkey = aura_core::DWALLET_DEVNET_PROGRAM_ID.parse()?;

    println!("Payer: {}", payer.pubkey());

    println!("\nEnsuring Encrypt deposit account...");
    let ep = ensure_encrypt_deposit(&rpc, &payer, &encrypt_program)?;

    println!("\nProvisioning live dWallet via DKG...");
    let mut dwallet_client = connect_dwallet_client().await?;
    let live = provision_dwallet(&rpc, &payer, &mut dwallet_client, &dwallet_program).await?;
    println!("  dWallet PDA: {}", live.dwallet_pda);
    transfer_dwallet_authority(&rpc, &payer, &dwallet_program, &live.dwallet_pda)?;

    let seed = now_unix();

    run_confidential_scenario(
        &rpc,
        &payer,
        None, // no dWallet needed for denial
        None,
        &format!("conf-deny-{seed}"),
        &encrypt_program,
        &dwallet_program,
        &ep,
        /* daily_limit */ 1_000,
        /* per_tx_limit */ 600,
        /* spent_today */ 0,
        /* amount */ 650, // > per_tx_limit → violation_code=1
        /* expect_approved */ false,
    )
    .await?;
    println!("  ✓ Scenario A passed (denial)");

    run_confidential_scenario(
        &rpc,
        &payer,
        Some(&live),
        Some(&mut dwallet_client),
        &format!("conf-approve-{seed}"),
        &encrypt_program,
        &dwallet_program,
        &ep,
        /* daily_limit */ 1_000,
        /* per_tx_limit */ 600,
        /* spent_today */ 0,
        /* amount */ 250, // < per_tx_limit, daily_limit → approved
        /* expect_approved */ true,
    )
    .await?;
    println!("  ✓ Scenario B passed (approval + finalize)");

    println!("\n✓ AURA devnet confidential smoke test passed.");
    Ok(())
}
