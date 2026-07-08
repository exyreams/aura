//! Opt-in live-token smoke for policy-gated dWallet transfers.
//!
//! Runs several policy denials against funded context, then moves a small SPL
//! token amount through AURA proposal approval, live Ika dWallet signing,
//! target Solana broadcast, and settlement confirmation.

use aura_devnet::{devnet_rpc, live_tokens, load_payer};
use solana_sdk::signature::Signer;

const VIOLATION_PER_TRANSACTION_LIMIT: u8 = 1;
const VIOLATION_QUOTE_STALE: u8 = 8;
const VIOLATION_COUNTERPARTY_RISK: u8 = 9;
const VIOLATION_RECIPIENT_PER_TX_LIMIT: u8 = 14;

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    live_tokens::require_live_token_smoke()?;
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    println!("Payer: {owner}");

    let scenario = live_tokens::prepare_live_aura_scenario(
        &rpc,
        &payer,
        live_tokens::LiveAuraScenarioConfig {
            prefix: "live-policy-transfer".to_string(),
            ..Default::default()
        },
    )
    .await?;

    println!("\n[policy] over per-transaction limit is denied without moving funds");
    let mut over_per_tx =
        live_tokens::base_transfer_proposal_args(&scenario, aura_devnet::now_unix());
    over_per_tx.amount_usd = scenario.allowed_per_tx_usd + 1;
    over_per_tx.expected_output_usd = Some(over_per_tx.amount_usd);
    over_per_tx.actual_output_usd = Some(over_per_tx.amount_usd);
    live_tokens::assert_denied_proposal(
        &rpc,
        &payer,
        &scenario,
        "per-tx-limit",
        over_per_tx,
        VIOLATION_PER_TRANSACTION_LIMIT,
        false,
    )?;

    println!("\n[policy] recipient per-transaction cap is denied without moving funds");
    live_tokens::assert_denied_proposal(
        &rpc,
        &payer,
        &scenario,
        "recipient-per-tx-limit",
        live_tokens::base_transfer_proposal_args(&scenario, aura_devnet::now_unix()),
        VIOLATION_RECIPIENT_PER_TX_LIMIT,
        false,
    )?;

    live_tokens::set_recipient_limit(
        &rpc,
        &payer,
        &scenario,
        scenario.amount_usd * 100,
        Some(scenario.allowed_per_tx_usd),
        aura_devnet::now_unix(),
    )?;

    println!("\n[policy] stale quote is denied without moving funds");
    let mut stale_quote =
        live_tokens::base_transfer_proposal_args(&scenario, aura_devnet::now_unix());
    stale_quote.quote_age_secs = Some(301);
    live_tokens::assert_denied_proposal(
        &rpc,
        &payer,
        &scenario,
        "stale-quote",
        stale_quote,
        VIOLATION_QUOTE_STALE,
        false,
    )?;

    println!("\n[policy] high counterparty risk is denied without moving funds");
    let mut risky = live_tokens::base_transfer_proposal_args(&scenario, aura_devnet::now_unix());
    risky.counterparty_risk_score = Some(100);
    live_tokens::assert_denied_proposal(
        &rpc,
        &payer,
        &scenario,
        "counterparty-risk",
        risky,
        VIOLATION_COUNTERPARTY_RISK,
        false,
    )?;

    println!("\n[policy] approved proposal signs, broadcasts, and settles a real SPL transfer");
    let result = live_tokens::execute_approved_live_dwallet_transfer(
        &rpc,
        &payer,
        &scenario,
        "policy-approved live transfer",
    )
    .await?;
    println!("\n=== live policy transfer result ===");
    println!("target signature: {}", result.signature);
    println!(
        "transfer amount : {}",
        live_tokens::raw_amount_to_ui(result.amount_raw, scenario.asset.decimals)
    );
    println!(
        "source after    : {}",
        live_tokens::raw_amount_to_ui(result.after_source.amount, scenario.asset.decimals)
    );
    println!(
        "recipient after : {}",
        live_tokens::raw_amount_to_ui(result.after_destination.amount, scenario.asset.decimals)
    );

    println!("\nlive policy-transfer smoke checks passed on devnet.");
    Ok(())
}
