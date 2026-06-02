//! Devnet smoke checks for the confidential guardrail lifecycle (sidecar PDA).
//!
//! Mints verified Encrypt `u64` ciphertexts via the Encrypt gRPC service, then
//! exercises init → update → rotate → disable → close on the
//! `ConfidentialGuardrailsAccount` sidecar.
//!
//! Run with:
//!   cargo run -p aura-devnet --bin confidential_lifecycle

use anchor_lang::{
    system_program::ID as SYSTEM_PROGRAM_ID, AccountDeserialize, InstructionData, ToAccountMetas,
};
use aura_core::{
    accounts, constants::CONFIDENTIAL_GUARDRAILS_SEED, instruction, ConfidentialGuardrailsAccount,
    ID,
};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, encrypt_u64, load_payer, now_unix, pda,
    send_tx, wait_for_ciphertext_verified,
};
use aura_policy::PolicyConfig;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::Signer,
};

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction { program_id: ID, accounts, data }
}

fn fetch(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<ConfidentialGuardrailsAccount> {
    let info = rpc.get_account(addr)?;
    Ok(ConfidentialGuardrailsAccount::try_deserialize(&mut info.data.as_slice())?)
}

/// Mint a verified `u64` ciphertext authorized to the AURA program.
async fn mint(rpc: &RpcClient, value: u64) -> anyhow::Result<Pubkey> {
    let ct = encrypt_u64(value, &ID).await?;
    wait_for_ciphertext_verified(rpc, &ct)?;
    Ok(ct)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    let agent_id = format!("cl-{seed}");
    let treasury = pda(&[b"treasury", owner.as_ref(), agent_id.as_bytes()], &ID).0;
    send_tx(
        &rpc,
        &payer,
        vec![create_treasury_ix(&payer, treasury, &agent_id, seed, PolicyConfig::default())],
        &[],
    )?;
    activate_treasury(&rpc, &payer, treasury, seed + 1)?;
    let guardrails = pda(&[CONFIDENTIAL_GUARDRAILS_SEED, treasury.as_ref()], &ID).0;

    // [1] init: mint the three core ciphertexts and create the sidecar at epoch 1.
    println!("\n[confidential] minting core ciphertexts via Encrypt gRPC...");
    let daily = mint(&rpc, 10_000).await?;
    let per_tx = mint(&rpc, 1_000).await?;
    let spent = mint(&rpc, 0).await?;
    println!("  daily={daily}  per_tx={per_tx}  spent_today={spent}");

    println!("[confidential] init_confidential_guardrails (epoch 1)");
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::InitConfidentialGuardrails {
                owner,
                treasury,
                guardrails,
                daily_limit_ciphertext: daily,
                per_tx_limit_ciphertext: per_tx,
                spent_today_ciphertext: spent,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitConfidentialGuardrails { epoch_id: 1, now: seed + 2 }.data(),
        )],
        &[],
    )?;
    println!("  init tx: {sig}");
    let g = fetch(&rpc, &guardrails)?;
    anyhow::ensure!(g.enabled && g.epoch_id == 1, "init state wrong");
    anyhow::ensure!(g.daily_limit_ciphertext == Some(daily), "daily ptr not stored");
    println!("  ok sidecar created (enabled, epoch=1, 3 pointers)");

    // [2] update: re-point one new field (velocity), leave the rest.
    println!("\n[confidential] update_confidential_guardrails (add velocity)");
    let velocity = mint(&rpc, 5_000).await?;
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageConfidentialGuardrails {
                owner,
                treasury,
                guardrails,
                daily_limit_ciphertext: None,
                per_tx_limit_ciphertext: None,
                velocity_limit_ciphertext: Some(velocity),
                hourly_limit_ciphertext: None,
                weekly_limit_ciphertext: None,
                spent_today_ciphertext: None,
                hourly_spent_ciphertext: None,
                velocity_window_ciphertext: None,
            }
            .to_account_metas(None),
            instruction::UpdateConfidentialGuardrails { now: seed + 3 }.data(),
        )],
        &[],
    )?;
    println!("  update tx: {sig}");
    let g = fetch(&rpc, &guardrails)?;
    anyhow::ensure!(g.velocity_limit_ciphertext == Some(velocity), "velocity not set");
    anyhow::ensure!(g.daily_limit_ciphertext == Some(daily), "daily should be unchanged");
    println!("  ok velocity re-pointed; other pointers unchanged");

    // [3] rotate: fresh ciphertexts under a new epoch.
    println!("\n[confidential] rotate_confidential_guardrails (epoch 2)");
    let daily2 = mint(&rpc, 20_000).await?;
    let per_tx2 = mint(&rpc, 2_000).await?;
    let spent2 = mint(&rpc, 0).await?;
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageConfidentialGuardrails {
                owner,
                treasury,
                guardrails,
                daily_limit_ciphertext: Some(daily2),
                per_tx_limit_ciphertext: Some(per_tx2),
                velocity_limit_ciphertext: None,
                hourly_limit_ciphertext: None,
                weekly_limit_ciphertext: None,
                spent_today_ciphertext: Some(spent2),
                hourly_spent_ciphertext: None,
                velocity_window_ciphertext: None,
            }
            .to_account_metas(None),
            instruction::RotateConfidentialGuardrails { new_epoch_id: 2, now: seed + 4 }.data(),
        )],
        &[],
    )?;
    println!("  rotate tx: {sig}");
    let g = fetch(&rpc, &guardrails)?;
    anyhow::ensure!(g.epoch_id == 2, "epoch not bumped");
    anyhow::ensure!(g.daily_limit_ciphertext == Some(daily2), "daily not rotated");
    println!("  ok rotated to epoch 2 with fresh ciphertexts");

    // [4] disable, then close.
    println!("\n[confidential] disable_confidential_guardrails");
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DisableConfidentialGuardrails { owner, treasury, guardrails }
                .to_account_metas(None),
            instruction::DisableConfidentialGuardrails { now: seed + 5 }.data(),
        )],
        &[],
    )?;
    println!("  disable tx: {sig}");
    anyhow::ensure!(!fetch(&rpc, &guardrails)?.enabled, "should be disabled");
    println!("  ok guardrails disabled (falls back to public policy)");

    println!("\n[confidential] close_confidential_guardrails");
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CloseConfidentialGuardrails { owner, treasury, guardrails }
                .to_account_metas(None),
            instruction::CloseConfidentialGuardrails {}.data(),
        )],
        &[],
    )?;
    println!("  close tx: {sig}");
    anyhow::ensure!(rpc.get_account(&guardrails).is_err(), "sidecar should be closed");
    println!("  ok sidecar closed");

    println!("\nconfidential guardrail lifecycle smoke checks passed on devnet.");
    Ok(())
}
