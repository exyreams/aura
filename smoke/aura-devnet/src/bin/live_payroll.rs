//! Opt-in live-token smoke for payroll-style funded payouts.
//!
//! Runs two real dWallet-signed SPL payouts to fresh recipient owners, then
//! verifies an over-cap payroll recipient is denied without moving tokens.

use aura_devnet::{devnet_rpc, live_tokens, load_payer};
use solana_sdk::{signature::Signer, signer::keypair::Keypair};

const VIOLATION_RECIPIENT_PER_TX_LIMIT: u8 = 14;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    live_tokens::require_live_token_smoke()?;
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    println!("Payer: {owner}");

    let mut signatures = Vec::new();
    for index in 0..2 {
        let employee = Keypair::new().pubkey();
        println!("\n[payroll] recipient {} payout to {employee}", index + 1);
        let payroll = live_tokens::prepare_live_aura_scenario(
            &rpc,
            &payer,
            live_tokens::LiveAuraScenarioConfig {
                prefix: format!("live-payroll-{}", index + 1),
                destination_owner: Some(employee),
                ..Default::default()
            },
        )
        .await?;
        live_tokens::set_recipient_limit(
            &rpc,
            &payer,
            &payroll,
            payroll.amount_usd * 100,
            Some(payroll.allowed_per_tx_usd),
            aura_devnet::now_unix(),
        )?;
        let result = live_tokens::execute_approved_live_dwallet_transfer(
            &rpc,
            &payer,
            &payroll,
            &format!("payroll-recipient-{}", index + 1),
        )
        .await?;
        anyhow::ensure!(
            result.amount_raw == payroll.amount_raw,
            "payroll transfer amount mismatch"
        );
        signatures.push(result.signature);
    }

    anyhow::ensure!(signatures.len() == 2, "expected two payroll payouts");
    println!("\n[payroll] capped recipient is denied without moving funds");
    let capped_employee = Keypair::new().pubkey();
    let capped = live_tokens::prepare_live_aura_scenario(
        &rpc,
        &payer,
        live_tokens::LiveAuraScenarioConfig {
            prefix: "live-payroll-cap".to_string(),
            destination_owner: Some(capped_employee),
            ..Default::default()
        },
    )
    .await?;
    live_tokens::assert_denied_proposal(
        &rpc,
        &payer,
        &capped,
        "payroll-recipient-cap",
        live_tokens::base_transfer_proposal_args(&capped, aura_devnet::now_unix()),
        VIOLATION_RECIPIENT_PER_TX_LIMIT,
        true,
    )?;

    println!("\n=== live payroll result ===");
    for (index, signature) in signatures.iter().enumerate() {
        println!("recipient {} signature: {signature}", index + 1);
    }
    println!("\nlive payroll smoke checks passed on devnet.");
    Ok(())
}
