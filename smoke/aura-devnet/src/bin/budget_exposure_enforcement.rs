//! Devnet smoke checks for budget envelope and exposure group enforcement.
//!
//! These checks stay RPC-only and assert the real proposal-time availability
//! gates. Spend counters are only consumed by settlement/finalization paths, so
//! this suite verifies accepted proposals, over-limit reverts, unchanged
//! sidecar counters after failed proposals, and exposure-group close guards.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{
    accounts, instruction, BudgetEnvelopeAccount, ConfigureBudgetEnvelopeArgs,
    ExposureGroupAccount, InitExposureGroupArgs, ProposeTransactionArgs, ID,
};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, fetch_treasury_domain, load_payer, now_unix,
    pda, send_tx,
};
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

const ETH: u8 = 1;
const TRANSFER: u8 = 0;
const CHAIN_SCOPE: u8 = 0;
const RECIPIENT: &str = "0x0000000000000000000000000000000000000b0b";

fn ix(accounts: Vec<AccountMeta>, data: Vec<u8>) -> Instruction {
    Instruction {
        program_id: ID,
        accounts,
        data,
    }
}

fn unique_agent_id(prefix: &str, now: i64) -> String {
    let suffix = Keypair::new().pubkey().to_string();
    format!("{prefix}-{:06}-{}", now.rem_euclid(1_000_000), &suffix[..8])
}

fn create_active_treasury(
    rpc: &RpcClient,
    payer: &Keypair,
    prefix: &str,
    now: i64,
) -> anyhow::Result<Pubkey> {
    let agent_id = unique_agent_id(prefix, now);
    let treasury = pda(
        &[b"treasury", payer.pubkey().as_ref(), agent_id.as_bytes()],
        &ID,
    )
    .0;
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

fn unique_group_id(seed: i64) -> [u8; 16] {
    let mut id = [0u8; 16];
    id[..8].copy_from_slice(&seed.to_le_bytes());
    id[8..].copy_from_slice(&Keypair::new().pubkey().to_bytes()[..8]);
    id
}

fn fetch_budget_envelope(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<BudgetEnvelopeAccount> {
    let info = rpc.get_account(addr)?;
    Ok(BudgetEnvelopeAccount::try_deserialize(
        &mut info.data.as_slice(),
    )?)
}

fn fetch_exposure_group(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<ExposureGroupAccount> {
    let info = rpc.get_account(addr)?;
    Ok(ExposureGroupAccount::try_deserialize(
        &mut info.data.as_slice(),
    )?)
}

fn proposal_args(now: i64, amount_usd: u64) -> ProposeTransactionArgs {
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
        recipient_or_contract: RECIPIENT.to_string(),
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
        native_message_hash: None,
        calldata_hash: None,
        utxo_set_hash: None,
        sighash_type: None,
        solana_recent_blockhash: None,
        solana_message_hash: None,
        confirmations_required: None,
    }
}

fn configure_budget_envelope(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    envelope_id: u64,
    budget_envelope: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ConfigureBudgetEnvelope {
                owner: payer.pubkey(),
                treasury,
                budget_envelope,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::ConfigureBudgetEnvelope {
                args: ConfigureBudgetEnvelopeArgs {
                    envelope_id,
                    scope_kind: CHAIN_SCOPE,
                    chain: Some(ETH),
                    tx_type: None,
                    protocol_id: None,
                    daily_limit_usd: 150,
                    weekly_limit_usd: 0,
                    now,
                },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn init_exposure_group(
    rpc: &RpcClient,
    payer: &Keypair,
    group_id: [u8; 16],
    exposure_group: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::InitExposureGroup {
                authority: payer.pubkey(),
                exposure_group,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitExposureGroup {
                args: InitExposureGroupArgs {
                    group_id,
                    daily_limit_usd: 150,
                    now_day: now,
                },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn join_exposure_group(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    exposure_group: Pubkey,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::JoinExposureGroup {
                authority: payer.pubkey(),
                exposure_group,
                treasury,
            }
            .to_account_metas(None),
            instruction::JoinExposureGroup {}.data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn leave_exposure_group(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    exposure_group: Pubkey,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ManageExposureGroup {
                authority: payer.pubkey(),
                exposure_group,
                treasury,
            }
            .to_account_metas(None),
            instruction::LeaveExposureGroup {}.data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn close_exposure_group(
    rpc: &RpcClient,
    payer: &Keypair,
    exposure_group: Pubkey,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::CloseExposureGroup {
                authority: payer.pubkey(),
                exposure_group,
            }
            .to_account_metas(None),
            instruction::CloseExposureGroup {}.data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn propose_with_sidecars(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    budget_envelope: Option<Pubkey>,
    exposure_group: Option<Pubkey>,
    amount_usd: u64,
    now: i64,
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
                budget_envelope,
                exposure_group,
                dwallet_state: None,
                chain_profile: None,
                trust_identity: None,
                policy_canary: None,
            }
            .to_account_metas(None),
            instruction::ProposeTransaction {
                args: proposal_args(now, amount_usd),
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn run_budget_envelope(rpc: &RpcClient, payer: &Keypair, seed: i64) -> anyhow::Result<()> {
    println!("\n[budget envelope] within-limit proposal accepted, over-limit rejected");
    let treasury = create_active_treasury(rpc, payer, "budget-envelope", seed)?;
    let envelope_id = seed as u64;
    let envelope_id_bytes = envelope_id.to_le_bytes();
    let budget_envelope = pda(
        &[
            b"budget_envelope",
            treasury.as_ref(),
            envelope_id_bytes.as_ref(),
        ],
        &ID,
    )
    .0;
    configure_budget_envelope(rpc, payer, treasury, envelope_id, budget_envelope, seed + 2)?;
    let envelope = fetch_budget_envelope(rpc, &budget_envelope)?;
    anyhow::ensure!(
        envelope.daily_limit_usd == 150 && envelope.chain == Some(ETH),
        "budget envelope config mismatch"
    );

    propose_with_sidecars(
        rpc,
        payer,
        treasury,
        Some(budget_envelope),
        None,
        100,
        seed + 3,
    )?;
    let domain = fetch_treasury_domain(rpc, &treasury)?;
    anyhow::ensure!(
        domain
            .pending_queue
            .last()
            .is_some_and(|pending| pending.amount_usd == 100 && pending.decision.approved),
        "within-limit budget proposal was not approved"
    );
    let pending_count = domain.pending_queue.len();

    let over_limit = propose_with_sidecars(
        rpc,
        payer,
        treasury,
        Some(budget_envelope),
        None,
        200,
        seed + 4,
    );
    anyhow::ensure!(
        over_limit.is_err(),
        "over-limit budget proposal should hard-revert"
    );
    let domain = fetch_treasury_domain(rpc, &treasury)?;
    anyhow::ensure!(
        domain.pending_queue.len() == pending_count,
        "failed budget proposal mutated pending queue"
    );
    let envelope = fetch_budget_envelope(rpc, &budget_envelope)?;
    anyhow::ensure!(
        envelope.spent_today_usd == 0 && envelope.spent_week_usd == 0,
        "failed budget proposal mutated envelope counters"
    );
    println!("  ok budget envelope availability gate enforced");
    Ok(())
}

fn run_exposure_group(rpc: &RpcClient, payer: &Keypair, seed: i64) -> anyhow::Result<()> {
    println!("\n[exposure group] member proposal accepted, over-limit and busy close rejected");
    let treasury = create_active_treasury(rpc, payer, "exposure-group", seed + 100)?;
    let group_id = unique_group_id(seed + 100);
    let exposure_group = pda(
        &[b"exposure_group", payer.pubkey().as_ref(), &group_id],
        &ID,
    )
    .0;
    init_exposure_group(rpc, payer, group_id, exposure_group, seed + 102)?;
    join_exposure_group(rpc, payer, treasury, exposure_group)?;
    let group = fetch_exposure_group(rpc, &exposure_group)?;
    anyhow::ensure!(
        group.member_count == 1 && group.members == vec![treasury],
        "exposure group membership mismatch"
    );

    propose_with_sidecars(
        rpc,
        payer,
        treasury,
        None,
        Some(exposure_group),
        100,
        seed + 103,
    )?;
    let domain = fetch_treasury_domain(rpc, &treasury)?;
    anyhow::ensure!(
        domain
            .pending_queue
            .last()
            .is_some_and(|pending| pending.amount_usd == 100 && pending.decision.approved),
        "within-limit exposure proposal was not approved"
    );
    let pending_count = domain.pending_queue.len();

    let over_limit = propose_with_sidecars(
        rpc,
        payer,
        treasury,
        None,
        Some(exposure_group),
        200,
        seed + 104,
    );
    anyhow::ensure!(
        over_limit.is_err(),
        "over-limit exposure proposal should hard-revert"
    );
    let domain = fetch_treasury_domain(rpc, &treasury)?;
    anyhow::ensure!(
        domain.pending_queue.len() == pending_count,
        "failed exposure proposal mutated pending queue"
    );
    let group = fetch_exposure_group(rpc, &exposure_group)?;
    anyhow::ensure!(
        group.spent_today_usd == 0,
        "failed exposure proposal mutated group counter"
    );

    let close_busy = close_exposure_group(rpc, payer, exposure_group);
    anyhow::ensure!(
        close_busy.is_err(),
        "busy exposure group close should reject while member is linked"
    );
    leave_exposure_group(rpc, payer, treasury, exposure_group)?;
    let group = fetch_exposure_group(rpc, &exposure_group)?;
    anyhow::ensure!(group.member_count == 0, "exposure group member not removed");
    close_exposure_group(rpc, payer, exposure_group)?;
    anyhow::ensure!(
        rpc.get_account(&exposure_group).is_err(),
        "closed exposure group account still exists"
    );
    println!("  ok exposure group availability and close guards enforced");
    Ok(())
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    run_budget_envelope(&rpc, &payer, seed)?;
    run_exposure_group(&rpc, &payer, seed)?;

    println!("\nbudget/exposure enforcement smoke checks passed on devnet.");
    Ok(())
}
