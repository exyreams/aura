//! Devnet smoke checks for dWallet runtime negative controls.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{accounts, instruction, DWalletAccount, RegisterDwalletArgs, ID};
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

fn fetch_dwallet(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<DWalletAccount> {
    let info = rpc.get_account(addr)?;
    Ok(DWalletAccount::try_deserialize(&mut info.data.as_slice())?)
}

fn register_dwallet(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::RegisterDwallet {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            instruction::RegisterDwallet {
                args: RegisterDwalletArgs {
                    chain: ETH,
                    dwallet_id: format!("dw-neg-{now}"),
                    address: "0xAA00000000000000000000000000000000000000".to_string(),
                    balance_usd: 0,
                    dwallet_account: Some(Keypair::new().pubkey()),
                    authorized_user_pubkey: Some(payer.pubkey()),
                    message_metadata_digest: None,
                    public_key_hex: Some(hex::encode([0x55u8; 32])),
                    timestamp: now,
                },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn init_state(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    dwallet_state: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::InitDwalletState {
                owner: payer.pubkey(),
                treasury,
                dwallet_state,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitDwalletState { chain: ETH, now }.data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn deposit_usdc(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    dwallet_state: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::DwalletControl {
                owner: payer.pubkey(),
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::RecordDeposit {
                chain: ETH,
                asset_id: "usdc".to_string(),
                symbol: "USDC".to_string(),
                decimals: 6,
                native_amount: 1_000_000_000u128,
                usd_value: 1_000,
                now,
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn dwallet_control(
    payer: &Keypair,
    treasury: Pubkey,
    dwallet_state: Pubkey,
    data: Vec<u8>,
) -> Instruction {
    ix(
        accounts::DwalletControl {
            owner: payer.pubkey(),
            treasury,
            dwallet_state,
        }
        .to_account_metas(None),
        data,
    )
}

fn dwallet_spend(
    payer: &Keypair,
    treasury: Pubkey,
    dwallet_state: Pubkey,
    data: Vec<u8>,
) -> Instruction {
    ix(
        accounts::DwalletSpend {
            authority: payer.pubkey(),
            treasury,
            dwallet_state,
        }
        .to_account_metas(None),
        data,
    )
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    let treasury = create_active_treasury(&rpc, &payer, "dwallet-neg", seed)?;
    let dwallet_state = pda(&[b"dwallet_state", treasury.as_ref(), &[ETH]], &ID).0;
    register_dwallet(&rpc, &payer, treasury, seed + 2)?;
    init_state(&rpc, &payer, treasury, dwallet_state, seed + 3)?;
    deposit_usdc(&rpc, &payer, treasury, dwallet_state, seed + 4)?;
    println!("\n[setup] registered active dWallet runtime with 1000 USD");

    println!("\n[registry] duplicate registration rejects");
    let duplicate = register_dwallet(&rpc, &payer, treasury, seed + 5);
    anyhow::ensure!(
        duplicate.is_err(),
        "duplicate dWallet registration should reject"
    );
    println!("  ok duplicate registration rejected");

    println!("\n[controls] invalid status, long label, and long authority seed reject");
    let invalid_status = send_tx(
        &rpc,
        &payer,
        vec![dwallet_control(
            &payer,
            treasury,
            dwallet_state,
            instruction::SetDwalletStatus {
                chain: ETH,
                status_code: 99,
                now: seed + 6,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(invalid_status.is_err(), "unknown status code should reject");
    let long_label = send_tx(
        &rpc,
        &payer,
        vec![dwallet_control(
            &payer,
            treasury,
            dwallet_state,
            instruction::SetDwalletLabel {
                chain: ETH,
                label: Some("x".repeat(33)),
                now: seed + 7,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(long_label.is_err(), "long dWallet label should reject");
    let long_seed = send_tx(
        &rpc,
        &payer,
        vec![dwallet_control(
            &payer,
            treasury,
            dwallet_state,
            instruction::RotateDwalletAuthority {
                chain: ETH,
                new_authority: Keypair::new().pubkey(),
                new_cpi_authority_seed: "s".repeat(49),
                now: seed + 8,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(long_seed.is_err(), "long CPI authority seed should reject");
    let dw = fetch_dwallet(&rpc, &dwallet_state)?;
    anyhow::ensure!(
        dw.status == 1 && dw.label.is_none() && dw.epoch == 0,
        "failed controls mutated dWallet state"
    );
    println!("  ok invalid control inputs rejected without mutation");

    println!("\n[spend] reserve over available balance rejects");
    let over_available = send_tx(
        &rpc,
        &payer,
        vec![dwallet_spend(
            &payer,
            treasury,
            dwallet_state,
            instruction::ReserveDwalletSpend {
                chain: ETH,
                amount_usd: 1_001,
                now: seed + 9,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(
        over_available.is_err(),
        "reservation above available balance should reject"
    );
    anyhow::ensure!(
        fetch_dwallet(&rpc, &dwallet_state)?.reserved_usd == 0,
        "failed over-reserve mutated reserved amount"
    );
    println!("  ok over-reserve rejected");

    println!("\n[spend] frozen and retiring states block reservations");
    send_tx(
        &rpc,
        &payer,
        vec![dwallet_control(
            &payer,
            treasury,
            dwallet_state,
            instruction::SetDwalletStatus {
                chain: ETH,
                status_code: 2,
                now: seed + 10,
            }
            .data(),
        )],
        &[],
    )?;
    let frozen_reserve = send_tx(
        &rpc,
        &payer,
        vec![dwallet_spend(
            &payer,
            treasury,
            dwallet_state,
            instruction::ReserveDwalletSpend {
                chain: ETH,
                amount_usd: 10,
                now: seed + 11,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(
        frozen_reserve.is_err(),
        "frozen dWallet should block reserve"
    );
    send_tx(
        &rpc,
        &payer,
        vec![dwallet_control(
            &payer,
            treasury,
            dwallet_state,
            instruction::SetDwalletStatus {
                chain: ETH,
                status_code: 1,
                now: seed + 12,
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![dwallet_control(
            &payer,
            treasury,
            dwallet_state,
            instruction::SetDwalletStatus {
                chain: ETH,
                status_code: 4,
                now: seed + 13,
            }
            .data(),
        )],
        &[],
    )?;
    let retiring_reserve = send_tx(
        &rpc,
        &payer,
        vec![dwallet_spend(
            &payer,
            treasury,
            dwallet_state,
            instruction::ReserveDwalletSpend {
                chain: ETH,
                amount_usd: 10,
                now: seed + 14,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(
        retiring_reserve.is_err(),
        "retiring dWallet should block reserve"
    );
    send_tx(
        &rpc,
        &payer,
        vec![dwallet_control(
            &payer,
            treasury,
            dwallet_state,
            instruction::SetDwalletStatus {
                chain: ETH,
                status_code: 1,
                now: seed + 15,
            }
            .data(),
        )],
        &[],
    )?;
    println!("  ok frozen and retiring states block reservations");

    println!("\n[reservation] release/settle underflow rejects without mutation");
    let release_underflow = send_tx(
        &rpc,
        &payer,
        vec![dwallet_spend(
            &payer,
            treasury,
            dwallet_state,
            instruction::ReleaseDwalletSpend {
                chain: ETH,
                amount_usd: 1,
                now: seed + 16,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(
        release_underflow.is_err(),
        "release above reserved amount should reject"
    );
    let settle_underflow = send_tx(
        &rpc,
        &payer,
        vec![dwallet_spend(
            &payer,
            treasury,
            dwallet_state,
            instruction::SettleDwalletSpend {
                chain: ETH,
                amount_usd: 1,
                asset_id: "usdc".to_string(),
                native_amount: 1,
                now: seed + 17,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(
        settle_underflow.is_err(),
        "settle above reserved amount should reject"
    );
    let dw = fetch_dwallet(&rpc, &dwallet_state)?;
    anyhow::ensure!(
        dw.reserved_usd == 0 && dw.spent_today_usd == 0,
        "failed reservation underflow mutated counters"
    );
    println!("  ok reservation underflows rejected without mutation");

    println!("\ndWallet negative-control smoke checks passed on devnet.");
    Ok(())
}
