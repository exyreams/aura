//! Devnet smoke checks for public batch proposal accounts.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{
    accounts, instruction, BatchProposalAccount, BatchProposalItemArgs, ProposeBatchArgs, ID,
};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, load_payer, now_unix, pda, send_tx,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

const ETH: u8 = 1;
const TRANSFER: u8 = 0;
const VIOLATION_NONE: u8 = 0;
const VIOLATION_PER_TX: u8 = 1;

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data,
    }
}

fn unique_agent_id(prefix: &str, now: i64) -> String {
    let suffix = Keypair::new().pubkey().to_string();
    format!("{prefix}-{:06}-{}", now.rem_euclid(1_000_000), &suffix[..8])
}

fn create_active_treasury(
    rpc: &RpcClient,
    payer: &Keypair,
    prefix: &str,
    now: i64,
) -> anyhow::Result<Pubkey> {
    let agent_id = unique_agent_id(prefix, now);
    let treasury = pda(
        &[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()],
        &ID,
    )
    .0;
    send_tx(
        rpc,
        payer,
        vec![create_treasury_ix(
            payer,
            treasury,
            &agent_id,
            now,
            aura_policy::PolicyConfig::default(),
        )],
        &[],
    )?;
    activate_treasury(rpc, payer, treasury, now + 1)?;
    Ok(treasury)
}

fn fetch_batch(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<BatchProposalAccount> {
    let info = rpc.get_account(addr)?;
    Ok(BatchProposalAccount::try_deserialize(
        &mut info.data.as_slice(),
    )?)
}

fn item(amount_usd: u64, recipient_suffix: &str) -> BatchProposalItemArgs {
    BatchProposalItemArgs {
        amount_usd,
        chain: ETH,
        tx_type: TRANSFER,
        recipient_or_contract: format!("0x000000000000000000000000000000000000{recipient_suffix}"),
        protocol_id: None,
    }
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    let treasury = create_active_treasury(&rpc, &payer, "public-batch", seed)?;
    let batch_id = seed as u64;
    let batch_id_bytes = batch_id.to_le_bytes();
    let batch = pda(
        &[
            b"batch_proposal",
            treasury.as_ref(),
            batch_id_bytes.as_ref(),
        ],
        &ID,
    )
    .0;

    println!("\n[public batch] propose mixed approved/denied batch");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ProposeBatch {
                payer: owner,
                treasury,
                batch,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::ProposeBatch {
                args: ProposeBatchArgs {
                    batch_id,
                    now: seed + 2,
                    items: vec![item(100, "00a1"), item(1_500, "00b2")],
                },
            }
            .data(),
        )],
        &[],
    )?;
    let batch = fetch_batch(&rpc, &batch)?;
    anyhow::ensure!(batch.treasury == treasury, "batch treasury mismatch");
    anyhow::ensure!(batch.batch_id == batch_id, "batch id mismatch");
    anyhow::ensure!(
        !batch.approved
            && batch.violation_code == VIOLATION_PER_TX
            && batch.aggregate_amount_usd == 1_600
            && batch.item_count == 2,
        "batch aggregate decision mismatch"
    );
    anyhow::ensure!(
        batch.items.len() == 2
            && batch.items[0].amount_usd == 100
            && batch.items[1].amount_usd == 1_500,
        "batch item records mismatch"
    );
    anyhow::ensure!(
        batch.item_violations == vec![VIOLATION_NONE, VIOLATION_PER_TX],
        "batch item violations mismatch"
    );
    anyhow::ensure!(
        !batch.confidential && batch.confidential_result_ready,
        "public batch confidentiality flags mismatch"
    );
    println!("  ok public batch account records aggregate and per-item policy results");

    println!("\npublic batch smoke checks passed on devnet.");
    Ok(())
}
