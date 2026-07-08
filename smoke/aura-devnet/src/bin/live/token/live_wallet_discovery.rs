//! Opt-in live-token discovery smoke.
//!
//! Reads funded SPL/Token-2022 accounts for the payer and prints the
//! selected transfer-compatible asset. This command does not move tokens.

use aura_devnet::{devnet_rpc, live_tokens, load_payer};
use solana_sdk::signature::Signer;

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    println!("Payer: {owner}");

    let assets = live_tokens::discover_live_token_assets(&rpc, &owner)?;
    live_tokens::print_token_candidate_report(&assets);
    anyhow::ensure!(
        !assets.is_empty(),
        "payer wallet should hold at least one funded transfer-compatible SPL or Token-2022 asset"
    );
    println!("\nlive wallet discovery smoke checks passed on devnet.");
    Ok(())
}
