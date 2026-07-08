//! Opt-in live-token smoke for funding a dWallet token source.
//!
//! Provisions a live Ika dWallet, creates its SPL/Token-2022 source ATA, funds
//! enough SOL for target-chain fees, bootstraps the source ATA from the payer
//! wallet, and asserts the source token balance did not decrease.

use aura_core::DWALLET_DEVNET_PROGRAM_ID;
use aura_devnet::{connect_dwallet_client, devnet_rpc, live_tokens, load_payer, provision_dwallet};
use solana_sdk::{pubkey::Pubkey, signature::Signer};

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    live_tokens::require_live_token_smoke()?;
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let dwallet_program = DWALLET_DEVNET_PROGRAM_ID.parse::<Pubkey>()?;
    println!("Payer:   {owner}");

    let asset = live_tokens::discover_live_token_asset(&rpc, &owner)?;
    let mut dwallet_client = connect_dwallet_client().await?;
    let live = provision_dwallet(&rpc, &payer, &mut dwallet_client, &dwallet_program).await?;
    let dwallet_owner = live_tokens::dwallet_solana_key(&live.public_key)?;
    let source_ata = live_tokens::ensure_token_account(
        &rpc,
        &payer,
        dwallet_owner,
        asset.mint,
        asset.token_program,
        "dWallet source",
    )?;
    live_tokens::ensure_dwallet_fee_payer_lamports(&rpc, &payer, dwallet_owner)?;

    let before = live_tokens::read_token_balance(&rpc, &source_ata)?;
    let after = live_tokens::bootstrap_dwallet_source_if_needed(
        &rpc,
        &payer,
        &asset,
        source_ata,
        dwallet_owner,
    )?;
    anyhow::ensure!(
        after.amount >= before.amount,
        "dWallet source balance decreased during funding"
    );

    println!("\n=== dWallet funding result ===");
    println!("dWallet owner: {dwallet_owner}");
    println!("source ATA   : {source_ata}");
    println!("mint         : {}", asset.mint);
    println!(
        "before       : {}",
        live_tokens::raw_amount_to_ui(before.amount, before.decimals)
    );
    println!(
        "after        : {}",
        live_tokens::raw_amount_to_ui(after.amount, after.decimals)
    );
    println!("\nlive dWallet funding smoke checks passed on devnet.");
    Ok(())
}
