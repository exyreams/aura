//! Standalone devnet check for all wallet-runtime instructions.
//!
//! Runs without the Ika/Encrypt pre-alpha networks - only `aura-core` + devnet
//! RPC. Registers an Ethereum dWallet, initializes its separate runtime
//! account, then drives the full controls + balances + transfer-reservation
//! lifecycle, asserting on-chain state after each step. Sequential and verbose
//! so a failure is obvious; any failed transaction aborts the run.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{accounts, instruction, DWalletAccount, RegisterDwalletArgs, ID};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, fetch_treasury_domain, load_payer, now_unix,
    pda, send_tx,
};
use aura_policy::Chain;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

const ETH: u8 = 1; // Chain::Ethereum

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data,
    }
}

fn fetch_dwallet(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<DWalletAccount> {
    let info = rpc.get_account(addr)?;
    Ok(DWalletAccount::try_deserialize(&mut info.data.as_slice())?)
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    println!("Payer:   {owner}");
    println!("Program: {ID}\n");

    let t0 = now_unix();
    let agent_id = format!("wallet-rt-{t0}");
    let treasury = pda(&[b"treasury", owner.as_ref(), agent_id.as_bytes()], &ID).0;
    let dwallet_state = pda(&[b"dwallet_state", treasury.as_ref(), &[ETH]], &ID).0;

    send_tx(
        &rpc,
        &payer,
        vec![create_treasury_ix(
            &payer,
            treasury,
            &agent_id,
            t0,
            aura_policy::PolicyConfig::default(),
        )],
        &[],
    )?;
    activate_treasury(&rpc, &payer, treasury, t0 + 1)?;
    println!("ok treasury created + activated: {treasury}\n");

    // Setup: register the Ethereum dWallet (metadata only; no live Ika needed).
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::RegisterDwallet { owner, treasury }.to_account_metas(None),
            instruction::RegisterDwallet {
                args: RegisterDwalletArgs {
                    chain: ETH,
                    dwallet_id: format!("dw-eth-{t0}"),
                    address: "0xAA00000000000000000000000000000000000000".to_string(),
                    balance_usd: 0,
                    dwallet_account: Some(Keypair::new().pubkey()),
                    authorized_user_pubkey: Some(owner),
                    message_metadata_digest: None,
                    public_key_hex: Some(hex::encode([0x44u8; 32])),
                    timestamp: t0 + 2,
                },
            }
            .data(),
        )],
        &[],
    )?;
    println!("ok dwallet registered (Ethereum)\n");

    // 1. init_dwallet_state — create the separate runtime account.
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::InitDwalletState {
                owner,
                treasury,
                dwallet_state,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitDwalletState {
                chain: ETH,
                now: t0 + 3,
            }
            .data(),
        )],
        &[],
    )?;
    let dw = fetch_dwallet(&rpc, &dwallet_state)?;
    anyhow::ensure!(dw.status == 1 && dw.chain == ETH, "runtime not Active");
    println!("[1] init_dwallet_state -> {dwallet_state}");

    // 2. set_dwallet_limits.
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletControl {
                owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::SetDwalletLimits {
                chain: ETH,
                daily_limit_usd: Some(10_000),
                per_tx_limit_usd: Some(5_000),
                now: t0 + 4,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_dwallet(&rpc, &dwallet_state)?.daily_limit_usd == Some(10_000),
        "limits not persisted"
    );
    println!("[2] set_dwallet_limits");

    // 3. set_dwallet_label.
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletControl {
                owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::SetDwalletLabel {
                chain: ETH,
                label: Some("eth-primary".to_string()),
                now: t0 + 5,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_dwallet(&rpc, &dwallet_state)?.label.as_deref() == Some("eth-primary"),
        "label not persisted"
    );
    println!("[3] set_dwallet_label");

    // 4. record_deposit — credit the asset ledger.
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletControl {
                owner,
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
                now: t0 + 6,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_dwallet(&rpc, &dwallet_state)?
            .assets
            .iter()
            .any(|a| a.asset_id == "usdc" && a.usd_value == 1_000),
        "deposit not recorded"
    );
    println!("[4] record_deposit (usdc 1000)");

    // 5. refresh_asset_balance — upsert a second asset.
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletControl {
                owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::RefreshAssetBalance {
                chain: ETH,
                asset_id: "weth".to_string(),
                symbol: "WETH".to_string(),
                decimals: 18,
                native_amount: 200_000_000_000_000_000u128,
                usd_value: 500,
                feed: None,
                now: t0 + 7,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_dwallet(&rpc, &dwallet_state)?.assets.len() == 2,
        "second asset not tracked"
    );
    println!("[5] refresh_asset_balance (weth 500)");

    // 6. set_asset_feed.
    let feed = Keypair::new().pubkey();
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletControl {
                owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::SetAssetFeed {
                chain: ETH,
                asset_id: "usdc".to_string(),
                feed: Some(feed),
                now: t0 + 8,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_dwallet(&rpc, &dwallet_state)?
            .assets
            .iter()
            .any(|a| a.asset_id == "usdc" && a.feed == Some(feed)),
        "asset feed not set"
    );
    println!("[6] set_asset_feed");

    // 7. reserve_dwallet_spend — reserve 600 of the 1500 available.
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletSpend {
                authority: owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::ReserveDwalletSpend {
                chain: ETH,
                amount_usd: 600,
                now: t0 + 9,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_dwallet(&rpc, &dwallet_state)?.reserved_usd == 600,
        "reservation not recorded"
    );
    println!("[7] reserve_dwallet_spend (600)");

    // 8. release_dwallet_spend — return the reservation (cancel path).
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletSpend {
                authority: owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::ReleaseDwalletSpend {
                chain: ETH,
                amount_usd: 600,
                now: t0 + 10,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_dwallet(&rpc, &dwallet_state)?.reserved_usd == 0,
        "reservation not released"
    );
    println!("[8] release_dwallet_spend (600)");

    // 9-10. reserve then settle — debit asset + record spend.
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletSpend {
                authority: owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::ReserveDwalletSpend {
                chain: ETH,
                amount_usd: 400,
                now: t0 + 11,
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletSpend {
                authority: owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::SettleDwalletSpend {
                chain: ETH,
                amount_usd: 400,
                asset_id: "usdc".to_string(),
                native_amount: 400_000_000u128,
                now: t0 + 12,
            }
            .data(),
        )],
        &[],
    )?;
    let dw = fetch_dwallet(&rpc, &dwallet_state)?;
    anyhow::ensure!(
        dw.reserved_usd == 0 && dw.spent_today_usd == 400,
        "settle did not record spend"
    );
    anyhow::ensure!(
        dw.assets
            .iter()
            .any(|a| a.asset_id == "usdc" && a.usd_value == 600),
        "settle did not debit asset"
    );
    println!("[9] reserve_dwallet_spend (400)");
    println!("[10] settle_dwallet_spend (400 usdc) -> spent 400, usdc 600");

    // 11. reconcile_dwallet_balance — total is now 600 (usdc) + 500 (weth).
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletControl {
                owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::ReconcileDwalletBalance {
                chain: ETH,
                now: t0 + 13,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_treasury_domain(&rpc, &treasury)?
            .dwallets
            .get(&Chain::Ethereum)
            .map(|d| d.balance_usd)
            == Some(1_100),
        "aggregate balance not reconciled"
    );
    println!("[11] reconcile_dwallet_balance -> 1100");

    // 12. set_default_chain.
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::SetDefaultChain { owner, treasury }.to_account_metas(None),
            instruction::SetDefaultChain {
                chain: Some(ETH),
                now: t0 + 14,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_treasury_domain(&rpc, &treasury)?.default_chain == Some(Chain::Ethereum),
        "default chain not set"
    );
    println!("[12] set_default_chain (Ethereum)");

    // 13. rotate_dwallet_authority.
    let new_authority = Keypair::new().pubkey();
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletControl {
                owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::RotateDwalletAuthority {
                chain: ETH,
                new_authority,
                new_cpi_authority_seed: "rotated_authority".to_string(),
                now: t0 + 15,
            }
            .data(),
        )],
        &[],
    )?;
    let dw = fetch_dwallet(&rpc, &dwallet_state)?;
    anyhow::ensure!(
        dw.authority == new_authority && dw.epoch == 1,
        "authority not rotated"
    );
    println!("[13] rotate_dwallet_authority -> epoch 1");

    // 14. set_dwallet_status: Active -> Retiring -> Retired.
    for (code, t) in [(4u8, t0 + 16), (5u8, t0 + 17)] {
        send_tx(
            &rpc,
            &payer,
            vec![ix(
                accounts::DwalletControl {
                    owner,
                    treasury,
                    dwallet_state,
                }
                .to_account_metas(None),
                instruction::SetDwalletStatus {
                    chain: ETH,
                    status_code: code,
                    now: t,
                }
                .data(),
            )],
            &[],
        )?;
    }
    anyhow::ensure!(
        fetch_dwallet(&rpc, &dwallet_state)?.status == 5,
        "status not Retired"
    );
    println!("[14] set_dwallet_status (Retiring -> Retired)");

    // Teardown: clear default chain, then remove the dWallet (closes runtime account).
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::SetDefaultChain { owner, treasury }.to_account_metas(None),
            instruction::SetDefaultChain {
                chain: None,
                now: t0 + 18,
            }
            .data(),
        )],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::RemoveDwallet {
                owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::RemoveDwallet {
                chain: ETH,
                now: t0 + 19,
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        rpc.get_account(&dwallet_state).is_err(),
        "runtime account not closed"
    );
    anyhow::ensure!(
        !fetch_treasury_domain(&rpc, &treasury)?
            .dwallets
            .contains_key(&Chain::Ethereum),
        "dwallet not removed from treasury"
    );
    println!("    remove_dwallet -> runtime account closed");

    println!("\nall 14 wallet-runtime instructions verified on devnet.");
    Ok(())
}
