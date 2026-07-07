//! Devnet smoke checks for chain-profile and oracle negative controls.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::{
    accounts, instruction, ChainProfileArgs, RegisterDwalletArgs, SetAssetOracleFeedArgs,
    ADDRESS_FORMAT_EVM, FINALITY_PROBABILISTIC, ID, REPLAY_SCHEME_EVM,
};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, fetch_treasury_domain, load_payer, now_unix,
    pda, send_tx,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

const ETH: u8 = 1;
const PYTH: u8 = 0;

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

fn profile_args(chain_code: u8, confirmations_required: u16, now: i64) -> ChainProfileArgs {
    ChainProfileArgs {
        chain_code,
        enabled: true,
        address_format: ADDRESS_FORMAT_EVM,
        replay_scheme: REPLAY_SCHEME_EVM,
        finality_model: FINALITY_PROBABILISTIC,
        curve: 0,
        signature_scheme: 0,
        native_gas_asset: "ETH".to_string(),
        evm_chain_id: Some(111_551_11),
        confirmations_required,
        now,
    }
}

fn free_chain_code(rpc: &RpcClient, seed: i64) -> anyhow::Result<u8> {
    for offset in 0..240u16 {
        let code = 6 + ((seed as u16 + offset) % 248) as u8;
        let profile = pda(&[b"chain_profile", &[code]], &ID).0;
        if rpc.get_account(&profile).is_err() {
            return Ok(code);
        }
    }
    anyhow::bail!("no free custom chain profile code found")
}

fn register_profile(
    rpc: &RpcClient,
    payer: &Keypair,
    chain_code: u8,
    confirmations_required: u16,
    now: i64,
) -> anyhow::Result<()> {
    let chain_profile = pda(&[b"chain_profile", &[chain_code]], &ID).0;
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::RegisterChainProfile {
                authority: payer.pubkey(),
                chain_profile,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::RegisterChainProfile {
                args: profile_args(chain_code, confirmations_required, now),
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn setup_dwallet_state(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    now: i64,
) -> anyhow::Result<Pubkey> {
    let dwallet_state = pda(&[b"dwallet_state", treasury.as_ref(), &[ETH]], &ID).0;
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
                    dwallet_id: format!("oracle-neg-{now}"),
                    address: "0xAA00000000000000000000000000000000000000".to_string(),
                    balance_usd: 0,
                    dwallet_account: Some(Keypair::new().pubkey()),
                    authorized_user_pubkey: Some(payer.pubkey()),
                    message_metadata_digest: None,
                    public_key_hex: Some(hex::encode([0x33u8; 32])),
                    timestamp: now,
                },
            }
            .data(),
        )],
        &[],
    )?;
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
            instruction::InitDwalletState {
                chain: ETH,
                now: now + 1,
            }
            .data(),
        )],
        &[],
    )?;
    Ok(dwallet_state)
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    println!("\n[chain profile] zero confirmations reject");
    let chain_code = free_chain_code(&rpc, seed)?;
    let zero = register_profile(&rpc, &payer, chain_code, 0, seed + 1);
    anyhow::ensure!(
        zero.is_err(),
        "zero-confirmation chain profile should reject"
    );
    println!("  ok zero confirmations rejected for custom chain {chain_code}");

    println!("\n[chain profile] mismatched update chain code rejects");
    register_profile(&rpc, &payer, chain_code, 5, seed + 2)?;
    let profile = pda(&[b"chain_profile", &[chain_code]], &ID).0;
    let mismatch = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::UpdateChainProfile {
                authority: owner,
                chain_profile: profile,
            }
            .to_account_metas(None),
            instruction::UpdateChainProfile {
                args: profile_args(chain_code + 1, 7, seed + 3),
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(mismatch.is_err(), "mismatched chain update should reject");
    println!("  ok mismatched update rejected");

    println!("\n[balance oracle] unregistered dWallet chain rejects refresh");
    let treasury = create_active_treasury(&rpc, &payer, "chain-neg", seed + 10)?;
    let refresh = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::RefreshDwalletBalance {
                treasury,
                balance_oracle: owner,
            }
            .to_account_metas(None),
            instruction::RefreshDwalletBalance {
                chain_code: ETH,
                now: seed + 11,
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(
        refresh.is_err(),
        "refreshing an unregistered dWallet chain should reject"
    );
    anyhow::ensure!(
        fetch_treasury_domain(&rpc, &treasury)?.dwallets.is_empty(),
        "failed refresh mutated treasury dWallet registry"
    );
    println!("  ok unregistered dWallet balance refresh rejected");

    println!("\n[asset oracle] trusted provider without feed rejects");
    let dwallet_state = setup_dwallet_state(&rpc, &payer, treasury, seed + 12)?;
    let trusted_without_feed = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::DwalletControl {
                owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::SetAssetOracleFeed {
                chain: ETH,
                args: SetAssetOracleFeedArgs {
                    asset_id: "usdc".to_string(),
                    provider: PYTH,
                    feed: None,
                    program_id: Some(Keypair::new().pubkey()),
                    max_staleness_secs: 60,
                    max_confidence_bps: 100,
                    expo_expected: Some(-6),
                    now: seed + 14,
                },
            }
            .data(),
        )],
        &[],
    );
    anyhow::ensure!(
        trusted_without_feed.is_err(),
        "trusted oracle provider without feed should reject"
    );
    println!("  ok trusted oracle feed setup rejected without feed");

    println!("\nchain-profile negative smoke checks passed on devnet.");
    Ok(())
}
