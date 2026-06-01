//! Devnet stress checks for pending-flow hardening.
//!
//! Covers the state-machine paths that are easy to regress while the protocol
//! is growing: scheduled runs promote into ordinary pending proposals,
//! conditional proposals park before triggering, and asset-aware wallet
//! reservations are released when pending execution is cancelled or expires.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{
    accounts, instruction, ConditionalProposal, ConditionalProposalArgs, ConditionRecord,
    DWalletAccount, ProposeTransactionArgs, RegisterDwalletArgs, ScheduleRecipient,
    ScheduledIntent, ScheduledIntentArgs, ID,
};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, fetch_treasury_domain, load_payer,
    now_unix, pda, send_tx,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

const ETH: u8 = 1;
const TRANSFER: u8 = 0;
const STATUS_AWAITING_CONDITION: u8 = 7;
const STATUS_TRIGGERED: u8 = 8;

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data,
    }
}

fn unique_agent_id(prefix: &str, now: i64) -> String {
    let suffix = Keypair::new().pubkey().to_string();
    format!("{prefix}-{now}-{}", &suffix[..8])
}

fn create_active_treasury(
    rpc: &RpcClient,
    payer: &Keypair,
    prefix: &str,
    now: i64,
) -> anyhow::Result<Pubkey> {
    let agent_id = unique_agent_id(prefix, now);
    let treasury = pda(&[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()], &ID).0;
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

fn fetch_account<T: AccountDeserialize>(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<T> {
    let info = rpc.get_account(addr)?;
    Ok(T::try_deserialize(&mut info.data.as_slice())?)
}

fn proposal_args(now: i64, amount_usd: u64, recipient: &str) -> ProposeTransactionArgs {
    ProposeTransactionArgs {
        amount_usd,
        target_chain: ETH,
        tx_type: TRANSFER,
        protocol_id: None,
        current_timestamp: now,
        expected_output_usd: None,
        actual_output_usd: None,
        quote_age_secs: None,
        counterparty_risk_score: None,
        recipient_or_contract: recipient.to_string(),
        sanctions_proof: Vec::new(),
        asset_id: None,
        native_amount: None,
        decimals: None,
        gas_native_amount: None,
        gas_asset_id: None,
        evm_chain_id: None,
        replay_nonce: None,
        gas_limit: None,
        max_fee_native: None,
        calldata_hash: None,
        utxo_set_hash: None,
        sighash_type: None,
        solana_recent_blockhash: None,
        solana_message_hash: None,
        confirmations_required: None,
    }
}

fn propose_public(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    args: ProposeTransactionArgs,
    dwallet_state: Option<Pubkey>,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ProposeTransaction {
                ai_authority: payer.pubkey(),
                treasury,
                session_key_account: None,
                swarm_pool: None,
                address_list: None,
                compliance_oracle: None,
                parent_treasury: None,
                budget_envelope: None,
                exposure_group: None,
                dwallet_state,
                chain_profile: None,
            }
            .to_account_metas(None),
            instruction::ProposeTransaction { args }.data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn cancel_pending(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    dwallet_state: Option<Pubkey>,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::CancelPending {
                owner: payer.pubkey(),
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::CancelPending { now }.data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn setup_wallet(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    now: i64,
) -> anyhow::Result<Pubkey> {
    let owner = payer.pubkey();
    let dwallet_state = pda(&[b"dwallet_state", treasury.as_ref(), &[ETH]], &ID).0;

    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::RegisterDwallet { owner, treasury }.to_account_metas(None),
            instruction::RegisterDwallet {
                args: RegisterDwalletArgs {
                    chain: ETH,
                    dwallet_id: format!("hardening-eth-{now}"),
                    address: "0xBB00000000000000000000000000000000000000".to_string(),
                    balance_usd: 0,
                    dwallet_account: Some(Keypair::new().pubkey()),
                    authorized_user_pubkey: Some(owner),
                    message_metadata_digest: None,
                    public_key_hex: Some(hex::encode([0x55u8; 32])),
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
                owner,
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

    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::DwalletControl {
                owner,
                treasury,
                dwallet_state,
            }
            .to_account_metas(None),
            instruction::RecordDeposit {
                chain: ETH,
                asset_id: "usdc".to_string(),
                symbol: "USDC".to_string(),
                decimals: 6,
                native_amount: 1_000_000_000,
                usd_value: 1_000,
                now: now + 2,
            }
            .data(),
        )],
        &[],
    )?;

    Ok(dwallet_state)
}

fn run_scheduled_recovery(rpc: &RpcClient, payer: &Keypair, seed: i64) -> anyhow::Result<()> {
    println!("\n[scheduled] promotion and abandoned-run recovery");
    let treasury = create_active_treasury(rpc, payer, "hard-sched", seed)?;
    let intent_id = 7u64;
    let scheduled_intent =
        pda(&[b"scheduled_intent", treasury.as_ref(), &intent_id.to_le_bytes()], &ID).0;

    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::CreateScheduledIntent {
                owner: payer.pubkey(),
                treasury,
                scheduled_intent,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::CreateScheduledIntent {
                intent_id,
                args: ScheduledIntentArgs {
                    kind: 0,
                    chain: ETH,
                    tx_type: TRANSFER,
                    interval_secs: 60,
                    start_at: seed - 60,
                    end_at: None,
                    max_runs: Some(3),
                    per_run_limit_usd: 500,
                    total_budget_usd: Some(1_000),
                    recipients: vec![ScheduleRecipient {
                        address: "0xCC00000000000000000000000000000000000000".to_string(),
                        amount_usd: 200,
                    }],
                    amount_usd: 200,
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

    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ExecuteScheduledIntent {
                caller: payer.pubkey(),
                treasury,
                scheduled_intent,
                condition_feed: None,
            }
            .to_account_metas(None),
            instruction::ExecuteScheduledIntent {}.data(),
        )],
        &[],
    )?;

    let intent: ScheduledIntent = fetch_account(rpc, &scheduled_intent)?;
    let proposal_id = intent
        .in_flight_proposal_id
        .ok_or_else(|| anyhow::anyhow!("scheduled run did not promote"))?;
    anyhow::ensure!(intent.in_flight_usd == 200, "in-flight amount not recorded");
    anyhow::ensure!(intent.spent_usd == 0, "scheduled spend settled before finalize");
    anyhow::ensure!(intent.runs_completed == 0, "run counter advanced before finalize");
    anyhow::ensure!(
        fetch_treasury_domain(rpc, &treasury)?.pending.is_some(),
        "promoted proposal missing from treasury"
    );

    let close_result = send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::CloseScheduledIntent {
                owner: payer.pubkey(),
                treasury,
                scheduled_intent,
            }
            .to_account_metas(None),
            instruction::CloseScheduledIntent {}.data(),
        )],
        &[],
    );
    anyhow::ensure!(
        close_result.is_err(),
        "scheduled intent closed while proposal was in flight"
    );

    cancel_pending(rpc, payer, treasury, None, seed + 10)?;
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ClearScheduledIntentInFlight {
                owner: payer.pubkey(),
                treasury,
                scheduled_intent,
            }
            .to_account_metas(None),
            instruction::ClearScheduledIntentInFlight {
                proposal_id,
                now: seed + 11,
            }
            .data(),
        )],
        &[],
    )?;

    let intent: ScheduledIntent = fetch_account(rpc, &scheduled_intent)?;
    anyhow::ensure!(
        intent.in_flight_proposal_id.is_none() && intent.in_flight_usd == 0,
        "scheduled in-flight state not cleared"
    );
    anyhow::ensure!(intent.spent_usd == 0, "recovery consumed scheduled budget");

    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::CloseScheduledIntent {
                owner: payer.pubkey(),
                treasury,
                scheduled_intent,
            }
            .to_account_metas(None),
            instruction::CloseScheduledIntent {}.data(),
        )],
        &[],
    )?;
    println!("  ok promoted, blocked duplicate close, recovered, then closed");
    Ok(())
}

fn run_conditional_trigger(rpc: &RpcClient, payer: &Keypair, seed: i64) -> anyhow::Result<()> {
    println!("\n[conditional] parked proposal triggers into pending flow");
    let treasury = create_active_treasury(rpc, payer, "hard-cond", seed + 100)?;
    let proposal_id = 11u64;
    let conditional_proposal = pda(
        &[
            b"conditional_proposal",
            treasury.as_ref(),
            &proposal_id.to_le_bytes(),
        ],
        &ID,
    )
    .0;
    let start = seed - 5;
    let end = seed + 3_600;

    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ProposeConditionalTransaction {
                ai_authority: payer.pubkey(),
                treasury,
                conditional_proposal,
                condition_feed: None,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::ProposeConditionalTransaction {
                proposal_id,
                args: ConditionalProposalArgs {
                    amount_usd: 250,
                    target_chain: ETH,
                    tx_type: TRANSFER,
                    protocol_id: None,
                    recipient_or_contract: "0xDD00000000000000000000000000000000000000"
                        .to_string(),
                    ttl_secs: 7_200,
                    conditions: vec![ConditionRecord {
                        kind: 2,
                        feed: None,
                        oracle_provider: 255,
                        oracle_program_id: None,
                        oracle_max_staleness_secs: 0,
                        oracle_max_confidence_bps: 0,
                        oracle_expo_expected: None,
                        threshold: 0,
                        window_start: start,
                        window_end: end,
                        negate: false,
                    }],
                    combinator: 0,
                    now: seed - 3_600,
                },
            }
            .data(),
        )],
        &[],
    )?;

    let parked: ConditionalProposal = fetch_account(rpc, &conditional_proposal)?;
    anyhow::ensure!(
        parked.status == STATUS_AWAITING_CONDITION,
        "conditional proposal did not park"
    );
    anyhow::ensure!(
        fetch_treasury_domain(rpc, &treasury)?.pending.is_none(),
        "parked conditional created pending too early"
    );

    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::TryTrigger {
                caller: payer.pubkey(),
                treasury,
                conditional_proposal,
                condition_feed: None,
            }
            .to_account_metas(None),
            instruction::TryTrigger {}.data(),
        )],
        &[],
    )?;

    let triggered: ConditionalProposal = fetch_account(rpc, &conditional_proposal)?;
    anyhow::ensure!(
        triggered.status == STATUS_TRIGGERED && triggered.promoted_proposal_id.is_some(),
        "conditional proposal did not record triggered promotion"
    );
    anyhow::ensure!(
        fetch_treasury_domain(rpc, &treasury)?.pending.is_some(),
        "triggered conditional did not create pending proposal"
    );

    cancel_pending(rpc, payer, treasury, None, seed + 20)?;
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::CloseConditionalProposal {
                owner: payer.pubkey(),
                treasury,
                conditional_proposal,
            }
            .to_account_metas(None),
            instruction::CloseConditionalProposal {}.data(),
        )],
        &[],
    )?;
    println!("  ok parked, triggered, promoted, and closed");
    Ok(())
}

fn run_asset_reservation_release(
    rpc: &RpcClient,
    payer: &Keypair,
    seed: i64,
) -> anyhow::Result<()> {
    println!("\n[asset-aware] reservation releases on cancel and expiry");
    let treasury = create_active_treasury(rpc, payer, "hard-asset", seed + 200)?;
    let dwallet_state = setup_wallet(rpc, payer, treasury, seed + 202)?;

    let mut cancel_args = proposal_args(seed + 205, 300, "0xEE00000000000000000000000000000000000000");
    cancel_args.asset_id = Some("usdc".to_string());
    cancel_args.native_amount = Some(300_000_000);
    cancel_args.decimals = Some(6);
    cancel_args.gas_native_amount = Some(1_000_000);
    cancel_args.gas_asset_id = Some("usdc".to_string());
    propose_public(rpc, payer, treasury, cancel_args, Some(dwallet_state))?;

    let dw: DWalletAccount = fetch_account(rpc, &dwallet_state)?;
    anyhow::ensure!(dw.reserved_usd == 300, "asset proposal did not reserve");
    cancel_pending(rpc, payer, treasury, Some(dwallet_state), seed + 206)?;
    let dw: DWalletAccount = fetch_account(rpc, &dwallet_state)?;
    anyhow::ensure!(dw.reserved_usd == 0, "cancel did not release reservation");

    let mut expired_args = proposal_args(seed - 2_000, 200, "0xEF00000000000000000000000000000000000000");
    expired_args.asset_id = Some("usdc".to_string());
    expired_args.native_amount = Some(200_000_000);
    expired_args.decimals = Some(6);
    propose_public(rpc, payer, treasury, expired_args, Some(dwallet_state))?;
    let dw: DWalletAccount = fetch_account(rpc, &dwallet_state)?;
    anyhow::ensure!(dw.reserved_usd == 200, "expired proposal did not reserve");

    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ExecutePending {
                operator: payer.pubkey(),
                treasury,
                message_approval: None,
                dwallet_coordinator: None,
                dwallet: None,
                caller_program: ID,
                cpi_authority: None,
                dwallet_program: None,
                external_liveness: None,
                dwallet_state: Some(dwallet_state),
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::ExecutePending { now: seed + 207 }.data(),
        )],
        &[],
    )?;
    let dw: DWalletAccount = fetch_account(rpc, &dwallet_state)?;
    anyhow::ensure!(dw.reserved_usd == 0, "expiry did not release reservation");
    anyhow::ensure!(
        fetch_treasury_domain(rpc, &treasury)?.pending.is_none(),
        "expired proposal remained pending"
    );
    println!("  ok reservation returns on cancel and expiry");
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    run_scheduled_recovery(&rpc, &payer, seed)?;
    run_conditional_trigger(&rpc, &payer, seed)?;
    run_asset_reservation_release(&rpc, &payer, seed)?;

    println!("\npending-flow hardening smoke checks passed on devnet.");
    Ok(())
}
