//! Devnet smoke checks for fee models, accrual, and billing templates.
//!
//! Test sequence:
//!   1. `init_fee_schedule` + `update_fee_schedule` — per-type/tiered schedule.
//!   2. `deposit_fees` / `set_fee_splits` / `withdraw_unused_fees` — prepaid vault.
//!   3. `create_billing_template` (fork a `BillingProfileKind`) + `apply_billing_template`.
//!   4. `apply_org_profile` — policy + billing applied in one call.
//!   5. Live dWallet finalization with `fee_vault` + `fee_schedule`, followed by
//!      `collect_fees`.

use anchor_lang::{
    system_program::ID as SYSTEM_PROGRAM_ID, AccountDeserialize, InstructionData, ToAccountMetas,
};
use aura_core::{
    accounts,
    constants::{BILLING_TEMPLATE_SEED, FEE_SCHEDULE_SEED, FEE_VAULT_SEED, POLICY_TEMPLATE_SEED},
    instruction, CreateBillingTemplateArgs, CreatePolicyTemplateArgs, FeeScheduleAccount,
    FeeScheduleRecord, FeeSplitRecord, FeeTierRecord, FeeTypeRateRecord, FeeVaultAccount,
    ProposeTransactionArgs, TreasuryAccount, ID,
};
use aura_devnet::{
    activate_treasury, connect_dwallet_client, create_treasury_ix, devnet_rpc,
    finalize_via_dwallet_with_sidecars, load_payer, now_unix, pda, provision_dwallet,
    register_dwallet_ix, send_tx, transfer_dwallet_authority, FinalizeSidecars,
};
use aura_policy::PolicyConfig;
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
            PolicyConfig::default(),
        )],
        &[],
    )?;
    activate_treasury(rpc, payer, treasury, now + 1)?;
    Ok(treasury)
}

/// A trading-desk-style schedule: 30 bps on swaps, volume tiers, capped.
fn trading_schedule() -> FeeScheduleRecord {
    FeeScheduleRecord {
        base_bps: 0,
        per_type_bps: vec![FeeTypeRateRecord {
            tx_type: 1,
            bps: 30,
        }],
        tiers: vec![
            FeeTierRecord {
                threshold_usd: 100_000,
                bps: 20,
            },
            FeeTierRecord {
                threshold_usd: 1_000_000,
                bps: 10,
            },
        ],
        min_fee_usd: 0,
        max_fee_usd: Some(5_000),
        creation_fee_usd: 0,
        subscription_usd_per_period: 0,
        subscription_period_secs: 0,
        aum_bps_per_period: 0,
        fhe_subsidy_bps: 0,
        reputation_discount_bps: 0,
        referral_discount_bps: 0,
        discount_cap_bps: 0,
        integrator_bps: 0,
        owner_surcharge_bps: 0,
    }
}

fn base_schedule(base_bps: u64) -> FeeScheduleRecord {
    FeeScheduleRecord {
        base_bps,
        per_type_bps: Vec::new(),
        tiers: Vec::new(),
        min_fee_usd: 0,
        max_fee_usd: None,
        creation_fee_usd: 0,
        subscription_usd_per_period: 0,
        subscription_period_secs: 0,
        aum_bps_per_period: 0,
        fhe_subsidy_bps: 0,
        reputation_discount_bps: 0,
        referral_discount_bps: 0,
        discount_cap_bps: 0,
        integrator_bps: 0,
        owner_surcharge_bps: 0,
    }
}

fn fetch_schedule(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<FeeScheduleAccount> {
    let info = rpc.get_account(addr)?;
    Ok(FeeScheduleAccount::try_deserialize(
        &mut info.data.as_slice(),
    )?)
}

fn fetch_vault(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<FeeVaultAccount> {
    let info = rpc.get_account(addr)?;
    Ok(FeeVaultAccount::try_deserialize(&mut info.data.as_slice())?)
}

fn fetch_treasury(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<TreasuryAccount> {
    let info = rpc.get_account(addr)?;
    Ok(TreasuryAccount::try_deserialize(&mut info.data.as_slice())?)
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    // [1] fee schedule init + update
    println!("\n[fee models] init_fee_schedule + update_fee_schedule");
    let treasury = create_active_treasury(&rpc, &payer, "mon-fee", seed)?;
    let fee_schedule = pda(&[FEE_SCHEDULE_SEED, treasury.as_ref()], &ID).0;
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::InitFeeSchedule {
                owner,
                treasury,
                fee_schedule,
                protocol_config: None,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitFeeSchedule {
                schedule: trading_schedule(),
                now: seed + 2,
            }
            .data(),
        )],
        &[],
    )?;
    println!("  init_fee_schedule tx: {sig}");
    let stored = fetch_schedule(&rpc, &fee_schedule)?;
    anyhow::ensure!(
        stored
            .schedule
            .per_type_bps
            .iter()
            .any(|r| r.tx_type == 1 && r.bps == 30),
        "swap rate not stored"
    );
    anyhow::ensure!(
        stored.schedule.max_fee_usd == Some(5_000),
        "ceiling not stored"
    );
    println!("  ok schedule stored (swap 30 bps, tiers, $5000 cap)");

    let mut updated = trading_schedule();
    updated.base_bps = 7;
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::UpdateFeeSchedule {
                owner,
                treasury,
                fee_schedule,
                protocol_config: None,
            }
            .to_account_metas(None),
            instruction::UpdateFeeSchedule {
                schedule: updated,
                now: seed + 3,
            }
            .data(),
        )],
        &[],
    )?;
    println!("  update_fee_schedule tx: {sig}");
    anyhow::ensure!(
        fetch_schedule(&rpc, &fee_schedule)?.schedule.base_bps == 7,
        "base not updated"
    );
    println!("  ok base rate updated to 7 bps");

    // [2] prepaid vault: deposit + splits + withdraw
    println!("\n[accrual] init_fee_vault + deposit_fees + set_fee_splits + withdraw_unused_fees");
    let fee_vault = pda(&[FEE_VAULT_SEED, treasury.as_ref()], &ID).0;
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::InitFeeVault {
                owner,
                treasury,
                fee_vault,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::InitFeeVault {
                protocol_fee_recipient: owner,
                now: seed + 4,
            }
            .data(),
        )],
        &[],
    )?;
    println!("  init_fee_vault tx: {sig}");

    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageFeeVault {
                owner,
                treasury,
                fee_vault,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::DepositFees { amount: 1_000_000 }.data(),
        )],
        &[],
    )?;
    println!("  deposit_fees tx: {sig}");
    anyhow::ensure!(
        fetch_vault(&rpc, &fee_vault)?.fee_balance == 1_000_000,
        "balance not credited"
    );
    println!("  ok prepaid balance = 1_000_000 lamports");

    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageFeeVault {
                owner,
                treasury,
                fee_vault,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::SetFeeSplits {
                splits: vec![FeeSplitRecord {
                    recipient: owner,
                    share_bps: 10_000,
                    role: 0,
                }],
                low_balance_mode: 0,
            }
            .data(),
        )],
        &[],
    )?;
    println!("  set_fee_splits tx: {sig}");
    anyhow::ensure!(
        fetch_vault(&rpc, &fee_vault)?.splits.len() == 1,
        "split not stored"
    );

    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageFeeVault {
                owner,
                treasury,
                fee_vault,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::WithdrawUnusedFees { amount: 400_000 }.data(),
        )],
        &[],
    )?;
    println!("  withdraw_unused_fees tx: {sig}");
    anyhow::ensure!(
        fetch_vault(&rpc, &fee_vault)?.fee_balance == 600_000,
        "withdraw not applied"
    );
    println!("  ok withdrew 400_000; prepaid balance = 600_000");

    // [3] billing template fork + apply
    println!("\n[billing] create_billing_template (fork Payroll) + apply_billing_template");
    let billing_id = seed as u64;
    let billing_template = pda(
        &[
            BILLING_TEMPLATE_SEED,
            owner.as_ref(),
            &billing_id.to_le_bytes(),
        ],
        &ID,
    )
    .0;
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CreateBillingTemplate {
                owner,
                billing_template,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::CreateBillingTemplate {
                args: CreateBillingTemplateArgs {
                    template_id: billing_id,
                    name: "payroll".to_string(),
                    description: "monthly payroll billing".to_string(),
                    shared: false,
                    source_kind: Some(1), // Payroll
                    schedule: None,
                    now: seed + 5,
                },
            }
            .data(),
        )],
        &[],
    )?;
    println!("  create_billing_template tx: {sig}");

    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ApplyBillingTemplate {
                owner,
                treasury,
                billing_template,
                fee_schedule,
                protocol_config: None,
            }
            .to_account_metas(None),
            instruction::ApplyBillingTemplate { now: seed + 6 }.data(),
        )],
        &[],
    )?;
    println!("  apply_billing_template tx: {sig}");
    anyhow::ensure!(
        fetch_schedule(&rpc, &fee_schedule)?
            .schedule
            .subscription_usd_per_period
            == 50,
        "payroll subscription not applied"
    );
    println!("  ok payroll billing applied (subscription = 50)");

    // [4] org profile: policy + billing in one call
    println!("\n[org profile] create_policy_template + apply_org_profile");
    let policy_id = seed as u64;
    let policy_template = pda(
        &[
            POLICY_TEMPLATE_SEED,
            owner.as_ref(),
            &policy_id.to_le_bytes(),
        ],
        &ID,
    )
    .0;
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CreatePolicyTemplate {
                owner,
                policy_template,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::CreatePolicyTemplate {
                args: CreatePolicyTemplateArgs {
                    template_id: policy_id,
                    name: "payroll-policy".to_string(),
                    description: "payroll policy posture".to_string(),
                    shared: false,
                    source_preset: Some(7), // PayrollSweep
                    config: None,
                    now: seed + 7,
                },
            }
            .data(),
        )],
        &[],
    )?;
    println!("  create_policy_template tx: {sig}");

    let before = fetch_treasury(&rpc, &treasury)?.current_policy_version;
    let sig = send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ApplyOrgProfile {
                owner,
                treasury,
                policy_template,
                billing_template,
                fee_schedule,
                protocol_config: None,
            }
            .to_account_metas(None),
            instruction::ApplyOrgProfile { now: seed + 8 }.data(),
        )],
        &[],
    )?;
    println!("  apply_org_profile tx: {sig}");
    anyhow::ensure!(
        fetch_treasury(&rpc, &treasury)?.current_policy_version > before,
        "policy version not bumped by org profile"
    );
    println!("  ok org profile applied policy + billing in one call");

    // [5] execute-time accrual through a live dWallet finalization
    println!("\n[live accrual] finalize_execution accrues scheduled fees");
    let mut dwallet_client = connect_dwallet_client().await?;
    let dwallet_program: Pubkey = aura_core::DWALLET_DEVNET_PROGRAM_ID.parse()?;
    let live = provision_dwallet(&rpc, &payer, &mut dwallet_client, &dwallet_program).await?;
    transfer_dwallet_authority(&rpc, &payer, &dwallet_program, &live.dwallet_pda)?;

    let accrual_treasury = create_active_treasury(&rpc, &payer, "mon-accrue", seed + 20)?;
    send_tx(
        &rpc,
        &payer,
        vec![register_dwallet_ix(
            &payer,
            accrual_treasury,
            &live,
            seed + 21,
        )],
        &[],
    )?;

    let accrual_schedule = pda(&[FEE_SCHEDULE_SEED, accrual_treasury.as_ref()], &ID).0;
    let accrual_vault = pda(&[FEE_VAULT_SEED, accrual_treasury.as_ref()], &ID).0;
    let amount_usd = 100u64;
    let prepaid_amount = 10_000u64;
    send_tx(
        &rpc,
        &payer,
        vec![
            ix(
                accounts::InitFeeVault {
                    owner,
                    treasury: accrual_treasury,
                    fee_vault: accrual_vault,
                    system_program: SYSTEM_PROGRAM_ID,
                }
                .to_account_metas(None),
                instruction::InitFeeVault {
                    protocol_fee_recipient: owner,
                    now: seed + 22,
                }
                .data(),
            ),
            ix(
                accounts::InitFeeSchedule {
                    owner,
                    treasury: accrual_treasury,
                    fee_schedule: accrual_schedule,
                    protocol_config: None,
                    system_program: SYSTEM_PROGRAM_ID,
                }
                .to_account_metas(None),
                instruction::InitFeeSchedule {
                    schedule: base_schedule(10_000),
                    now: seed + 22,
                }
                .data(),
            ),
        ],
        &[],
    )?;
    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ManageFeeVault {
                owner,
                treasury: accrual_treasury,
                fee_vault: accrual_vault,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::DepositFees {
                amount: prepaid_amount,
            }
            .data(),
        )],
        &[],
    )?;

    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::ProposeTransaction {
                ai_authority: owner,
                treasury: accrual_treasury,
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
            instruction::ProposeTransaction {
                args: ProposeTransactionArgs {
                    amount_usd,
                    target_chain: 2,
                    tx_type: 0,
                    protocol_id: None,
                    current_timestamp: seed + 23,
                    expected_output_usd: Some(amount_usd),
                    actual_output_usd: Some(amount_usd),
                    quote_age_secs: Some(30),
                    counterparty_risk_score: Some(10),
                    recipient_or_contract: owner.to_string(),
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
                },
            }
            .data(),
        )],
        &[],
    )?;
    anyhow::ensure!(
        fetch_treasury(&rpc, &accrual_treasury)?
            .pending_queue
            .first()
            .map(|pending| pending.decision.approved)
            .unwrap_or(false),
        "fee-accrual proposal was not approved"
    );

    finalize_via_dwallet_with_sidecars(
        &rpc,
        &payer,
        &mut dwallet_client,
        accrual_treasury,
        &dwallet_program,
        &live,
        seed + 24,
        FinalizeSidecars {
            fee_vault: Some(accrual_vault),
            fee_schedule: Some(accrual_schedule),
            ..FinalizeSidecars::default()
        },
    )
    .await?;
    let vault = fetch_vault(&rpc, &accrual_vault)?;
    anyhow::ensure!(
        vault.accumulated_fees_lamports == amount_usd,
        "expected {amount_usd} accrued fees, got {}",
        vault.accumulated_fees_lamports
    );
    anyhow::ensure!(
        vault.fee_balance == prepaid_amount - amount_usd,
        "prepaid balance not debited by accrued fee"
    );
    println!("  ok finalize accrued {amount_usd} from prepaid fee balance");

    send_tx(
        &rpc,
        &payer,
        vec![ix(
            accounts::CollectFees {
                protocol_authority: owner,
                fee_vault: accrual_vault,
                recipient: owner,
            }
            .to_account_metas(None),
            instruction::CollectFees { now: seed + 25 }.data(),
        )],
        &[],
    )?;
    let vault = fetch_vault(&rpc, &accrual_vault)?;
    anyhow::ensure!(
        vault.accumulated_fees_lamports == 0,
        "collect_fees did not clear accrued bucket"
    );
    anyhow::ensure!(vault.fee_count == 1, "collect_fees did not increment count");
    println!("  ok collect_fees swept accrued bucket");

    println!(
        "\nfee models + accrual + billing template + org profile smoke checks passed on devnet."
    );
    Ok(())
}
