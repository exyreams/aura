//! Devnet smoke tests for confidential FHE policy-control scenarios.
//!
//! The policy smoke runner provisions one live Ed25519 dWallet and one Encrypt
//! deposit account, then runs independent treasury PDAs through live policy
//! branches that need real Solana, Encrypt, or dWallet integration. Pure
//! validation and account-boundary behavior remains in the program tests.

mod controls;
mod governance;
mod harness;
mod limits;
mod prelude;
mod registrations;
mod risk;

use prelude::*;

pub async fn run() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let rpc = devnet_rpc();
    let encrypt_program: Pubkey = ENCRYPT_DEVNET_PROGRAM_ID.parse()?;
    let dwallet_program: Pubkey = aura_core::DWALLET_DEVNET_PROGRAM_ID.parse()?;

    println!("Payer: {}", payer.pubkey());

    println!("
Ensuring Encrypt deposit account...");
    let ep = ensure_encrypt_deposit(&rpc, &payer, &encrypt_program)?;

    println!("
Provisioning live dWallet via DKG...");
    let mut dwallet_client = connect_dwallet_client().await?;
    let live = provision_dwallet(&rpc, &payer, &mut dwallet_client, &dwallet_program).await?;
    println!("  dWallet PDA: {}", live.dwallet_pda);
    transfer_dwallet_authority(&rpc, &payer, &dwallet_program, &live.dwallet_pda)?;
    drop(dwallet_client);

    let seed = now_unix();

    limits::scenario_per_tx_deny(&rpc, &payer, &encrypt_program, &ep, seed).await?;
    println!("  ✓ [1] passed");

    limits::scenario_per_tx_approve(
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

    limits::scenario_daily_deny(&rpc, &payer, &encrypt_program, &ep, seed).await?;
    println!("  ✓ [3] passed");

    limits::scenario_daily_approve(
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

    controls::scenario_cancel_pending(&rpc, &payer, &encrypt_program, &ep, seed).await?;
    println!("  ✓ [5] passed");

    controls::scenario_pause_resume(&rpc, &payer, &encrypt_program, &ep, seed).await?;
    println!("  ✓ [6] passed");

    governance::scenario_multisig_override(
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

    risk::scenario_swarm_pool(
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

    governance::scenario_single_guardian_override(&rpc, &payer, seed).await?;
    println!("  ✓ [9] passed");

    registrations::scenario_multi_chain(&rpc, &payer, &live, seed).await?;
    println!("  ✓ [10] passed");

    risk::scenario_reputation_scaling(
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

    controls::scenario_reconfigure_guardrails(
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

    println!("
✓ All 12 AURA policy scenarios passed on devnet.");
    Ok(())
}
