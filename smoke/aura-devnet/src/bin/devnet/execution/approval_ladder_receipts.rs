//! Devnet smoke checks for approval ladders and policy receipts.
//!
//! Configures a Guardian-level approval ladder, proposes a real public
//! transaction, satisfies the pending approval with the owner, then persists a
//! policy receipt over the same pending proposal.

use anchor_lang::system_program::ID as SYSTEM_PROGRAM_ID;
use anchor_lang::{AccountDeserialize, InstructionData, ToAccountMetas};
use aura_core::{
    accounts, instruction, ApprovePendingExecutionArgs, ConfigureApprovalLadderArgs,
    PolicyReceiptAccount, ProposeTransactionArgs, WritePolicyReceiptArgs, ID,
};
use aura_devnet::{
    activate_treasury, create_treasury_ix, devnet_rpc, fetch_treasury_domain, load_payer, now_unix,
    pda, send_tx,
};
use aura_policy::ApprovalLevel;
use solana_client::rpc_client::RpcClient;
use solana_sdk::{
    instruction::{AccountMeta, Instruction},
    pubkey::Pubkey,
    signature::{Keypair, Signer},
};

const ETH: u8 = 1;
const TRANSFER: u8 = 0;
const RECIPIENT: &str = "0x0000000000000000000000000000000000000abc";

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

fn fetch_receipt(rpc: &RpcClient, addr: &Pubkey) -> anyhow::Result<PolicyReceiptAccount> {
    let info = rpc.get_account(addr)?;
    Ok(PolicyReceiptAccount::try_deserialize(
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

fn configure_ladder(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ConfigureApprovalLadder {
                owner: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            instruction::ConfigureApprovalLadder {
                args: ConfigureApprovalLadderArgs {
                    guardian_above_usd: 50,
                    multisig_above_usd: 500,
                    timelock_above_usd: 1_000,
                    deny_above_usd: 10_000,
                    risk_guardian_bps: 5_000,
                    risk_multisig_bps: 7_500,
                    risk_timelock_bps: 9_000,
                    timelock_secs: 60,
                    now,
                },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn propose_guarded(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
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
                budget_envelope: None,
                exposure_group: None,
                dwallet_state: None,
                chain_profile: None,
                trust_identity: None,
                policy_canary: None,
            }
            .to_account_metas(None),
            instruction::ProposeTransaction {
                args: proposal_args(now, 100),
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn approve_pending(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    proposal_id: u64,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::ApprovePendingExecution {
                approver: payer.pubkey(),
                treasury,
            }
            .to_account_metas(None),
            instruction::ApprovePendingExecution {
                args: ApprovePendingExecutionArgs {
                    proposal_id,
                    approval_level: ApprovalLevel::Guardian.code(),
                    now,
                },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn write_receipt(
    rpc: &RpcClient,
    payer: &Keypair,
    treasury: Pubkey,
    receipt: Pubkey,
    proposal_id: u64,
    now: i64,
) -> anyhow::Result<()> {
    send_tx(
        rpc,
        payer,
        vec![ix(
            accounts::WritePolicyReceipt {
                payer: payer.pubkey(),
                treasury,
                receipt,
                attestation: None,
                system_program: SYSTEM_PROGRAM_ID,
            }
            .to_account_metas(None),
            instruction::WritePolicyReceipt {
                args: WritePolicyReceiptArgs { proposal_id, now },
            }
            .data(),
        )],
        &[],
    )
    .map(|_| ())
}

fn main() -> anyhow::Result<()> {
    let payer = load_payer()?;
    let owner = payer.pubkey();
    let rpc = devnet_rpc();
    let seed = now_unix();
    println!("Payer:   {owner}");
    println!("Program: {ID}");

    let treasury = create_active_treasury(&rpc, &payer, "approval-receipt", seed)?;

    println!("\n[approval ladder] configure guardian threshold");
    configure_ladder(&rpc, &payer, treasury, seed + 2)?;
    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    anyhow::ensure!(
        domain
            .policy_config
            .approval_ladder
            .is_some_and(|ladder| ladder.guardian_above_usd == 50),
        "approval ladder was not configured"
    );
    let configured_policy_version = domain.current_policy_version;
    println!("  ok approval ladder configured");

    println!("\n[pending proposal] guarded amount requires approval");
    propose_guarded(&rpc, &payer, treasury, seed + 3)?;
    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    let pending = domain
        .pending_queue
        .last()
        .ok_or_else(|| anyhow::anyhow!("proposal did not create pending state"))?;
    anyhow::ensure!(
        pending.amount_usd == 100
            && pending.decision.approved
            && pending.required_approval_level == ApprovalLevel::Guardian.code()
            && pending.satisfied_approval_level == ApprovalLevel::None.code(),
        "pending proposal did not record guardian approval requirement"
    );
    let proposal_id = pending.proposal_id;
    let pending_policy_version = pending.policy_version;
    println!("  ok proposal {proposal_id} requires Guardian approval");

    println!("\n[approval] owner approval satisfies the pending requirement");
    approve_pending(&rpc, &payer, treasury, proposal_id, seed + 4)?;
    let domain = fetch_treasury_domain(&rpc, &treasury)?;
    let approved = domain
        .pending_queue
        .iter()
        .find(|pending| pending.proposal_id == proposal_id)
        .ok_or_else(|| anyhow::anyhow!("approved pending proposal missing"))?;
    anyhow::ensure!(
        approved.satisfied_approval_level >= approved.required_approval_level
            && approved.approvals.len() == 1,
        "owner approval did not satisfy pending proposal"
    );
    println!("  ok approval recorded on pending proposal");

    println!("\n[policy receipt] snapshot approved pending proposal");
    let proposal_id_bytes = proposal_id.to_le_bytes();
    let receipt = pda(
        &[
            b"policy_receipt",
            treasury.as_ref(),
            proposal_id_bytes.as_ref(),
        ],
        &ID,
    )
    .0;
    write_receipt(&rpc, &payer, treasury, receipt, proposal_id, seed + 5)?;
    let receipt = fetch_receipt(&rpc, &receipt)?;
    anyhow::ensure!(receipt.treasury == treasury, "receipt treasury mismatch");
    anyhow::ensure!(
        receipt.proposal_id == proposal_id,
        "receipt proposal id mismatch"
    );
    anyhow::ensure!(
        receipt.policy_version == pending_policy_version
            && receipt.policy_version == configured_policy_version,
        "receipt policy version mismatch"
    );
    anyhow::ensure!(receipt.decision == 1, "receipt decision should be approved");
    anyhow::ensure!(
        receipt.primary_violation == 0,
        "receipt violation should be None"
    );
    anyhow::ensure!(
        receipt.required_approval_level == ApprovalLevel::Guardian.code()
            && receipt.satisfied_approval_level >= receipt.required_approval_level,
        "receipt approval levels mismatch"
    );
    anyhow::ensure!(
        receipt.evaluated_amount_usd == 100
            && receipt.aggregate_amount_usd == 100
            && receipt.batch_item_count == 1,
        "receipt amount fields mismatch"
    );
    anyhow::ensure!(!receipt.policy_attested, "receipt should be unattested");
    println!("  ok policy receipt persisted for proposal {proposal_id}");

    println!("\napproval-ladder receipt smoke checks passed on devnet.");
    Ok(())
}
