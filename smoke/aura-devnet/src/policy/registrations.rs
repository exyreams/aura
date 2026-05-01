//! Multi-chain dWallet registration smoke scenarios.

use super::{harness::*, prelude::*};

/// [10] Multi-chain registration — SOL + ETH + BTC dWallets on one treasury
pub(super) async fn scenario_multi_chain(
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
