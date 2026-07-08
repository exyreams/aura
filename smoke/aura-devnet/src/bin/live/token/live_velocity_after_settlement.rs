//! Opt-in live-token smoke for velocity limits after committed settlement.
//!
//! Performs one real dWallet-signed SPL transfer, confirms settlement, then
//! verifies a second same-sized proposal is denied by the committed velocity
//! window without moving more tokens.

use aura_devnet::{devnet_rpc, live_tokens, load_payer};
use solana_sdk::signature::Signer;

const VIOLATION_VELOCITY_LIMIT: u8 = 5;

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
            prefix: "live-velocity".to_string(),
            policy_overrides: live_tokens::LivePolicyOverrides {
                velocity_limit_equals_amount: true,
                ..Default::default()
            },
            ..Default::default()
        },
    )
    .await?;
    live_tokens::set_recipient_limit(
        &rpc,
        &payer,
        &scenario,
        scenario.amount_usd * 100,
        Some(scenario.allowed_per_tx_usd),
        aura_devnet::now_unix(),
    )?;

    println!("\n[velocity] primer transfer signs, broadcasts, and settles");
    let first = live_tokens::execute_approved_live_dwallet_transfer(
        &rpc,
        &payer,
        &scenario,
        "velocity-primer-transfer",
    )
    .await?;
    println!("  primer signature: {}", first.signature);

    println!("\n[velocity] second transfer is denied by committed velocity spend");
    live_tokens::assert_denied_proposal(
        &rpc,
        &payer,
        &scenario,
        "velocity-second-transfer",
        live_tokens::base_transfer_proposal_args(&scenario, aura_devnet::now_unix()),
        VIOLATION_VELOCITY_LIMIT,
        true,
    )?;

    println!("\nlive velocity-after-settlement smoke checks passed on devnet.");
    Ok(())
}
