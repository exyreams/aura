//! Devnet smoke test for the public (non-confidential) dWallet signing flow.
//!
//! 1. Provision a live Ed25519 dWallet via the Ika gRPC DKG service.
//! 2. Transfer dWallet ownership to the AURA CPI authority PDA.
//! 3. Create a treasury on Solana devnet.
//! 4. Register the dWallet on that treasury.
//! 5. Propose a plain transfer of 250 USD.
//! 6. Drive the full execute → presign → sign → finalize lifecycle.
//!
//! Requires a funded devnet keypair at `PAYER_KEYPAIR` env var or
//! `~/.config/solana/id.json`.
//!
//! Run with:
//!   cargo run -p aura-devnet --bin dwallet

use anchor_lang::{prelude::Pubkey, InstructionData, ToAccountMetas};
use anyhow::{ensure, Context};
use aura_core::{accounts, instruction, ProposeTransactionArgs, ID};
use solana_sdk::signature::Signer;

use aura_devnet::*;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let rpc = devnet_rpc();
    let dwallet_program_id: Pubkey = aura_core::DWALLET_DEVNET_PROGRAM_ID.parse()?;

    println!("Payer: {}", payer.pubkey());

    // ── Step 1: provision dWallet ──────────────────────────────────────────
    println!("\nProvisioning live Ed25519 dWallet via DKG...");
    let mut dwallet_client = connect_dwallet_client()
        .await
        .context("connect to dWallet gRPC")?;
    let live =
        provision_dwallet(&rpc, &payer, &mut dwallet_client, &dwallet_program_id).await?;
    println!("  dWallet PDA: {}", live.dwallet_pda);

    // ── Step 2: transfer ownership ─────────────────────────────────────────
    println!("\nTransferring dWallet ownership to AURA CPI authority...");
    transfer_dwallet_authority(&rpc, &payer, &dwallet_program_id, &live.dwallet_pda)?;

    // ── Step 3 + 4: create treasury and register dWallet ──────────────────
    let agent_id = format!("dwallet-smoke-{}", now_unix());
    let created_at = now_unix();
    let (treasury, _) = pda(
        &[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()],
        &ID,
    );
    println!("\nCreating treasury {treasury} for agent '{agent_id}'...");

    let policy = aura_policy::PolicyConfig {
        daily_limit_usd: 10_000,
        per_tx_limit_usd: 1_000,
        daytime_hourly_limit_usd: 10_000,
        nighttime_hourly_limit_usd: 10_000,
        velocity_limit_usd: 10_000,
        ..Default::default()
    };
    send_tx(
        &rpc,
        &payer,
        vec![create_treasury_ix(&payer, treasury, &agent_id, created_at, policy)],
        &[],
    )
    .context("create_treasury failed")?;

    println!("Registering dWallet on treasury...");
    send_tx(
        &rpc,
        &payer,
        vec![register_dwallet_ix(&payer, treasury, &live, created_at + 1)],
        &[],
    )
    .context("register_dwallet failed")?;

    // ── Step 5: propose a plain transfer ──────────────────────────────────
    println!("\nProposing public transfer of 250 USD...");
    send_tx(
        &rpc,
        &payer,
        vec![solana_sdk::instruction::Instruction {
            program_id: ID,
            accounts: accounts::ProposeTransaction {
                ai_authority: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            data: instruction::ProposeTransaction {
                args: ProposeTransactionArgs {
                    amount_usd: 250,
                    target_chain: 2, // Solana
                    tx_type: 0,      // Transfer
                    protocol_id: None,
                    current_timestamp: created_at + 2,
                    expected_output_usd: Some(250),
                    actual_output_usd: Some(250),
                    quote_age_secs: Some(30),
                    counterparty_risk_score: Some(10),
                    recipient_or_contract: payer.pubkey().to_string(),
                },
            }
            .data(),
        }],
        &[],
    )
    .context("propose_transaction failed")?;

    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    let pending = domain.pending.context("no pending proposal after propose_transaction")?;
    ensure!(
        pending.decision.approved,
        "proposal should be approved; violation={}",
        pending.decision.violation
    );
    println!(
        "  Proposal {} approved (violation=none, effective_limit={})",
        pending.proposal_id, pending.decision.effective_daily_limit_usd
    );

    // ── Step 6: execute → presign → sign → finalize ────────────────────────
    println!("\nFinalizing via live dWallet...");
    finalize_via_dwallet(
        &rpc,
        &payer,
        &mut dwallet_client,
        treasury,
        &dwallet_program_id,
        &live,
        created_at + 3,
    )
    .await?;

    println!("\n✓ AURA devnet dWallet smoke test passed.");
    Ok(())
}
