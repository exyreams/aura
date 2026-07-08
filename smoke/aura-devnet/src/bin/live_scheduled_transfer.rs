//! Opt-in live-token smoke for scheduled funded-context transfers.
//!
//! A due scheduled intent promotes into the ordinary pending queue against a
//! funded live dWallet context, then the pending proposal is cancelled and the
//! in-flight slot is cleared. No token transfer is signed or broadcast.

use anchor_lang::{
    system_program::ID as SYSTEM_PROGRAM_ID, AccountDeserialize, InstructionData, ToAccountMetas,
};
use anyhow::ensure;
use aura_core::{
    accounts, instruction, ScheduleRecipient, ScheduledIntent, ScheduledIntentArgs, ID,
};
use aura_devnet::{
    devnet_rpc, fetch_treasury_domain, live_tokens, load_payer, now_unix, pda, send_tx,
};
use aura_policy::{Chain, TransactionType};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data,
    }
}

fn fetch_account<T: AccountDeserialize>(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<T> {
    let info = rpc.get_account(addr)?;
    Ok(T::try_deserialize(&mut info.data.as_slice())?)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    live_tokens::require_live_token_smoke()?;
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let now = now_unix();
    println!("Payer: {owner}");

    let scenario = live_tokens::prepare_live_aura_scenario(
        &rpc,
        &payer,
        live_tokens::LiveAuraScenarioConfig {
            prefix: "live-schedule".to_string(),
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
        now_unix(),
    )?;

    let intent_id = now as u64 ^ u64::from(Keypair::new().pubkey().to_bytes()[0]);
    let scheduled_intent = pda(
        &[
            b"scheduled_intent",
            scenario.treasury.as_ref(),
            &intent_id.to_le_bytes(),
        ],
        &ID,
    )
    .0;
    let start_at = now - 120;

    println!("\n[scheduled] creating due funded-context transfer intent");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CreateScheduledIntent {
                owner,
                treasury: scenario.treasury,
                scheduled_intent,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::CreateScheduledIntent {
                intent_id,
                args: ScheduledIntentArgs {
                    kind: 0,
                    chain: live_tokens::CHAIN_SOLANA,
                    tx_type: live_tokens::TX_TYPE_TRANSFER,
                    interval_secs: 3_600,
                    start_at,
                    end_at: None,
                    max_runs: None,
                    per_run_limit_usd: scenario.allowed_per_tx_usd,
                    total_budget_usd: Some(scenario.allowed_per_tx_usd * 3),
                    recipients: vec![ScheduleRecipient {
                        address: scenario.destination_owner.to_string(),
                        amount_usd: 0,
                    }],
                    amount_usd: scenario.amount_usd,
                    skip_on_deny: false,
                    catch_up: false,
                    keeper: None,
                    conditions: Vec::new(),
                    combinator: 0,
                },
            }
            .data(),
        )],
        &[],
    )?;

    let intent: ScheduledIntent = fetch_account(&rpc, &scheduled_intent)?;
    ensure!(intent.enabled, "scheduled intent not enabled");
    ensure!(
        intent.next_run_at == start_at,
        "scheduled next_run_at mismatch"
    );
    ensure!(
        intent.amount_usd == scenario.amount_usd,
        "scheduled amount mismatch"
    );
    ensure!(
        intent.in_flight_proposal_id.is_none(),
        "new scheduled intent unexpectedly in flight"
    );

    println!("\n[scheduled] executing due intent promotes an approved pending proposal");
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ExecuteScheduledIntent {
                caller: owner,
                treasury: scenario.treasury,
                scheduled_intent,
                condition_feed: None,
            }
            .to_account_metas(None),
            instruction::ExecuteScheduledIntent {}.data(),
        )],
        &[],
    )?;

    let intent: ScheduledIntent = fetch_account(&rpc, &scheduled_intent)?;
    let proposal_id = intent
        .in_flight_proposal_id
        .ok_or_else(|| anyhow::anyhow!("scheduled run was not marked in flight"))?;
    ensure!(
        intent.in_flight_usd == scenario.amount_usd,
        "scheduled in-flight amount mismatch"
    );
    ensure!(
        intent.runs_completed == 0,
        "scheduled run completed before settlement"
    );
    let domain = fetch_treasury_domain(&rpc, &scenario.treasury)?;
    let pending = domain
        .pending
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("scheduled run did not create pending proposal"))?;
    ensure!(
        pending.proposal_id == proposal_id,
        "scheduled pending proposal id mismatch"
    );
    ensure!(pending.decision.approved, "scheduled pending was denied");
    ensure!(
        pending.target_chain == Chain::Solana,
        "scheduled pending chain mismatch"
    );
    ensure!(
        pending.tx_type == TransactionType::Transfer,
        "scheduled pending tx_type mismatch"
    );
    ensure!(
        pending.recipient_or_contract == scenario.destination_owner.to_string(),
        "scheduled pending recipient mismatch"
    );
    ensure!(
        pending.amount_usd == scenario.amount_usd,
        "scheduled pending amount mismatch"
    );

    println!("\n[scheduled] cancelling promoted pending proposal and clearing in-flight state");
    live_tokens::cancel_pending(&rpc, &payer, scenario.treasury, now_unix())?;
    ensure!(
        fetch_treasury_domain(&rpc, &scenario.treasury)?
            .pending
            .is_none(),
        "scheduled pending queue not cleared"
    );
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ClearScheduledIntentInFlight {
                owner,
                treasury: scenario.treasury,
                scheduled_intent,
            }
            .to_account_metas(None),
            instruction::ClearScheduledIntentInFlight {
                proposal_id,
                now: now_unix(),
            }
            .data(),
        )],
        &[],
    )?;
    let intent: ScheduledIntent = fetch_account(&rpc, &scheduled_intent)?;
    ensure!(
        intent.in_flight_proposal_id.is_none() && intent.in_flight_usd == 0,
        "scheduled in-flight state not cleared"
    );

    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CloseScheduledIntent {
                owner,
                treasury: scenario.treasury,
                scheduled_intent,
            }
            .to_account_metas(None),
            instruction::CloseScheduledIntent {}.data(),
        )],
        &[],
    )?;

    ensure!(
        live_tokens::read_token_balance(&rpc, &scenario.source_ata)?.amount
            == scenario.before_source.amount,
        "scheduled flow moved source funds"
    );
    ensure!(
        live_tokens::read_token_balance(&rpc, &scenario.destination_ata)?.amount
            == scenario.before_destination.amount,
        "scheduled flow moved recipient funds"
    );

    println!("\nlive scheduled-transfer smoke checks passed on devnet.");
    Ok(())
}
