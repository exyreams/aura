//! Devnet smoke check for confidential vector batch submission.
//!
//! This exercises the upgraded `propose_confidential_batch` instruction
//! against the live devnet program. It provisions fixed-width Encrypt
//! `EUint64Vector` ciphertexts, submits the vector item-limit graph through
//! AURA, then reads the `BatchProposalAccount` back from devnet.
//!
//! Run with:
//!   cargo run --manifest-path smoke/aura-devnet/Cargo.toml --bin confidential_batch

use anchor_lang::{
    system_program::ID as SYSTEM_PROGRAM_ID, AccountDeserialize, InstructionData, ToAccountMetas,
};
use anyhow::Context;
use aura_core::{
    accounts, constants::BATCH_PROPOSAL_SEED, instruction, BatchProposalAccount,
    ProposeConfidentialBatchArgs, ENCRYPT_DEVNET_PROGRAM_ID, ID,
};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, encrypt_u64_vector, ensure_encrypt_deposit,
    load_payer, now_unix, pda, send_tx, wait_for_ciphertext_verified,
};
use aura_policy::PolicyConfig;
use solana_sdk::{instruction::Instruction, pubkey::Pubkey, signature::Signer};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let encrypt_program: Pubkey = ENCRYPT_DEVNET_PROGRAM_ID.parse()?;
    let seed = now_unix();
    let agent_id = format!("conf-batch-{seed}");
    let batch_id = seed as u64;

    println!("Payer:   {owner}");
    println!("Program: {ID}");
    println!("Agent:   {agent_id}");

    println!("\n[batch] ensuring Encrypt deposit account...");
    let ep = ensure_encrypt_deposit(&rpc, &payer, &encrypt_program)?;

    let treasury = pda(&[b"treasury", owner.as_ref(), agent_id.as_bytes()], &ID).0;
    println!("[batch] creating treasury {treasury}");
    send_tx(
        &rpc,
        &payer,
        vec![create_treasury_ix(
            &payer,
            treasury,
            &agent_id,
            seed,
            PolicyConfig {
                daytime_hourly_limit_usd: 10_000,
                nighttime_hourly_limit_usd: 10_000,
                velocity_limit_usd: 10_000,
                ..Default::default()
            },
        )],
        &[],
    )
    .context("create_treasury failed")?;
    activate_treasury(&rpc, &payer, treasury, seed + 1).context("activate_treasury failed")?;

    println!("\n[batch] minting EUint64Vector ciphertexts through Encrypt gRPC...");
    let amounts = encrypt_u64_vector(&[125, 250, 900], &ID)
        .await
        .context("encrypt amount vector")?;
    let per_item_limits = encrypt_u64_vector(&[500, 500, 800], &ID)
        .await
        .context("encrypt per-item limit vector")?;
    let item_violations = encrypt_u64_vector(&[0, 0, 0], &ID)
        .await
        .context("encrypt item-violation output vector")?;
    for ct in [&amounts, &per_item_limits, &item_violations] {
        wait_for_ciphertext_verified(&rpc, ct).context("vector ciphertext not verified")?;
    }
    println!("  amount_vector:       {amounts}");
    println!("  per_item_limits:     {per_item_limits}");
    println!("  item_violation_out:  {item_violations}");

    let batch = pda(
        &[
            BATCH_PROPOSAL_SEED,
            treasury.as_ref(),
            &batch_id.to_le_bytes(),
        ],
        &ID,
    )
    .0;
    println!("\n[batch] propose_confidential_batch batch={batch}");
    let sig = send_tx(
        &rpc,
        &payer,
        vec![Instruction {
            program_id: ID,
            accounts: accounts::ProposeConfidentialBatch {
                payer: owner,
                treasury,
                batch,
                amount_vector_ciphertext: amounts,
                per_item_limit_vector_ciphertext: per_item_limits,
                item_violation_vector_ciphertext: item_violations,
                encrypt_program,
                config: ep.config_pda,
                deposit: ep.deposit_pda,
                caller_program: ID,
                cpi_authority: ep.cpi_authority,
                network_encryption_key: ep.network_key_pda,
                event_authority: ep.event_authority,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            data: instruction::ProposeConfidentialBatch {
                args: ProposeConfidentialBatchArgs {
                    batch_id,
                    now: seed + 2,
                    item_count: 3,
                },
            }
            .data(),
        }],
        &[],
    )
    .context("propose_confidential_batch failed")?;
    println!("  tx: {sig}");

    let account = rpc.get_account(&batch).context("fetch batch account")?;
    let record = BatchProposalAccount::try_deserialize(&mut account.data.as_slice())
        .context("deserialize batch account")?;
    anyhow::ensure!(record.treasury == treasury, "batch treasury mismatch");
    anyhow::ensure!(record.confidential, "batch should be confidential");
    anyhow::ensure!(
        !record.confidential_result_ready,
        "vector result should remain pending"
    );
    anyhow::ensure!(record.confidential_item_count == 3, "item_count mismatch");
    anyhow::ensure!(
        record.amount_vector_ciphertext == Some(amounts),
        "amount vector pointer mismatch"
    );
    anyhow::ensure!(
        record.per_item_limit_vector_ciphertext == Some(per_item_limits),
        "limit vector pointer mismatch"
    );
    anyhow::ensure!(
        record.item_violation_vector_ciphertext == Some(item_violations),
        "output vector pointer mismatch"
    );

    println!(
        "  ok batch stored: confidential={} ready={} active_lanes={}",
        record.confidential, record.confidential_result_ready, record.confidential_item_count
    );
    println!("\nconfidential vector batch smoke check passed on devnet.");
    Ok(())
}
