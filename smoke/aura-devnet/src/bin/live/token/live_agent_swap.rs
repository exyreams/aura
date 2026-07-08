//! Opt-in live-token smoke for funded swap-intent policy checks.
//!
//! This does not execute a real swap. It verifies funded-context swap metadata
//! is scored by live devnet policy paths and unsafe swap metadata is denied
//! without moving tokens.

use anchor_lang::{InstructionData, ToAccountMetas};
use aura_core::{accounts, instruction, ProposeTransactionArgs, ID};
use aura_devnet::{devnet_rpc, fetch_treasury_domain, live_tokens, load_payer, send_tx};
use aura_policy::TransactionType;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    signature::Signer,
};

const PROTOCOL_AURA_TEST_SWAP: u8 = 1;
const PROTOCOL_BLOCKED: u8 = 5;
const VIOLATION_PROTOCOL_NOT_ALLOWED: u8 = 6;
const VIOLATION_SLIPPAGE_EXCEEDED: u8 = 7;
const VIOLATION_QUOTE_STALE: u8 = 8;
const VIOLATION_COUNTERPARTY_RISK: u8 = 9;

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data,
    }
}

fn propose_transaction_ix(
    payer: &solana_sdk::signature::Keypair,
    scenario: &live_tokens::LiveAuraScenario,
    args: ProposeTransactionArgs,
) -> Instruction {
    ix(
        accounts::ProposeTransaction {
            ai_authority: payer.pubkey(),
            treasury: scenario.treasury,
            session_key_account: None,
            swarm_pool: None,
            address_list: None,
            compliance_oracle: None,
            parent_treasury: None,
            budget_envelope: None,
            exposure_group: None,
            dwallet_state: None,
            chain_profile: None,
            trust_identity: None,
            policy_canary: None,
        }
        .to_account_metas(None),
        instruction::ProposeTransaction { args }.data(),
    )
}

fn swap_intent_args(scenario: &live_tokens::LiveAuraScenario) -> ProposeTransactionArgs {
    let mut args = live_tokens::base_transfer_proposal_args(scenario, aura_devnet::now_unix());
    args.tx_type = live_tokens::TX_TYPE_DEFI_SWAP;
    args.protocol_id = Some(PROTOCOL_AURA_TEST_SWAP);
    args.expected_output_usd = Some(scenario.amount_usd.saturating_mul(2));
    args.actual_output_usd = args.expected_output_usd;
    args.quote_age_secs = Some(20);
    args.counterparty_risk_score = Some(15);
    args.recipient_or_contract = "aura-test-swap-venue".to_string();
    args
}

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
            prefix: "live-agent-swap".to_string(),
            policy_overrides: live_tokens::LivePolicyOverrides {
                recipient_per_tx_limit_usd: Some(None),
                ..Default::default()
            },
            ..Default::default()
        },
    )
    .await?;

    println!("\n[swap] approved swap intent is queued without token movement");
    let approved = swap_intent_args(&scenario);
    send_tx(
        &rpc,
        &payer,
        vec![propose_transaction_ix(&payer, &scenario, approved)],
        &[],
    )?;
    let domain = fetch_treasury_domain(&rpc, &scenario.treasury)?;
    let pending = domain
        .pending
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("approved swap intent did not create pending proposal"))?;
    anyhow::ensure!(pending.decision.approved, "approved swap intent was denied");
    anyhow::ensure!(
        pending.tx_type == TransactionType::DeFiSwap,
        "approved swap pending tx_type mismatch"
    );
    anyhow::ensure!(
        pending.recipient_or_contract == "aura-test-swap-venue",
        "approved swap pending recipient mismatch"
    );
    live_tokens::cancel_pending(&rpc, &payer, scenario.treasury, aura_devnet::now_unix())?;

    println!("\n[swap] excessive slippage is denied");
    let mut slippage = swap_intent_args(&scenario);
    slippage.actual_output_usd = Some(scenario.amount_usd);
    live_tokens::assert_denied_proposal(
        &rpc,
        &payer,
        &scenario,
        "swap-slippage",
        slippage,
        VIOLATION_SLIPPAGE_EXCEEDED,
        true,
    )?;

    println!("\n[swap] stale quote is denied");
    let mut stale_quote = swap_intent_args(&scenario);
    stale_quote.quote_age_secs = Some(301);
    live_tokens::assert_denied_proposal(
        &rpc,
        &payer,
        &scenario,
        "swap-stale-quote",
        stale_quote,
        VIOLATION_QUOTE_STALE,
        true,
    )?;

    println!("\n[swap] high counterparty risk is denied");
    let mut risky_counterparty = swap_intent_args(&scenario);
    risky_counterparty.counterparty_risk_score = Some(100);
    live_tokens::assert_denied_proposal(
        &rpc,
        &payer,
        &scenario,
        "swap-counterparty-risk",
        risky_counterparty,
        VIOLATION_COUNTERPARTY_RISK,
        true,
    )?;

    println!("\n[swap] blocked protocol id is denied");
    let mut blocked_protocol = swap_intent_args(&scenario);
    blocked_protocol.protocol_id = Some(PROTOCOL_BLOCKED);
    live_tokens::assert_denied_proposal(
        &rpc,
        &payer,
        &scenario,
        "swap-protocol-not-allowed",
        blocked_protocol,
        VIOLATION_PROTOCOL_NOT_ALLOWED,
        true,
    )?;

    println!("\nlive agent-swap smoke checks passed on devnet.");
    Ok(())
}
