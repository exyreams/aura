//! Opt-in live-token smoke for conditional funded-context transfers.
//!
//! Promotes one immediate conditional proposal into the pending queue, parks a
//! second behind a future time window, and verifies no token balances move.

use anchor_lang::{
    system_program::ID as SYSTEM_PROGRAM_ID, AccountDeserialize, InstructionData, ToAccountMetas,
};
use anyhow::ensure;
use aura_core::{
    accounts, instruction, ConditionRecord, ConditionalProposal, ConditionalProposalArgs, ID,
};
use aura_devnet::{
    devnet_rpc, fetch_treasury_domain, live_tokens, load_payer, now_unix, pda, send_tx,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

const CONDITION_TIME_WINDOW: u8 = 2;
const STATUS_AWAITING_CONDITION: u8 = 7;
const STATUS_TRIGGERED: u8 = 8;

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

fn conditional_pda(treasury: Pubkey, proposal_id: u64) -> Pubkey {
    pda(
        &[
            b"conditional_proposal",
            treasury.as_ref(),
            &proposal_id.to_le_bytes(),
        ],
        &ID,
    )
    .0
}

fn future_time_window(now: i64, opens_in_secs: i64) -> ConditionRecord {
    let start = now + opens_in_secs;
    ConditionRecord {
        kind: CONDITION_TIME_WINDOW,
        feed: None,
        oracle_provider: 255,
        oracle_program_id: None,
        oracle_max_staleness_secs: 0,
        oracle_max_confidence_bps: 0,
        oracle_expo_expected: None,
        threshold: 0,
        window_start: start,
        window_end: start + 86_400,
        negate: false,
    }
}

fn propose_conditional_ix(
    owner: Pubkey,
    treasury: Pubkey,
    conditional_proposal: Pubkey,
    proposal_id: u64,
    args: ConditionalProposalArgs,
) -> Instruction {
    ix(
        accounts::ProposeConditionalTransaction {
            ai_authority: owner,
            treasury,
            conditional_proposal,
            condition_feed: None,
            system_program: SYSTEM_PROGRAM_ID,
        }
        .to_account_metas(None),
        instruction::ProposeConditionalTransaction { proposal_id, args }.data(),
    )
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
            prefix: "live-conditional".to_string(),
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
    let recipient = scenario.destination_owner.to_string();

    println!("\n[conditional] immediate condition promotes to pending");
    let immediate_proposal_id =
        now as u64 ^ u64::from(Keypair::new().pubkey().to_bytes()[0]) ^ 0xA11CE;
    let immediate_conditional = conditional_pda(scenario.treasury, immediate_proposal_id);
    send_tx(
        &rpc,
        &payer,
        vec![propose_conditional_ix(
            owner,
            scenario.treasury,
            immediate_conditional,
            immediate_proposal_id,
            ConditionalProposalArgs {
                amount_usd: scenario.amount_usd,
                target_chain: live_tokens::CHAIN_SOLANA,
                tx_type: live_tokens::TX_TYPE_TRANSFER,
                protocol_id: None,
                recipient_or_contract: recipient.clone(),
                ttl_secs: 3_600,
                conditions: Vec::new(),
                combinator: 0,
                now: now_unix(),
            },
        )],
        &[],
    )?;
    let immediate: ConditionalProposal = fetch_account(&rpc, &immediate_conditional)?;
    ensure!(
        immediate.status == STATUS_TRIGGERED,
        "immediate conditional did not trigger"
    );
    let promoted_id = immediate
        .promoted_proposal_id
        .ok_or_else(|| anyhow::anyhow!("immediate conditional did not record promoted proposal"))?;
    let domain = fetch_treasury_domain(&rpc, &scenario.treasury)?;
    let promoted = domain
        .pending
        .as_ref()
        .ok_or_else(|| anyhow::anyhow!("immediate conditional did not create pending proposal"))?;
    ensure!(
        promoted.proposal_id == promoted_id,
        "conditional promoted proposal id mismatch"
    );
    ensure!(
        promoted.decision.approved,
        "immediate conditional pending was denied"
    );
    ensure!(
        promoted.recipient_or_contract == recipient,
        "conditional promoted recipient mismatch"
    );
    live_tokens::cancel_pending(&rpc, &payer, scenario.treasury, now_unix())?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CloseConditionalProposal {
                owner,
                treasury: scenario.treasury,
                conditional_proposal: immediate_conditional,
            }
            .to_account_metas(None),
            instruction::CloseConditionalProposal {}.data(),
        )],
        &[],
    )?;

    println!("\n[conditional] future time window parks and refuses trigger");
    let parked_proposal_id = immediate_proposal_id + 1;
    let parked_conditional = conditional_pda(scenario.treasury, parked_proposal_id);
    send_tx(
        &rpc,
        &payer,
        vec![propose_conditional_ix(
            owner,
            scenario.treasury,
            parked_conditional,
            parked_proposal_id,
            ConditionalProposalArgs {
                amount_usd: scenario.amount_usd,
                target_chain: live_tokens::CHAIN_SOLANA,
                tx_type: live_tokens::TX_TYPE_TRANSFER,
                protocol_id: None,
                recipient_or_contract: recipient.clone(),
                ttl_secs: 3 * 86_400,
                conditions: vec![future_time_window(now_unix(), 86_400)],
                combinator: 0,
                now: now_unix(),
            },
        )],
        &[],
    )?;
    let parked: ConditionalProposal = fetch_account(&rpc, &parked_conditional)?;
    ensure!(
        parked.status == STATUS_AWAITING_CONDITION,
        "parked conditional did not await condition"
    );
    ensure!(
        parked.promoted_proposal_id.is_none(),
        "parked conditional promoted too early"
    );
    ensure!(
        fetch_treasury_domain(&rpc, &scenario.treasury)?
            .pending
            .is_none(),
        "parked conditional created pending state"
    );

    let trigger_result = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::TryTrigger {
                caller: owner,
                treasury: scenario.treasury,
                conditional_proposal: parked_conditional,
                condition_feed: None,
            }
            .to_account_metas(None),
            instruction::TryTrigger {}.data(),
        )],
        &[],
    );
    ensure!(
        trigger_result.is_err(),
        "parked future conditional triggered before condition window"
    );

    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CloseConditionalProposal {
                owner,
                treasury: scenario.treasury,
                conditional_proposal: parked_conditional,
            }
            .to_account_metas(None),
            instruction::CloseConditionalProposal {}.data(),
        )],
        &[],
    )?;

    ensure!(
        live_tokens::read_token_balance(&rpc, &scenario.source_ata)?.amount
            == scenario.before_source.amount,
        "conditional flow moved source funds"
    );
    ensure!(
        live_tokens::read_token_balance(&rpc, &scenario.destination_ata)?.amount
            == scenario.before_destination.amount,
        "conditional flow moved recipient funds"
    );

    println!("\nlive conditional-transfer smoke checks passed on devnet.");
    Ok(())
}
