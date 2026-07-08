//! Opt-in live-token smoke for direct payer-wallet transfers.
//!
//! Moves a small discovered SPL/Token-2022 amount from the payer ATA to the
//! configured recipient owner ATA and asserts exact balance deltas.

use aura_devnet::{devnet_rpc, live_tokens, load_payer};
use solana_sdk::signature::Signer;

fn main() -> anyhow::Result<()> {
    live_tokens::require_live_token_smoke()?;
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let recipient = live_tokens::default_recipient_owner()?;
    println!("Payer:          {owner}");
    println!("Recipient owner:{recipient}");

    let asset = live_tokens::discover_live_token_asset(&rpc, &owner)?;
    let amount_raw = live_tokens::pick_transfer_amount_raw(asset.amount, asset.decimals)?;

    println!("\n=== direct wallet transfer plan ===");
    println!("payer ATA      : {}", asset.payer_token_account);
    println!("mint           : {}", asset.mint);
    println!("token program  : {}", asset.token_program);
    println!(
        "amount         : {}",
        live_tokens::raw_amount_to_ui(amount_raw, asset.decimals)
    );

    let result = live_tokens::transfer_from_payer(
        &rpc,
        &payer,
        &asset,
        recipient,
        amount_raw,
        "direct wallet token transfer",
    )?;
    anyhow::ensure!(
        result.before_source - result.after_source == amount_raw,
        "payer source account did not decrease by the transfer amount"
    );
    anyhow::ensure!(
        result.after_destination - result.before_destination == amount_raw,
        "recipient account did not increase by the transfer amount"
    );

    println!("\n=== direct wallet transfer result ===");
    println!("signature      : {}", result.signature);
    println!("recipient ATA  : {}", result.destination_ata);
    println!("\nlive direct-transfer smoke checks passed on devnet.");
    Ok(())
}
